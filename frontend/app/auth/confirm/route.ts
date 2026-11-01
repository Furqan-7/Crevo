import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext, serverSupabase } from "@/src/auth/supabase";

// Where Supabase's emails link to (sign-up confirmation, password reset).
// Handles both link styles: ?code= (PKCE, the default) and ?token_hash=&type=
// (a customised email template). Either way the visitor ends up signed in
// and is sent on to ?next=.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  const supabase = await serverSupabase();
  if (!supabase) return to("/auth/signin?notice=auth-unavailable");

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };
  return error ? to("/auth/signin?notice=link-expired") : to(next);
}
