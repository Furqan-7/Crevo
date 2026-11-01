import { prisma } from "db";
import { env, features } from "../config/env";
import { AppError } from "../utils/AppError";
import { decrypt, encrypt } from "../utils/crypto";

// Google OAuth for Gmail, Calendar and YouTube, and an authorised fetch
// that refreshes the access token when it expires. One connection per
// creator; connecting another product adds its scopes to the same grant.

export type GoogleProduct = "gmail" | "calendar" | "youtube";

export const SCOPES: Record<GoogleProduct, string[]> = {
  // Read mail, and save approved replies as drafts (never send).
  gmail: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  // Channel stats and comments, replying to comments, uploading Shorts.
  youtube: [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.upload",
  ],
};

export const callbackUrl = () => `${env.apiUrl}/integrations/google/callback`;

export function requireGoogle() {
  if (!features.google) throw new AppError(503, "GOOGLE_NOT_CONFIGURED", "Google sign-in for Gmail, Calendar and YouTube isn't set up on this server yet.");
}

export function authUrl(product: GoogleProduct, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: ["openid", "email", ...SCOPES[product]].join(" "),
    access_type: "offline",
    // Always ask, so Google returns a refresh token even on a second connect.
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) throw new GoogleAuthError(data.error === "invalid_grant" ? "revoked" : "failed", data.error_description ?? data.error ?? `status ${res.status}`);
  return data;
}

export class GoogleAuthError extends Error {
  constructor(
    public readonly kind: "revoked" | "failed",
    message: string,
  ) {
    super(message);
  }
}

// Swaps the code from the consent screen for tokens and stores them.
export async function connect(userId: string, code: string): Promise<{ email: string; scopes: string[] }> {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: callbackUrl() });
  const claims = tokens.id_token ? (JSON.parse(Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string }) : {};
  const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);
  const existing = await prisma.googleConnection.findUnique({ where: { profileId: userId } });
  const refresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refreshTokenEnc;
  if (!refresh) throw new GoogleAuthError("failed", "Google didn't return a refresh token");
  const data = {
    googleEmail: claims.email ?? existing?.googleEmail ?? "",
    scopes: [...new Set([...(existing?.scopes ?? []), ...scopes])],
    refreshTokenEnc: refresh,
    accessTokenEnc: encrypt(tokens.access_token),
    accessExpiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000),
  };
  await prisma.googleConnection.upsert({ where: { profileId: userId }, create: { profileId: userId, ...data }, update: data });
  return { email: data.googleEmail, scopes: data.scopes };
}

export async function hasScopes(userId: string, product: GoogleProduct) {
  const conn = await prisma.googleConnection.findUnique({ where: { profileId: userId }, select: { scopes: true } });
  return Boolean(conn && SCOPES[product].every((s) => conn.scopes.includes(s)));
}

export async function accessToken(userId: string): Promise<string> {
  const conn = await prisma.googleConnection.findUnique({ where: { profileId: userId } });
  if (!conn) throw new GoogleAuthError("revoked", "not connected");
  if (conn.accessTokenEnc && conn.accessExpiresAt && conn.accessExpiresAt > new Date()) return decrypt(conn.accessTokenEnc);
  const tokens = await tokenRequest({ refresh_token: decrypt(conn.refreshTokenEnc), grant_type: "refresh_token" });
  await prisma.googleConnection.update({
    where: { profileId: userId },
    data: { accessTokenEnc: encrypt(tokens.access_token), accessExpiresAt: new Date(Date.now() + (tokens.expires_in - 60) * 1000) },
  });
  return tokens.access_token;
}

export class GoogleApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// fetch with the creator's Google token; JSON in and out.
export async function googleFetch<T>(userId: string, url: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: boolean } = {}): Promise<T> {
  const token = await accessToken(userId);
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}), ...init.headers },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (res.status === 401) {
    // The token was revoked from the Google side.
    await prisma.googleConnection.update({ where: { profileId: userId }, data: { accessTokenEnc: null, accessExpiresAt: null } });
    throw new GoogleAuthError("revoked", "Google rejected the token");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) throw new GoogleApiError(res.status, `${res.status} ${url.split("?")[0]}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function revoke(userId: string) {
  const conn = await prisma.googleConnection.findUnique({ where: { profileId: userId } });
  if (!conn) return;
  // Best effort: the grant is removed here either way.
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: decrypt(conn.refreshTokenEnc) }),
  }).catch(() => undefined);
  await prisma.googleConnection.delete({ where: { profileId: userId } });
}
