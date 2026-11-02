import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { AppError } from "../utils/AppError";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Verified tokens, remembered briefly. With Supabase's shared-secret (HS256)
// tokens, getClaims can't check the signature itself and asks Supabase on
// every call, a network round trip for each of the ~9 requests a dashboard
// load makes. A token verified once is trusted again until it's close to
// expiring, for at most CACHE_MS. Keyed by a hash, so tokens aren't kept.
type Claims = Record<string, unknown> & { sub?: unknown; role?: unknown; email?: unknown; exp?: unknown; user_metadata?: unknown };
const CACHE_MS = 5 * 60_000;
const MAX_ENTRIES = 5_000;
const verified = new Map<string, { claims: Claims; until: number }>();
const keyOf = (token: string) => createHash("sha256").update(token).digest("base64url");

async function verify(token: string): Promise<Claims | null> {
  const key = keyOf(token);
  const hit = verified.get(key);
  if (hit && hit.until > Date.now()) return hit.claims;
  if (hit) verified.delete(key);
  // getClaims throws (rather than returning an error) on tokens that
  // aren't well-formed JWTs; both cases are the same 401 to the client.
  const result = await supabase.auth.getClaims(token).catch(() => null);
  const claims = result && !result.error ? ((result.data?.claims ?? null) as Claims | null) : null;
  if (!claims) return null;
  const exp = typeof claims.exp === "number" ? claims.exp * 1000 : 0;
  const until = Math.min(Date.now() + CACHE_MS, exp - 30_000);
  if (until > Date.now()) {
    if (verified.size >= MAX_ENTRIES) verified.delete(verified.keys().next().value!);
    verified.set(key, { claims, until });
  }
  return claims;
}

// Verifies the Supabase access token sent as "Authorization: Bearer <token>"
// and puts the user's id and email on res.locals. Handlers only ever take
// the user from here, never from the request body or URL.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Sign in to continue");
  }

  const claims = await verify(token);
  if (!claims || claims.role !== "authenticated" || typeof claims.sub !== "string" || !UUID.test(claims.sub)) {
    throw new AppError(401, "INVALID_TOKEN", "Your session has expired. Sign in again.");
  }

  res.locals.userId = claims.sub;
  res.locals.email = typeof claims.email === "string" ? claims.email : "";
  // Sign-up stores full_name; Google sign-in provides full_name or name.
  const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
  const name = meta.full_name ?? meta.name;
  res.locals.name = typeof name === "string" ? name.trim().slice(0, 80) : "";
  next();
}
