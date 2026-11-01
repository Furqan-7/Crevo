import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/src/auth/supabase";

// Google (via Supabase) sends the visitor back here with ?code=. Trading the
// code for a session sets the session cookies.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);
  if (params.get("error")) return to(`/auth/signin?notice=${params.get("error") === "access_denied" ? "google-cancelled" : "google-failed"}`);

  const code = params.get("code");
  const supabase = await serverSupabase();
  if (!supabase) return to("/auth/signin?notice=auth-unavailable");
  if (!code) return to("/auth/signin?notice=google-failed");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? to("/auth/signin?notice=google-failed") : to("/dashboard");
}
