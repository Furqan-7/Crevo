import type { NextFunction, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { AppError } from "../utils/AppError";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Verifies the Supabase access token sent as "Authorization: Bearer <token>"
// and puts the user's id and email on res.locals. Handlers only ever take
// the user from here, never from the request body or URL.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Sign in to continue");
  }

  // getClaims throws (rather than returning an error) on tokens that
  // aren't well-formed JWTs; both cases are the same 401 to the client.
  const result = await supabase.auth.getClaims(token).catch(() => null);
  const claims = result?.data?.claims;
  if (!result || result.error || !claims || claims.role !== "authenticated" || typeof claims.sub !== "string" || !UUID.test(claims.sub)) {
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
