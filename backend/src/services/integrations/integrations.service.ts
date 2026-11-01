import { prisma, type Provider } from "db";
import { env } from "../../config/env";
import { enqueue } from "../../jobs/queue";
import { GoogleAuthError, SCOPES, authUrl, connect, hasScopes, requireGoogle, revoke, type GoogleProduct } from "../../lib/google";
import { badRequest } from "../../utils/AppError";
import { sign, verify } from "../../utils/crypto";
import { errorMessage, logger } from "../../utils/logger";

// Connecting and disconnecting accounts, and kicking off syncs. Gmail,
// Calendar and YouTube go through Google OAuth; Instagram is a CSV import.

export const GOOGLE_PRODUCTS: GoogleProduct[] = ["gmail", "calendar", "youtube"];
const isGoogle = (p: Provider): p is GoogleProduct => (GOOGLE_PRODUCTS as string[]).includes(p);

// Only paths inside the app, so the redirect can't be pointed elsewhere.
const safeReturn = (path: string | undefined) => (path && path.startsWith("/dashboard") && !path.startsWith("//") ? path : "/dashboard/settings?tab=accounts");

export function startGoogleConnect(userId: string, provider: Provider, returnTo?: string) {
  requireGoogle();
  if (!isGoogle(provider)) throw badRequest(`${provider} doesn't connect through Google`, "NOT_GOOGLE");
  const state = sign({ uid: userId, provider, returnTo: safeReturn(returnTo) }, 10 * 60);
  return { url: authUrl(provider, state) };
}

// Google sends the creator back here. Always answers with a redirect to
// the app, carrying ?connected= or ?connect_error=.
export async function finishGoogleConnect(query: { state?: string; code?: string; error?: string }): Promise<string> {
  const state = query.state ? verify<{ uid: string; provider: GoogleProduct; returnTo: string }>(query.state) : null;
  const back = (returnTo: string, key: string, value: string) => `${env.appUrl}${returnTo}${returnTo.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
  if (!state) return back("/dashboard/settings?tab=accounts", "connect_error", "expired");
  if (query.error || !query.code) return back(state.returnTo, "connect_error", query.error === "access_denied" ? "cancelled" : "failed");

  try {
    await connect(state.uid, query.code);
  } catch (err) {
    logger.warn("google connect failed", { error: errorMessage(err) });
    return back(state.returnTo, "connect_error", "failed");
  }
  // The creator can untick permissions on the consent screen.
  if (!(await hasScopes(state.uid, state.provider))) return back(state.returnTo, "connect_error", "permissions");

  await prisma.connectedAccount.upsert({
    where: { profileId_provider: { profileId: state.uid, provider: state.provider } },
    create: { profileId: state.uid, provider: state.provider, status: "connected" },
    update: { status: "connected", lastError: null },
  });
  await enqueue(`sync.${state.provider}`, {}, { profileId: state.uid, key: `sync.${state.provider}:${state.uid}` });
  return back(state.returnTo, "connected", state.provider);
}

export async function disconnect(userId: string, provider: Provider) {
  await prisma.connectedAccount.upsert({
    where: { profileId_provider: { profileId: userId, provider } },
    create: { profileId: userId, provider, status: "disconnected" },
    update: { status: "disconnected", syncCursor: null, lastError: null },
  });
  // Events from Google Calendar stop being kept in step, so they go.
  if (provider === "calendar") await prisma.calendarEvent.deleteMany({ where: { profileId: userId, source: "google" } });
  if (isGoogle(provider)) {
    const stillUsed = await prisma.connectedAccount.count({ where: { profileId: userId, provider: { in: GOOGLE_PRODUCTS }, status: "connected" } });
    if (stillUsed === 0) await revoke(userId);
  }
}

export async function syncNow(userId: string, provider: Provider) {
  if (!isGoogle(provider)) throw badRequest(`${provider} has nothing to sync`, "NO_SYNC");
  const account = await prisma.connectedAccount.findUnique({ where: { profileId_provider: { profileId: userId, provider } } });
  if (account?.status !== "connected" || !(await hasScopes(userId, provider))) throw badRequest(`Connect ${provider} first`, "NOT_CONNECTED");
  await enqueue(`sync.${provider}`, {}, { profileId: userId, key: `sync.${provider}:${userId}` });
}

// Runs a provider sync; records failures on the account, and marks it
// disconnected when Google access was revoked.
export async function runSync(userId: string, provider: GoogleProduct, sync: (uid: string) => Promise<unknown>) {
  try {
    await sync(userId);
  } catch (err) {
    const revoked = err instanceof GoogleAuthError && err.kind === "revoked";
    await prisma.connectedAccount.updateMany({
      where: { profileId: userId, provider },
      data: revoked ? { status: "disconnected", lastError: "Google access was removed. Connect it again." } : { lastError: errorMessage(err).slice(0, 300) },
    });
    if (!revoked) throw err;
  }
}

export const scopesFor = (p: GoogleProduct) => SCOPES[p];
