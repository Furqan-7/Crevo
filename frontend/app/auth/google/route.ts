import { NextResponse, type NextRequest } from "next/server";
import { appOrigin, serverSupabase } from "@/src/auth/supabase";

// Starts Google sign-in through Supabase (PKCE): Supabase keeps the code
// verifier in a cookie, sends the visitor to Google, then back to
// /auth/google/callback. Google must be enabled under Authentication ›
// Providers in Supabase.
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") === "signup" ? "/auth/signup" : "/auth/signin";
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  const supabase = await serverSupabase();
  if (!supabase) return to(`${from}?notice=auth-unavailable`);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${await appOrigin()}/auth/google/callback`,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) return to(`${from}?notice=google-failed`);
  return NextResponse.redirect(data.url, 303);
}
