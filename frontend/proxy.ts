import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before /dashboard, /auth/signin and /auth/signup requests (and / for
// sign-in links): refreshes the Supabase session (an expired access token is
// swapped using the refresh token, and the new cookies go out with the
// response), sends signed-out visitors from /dashboard to sign-in, and sends
// signed-in visitors from sign-in and sign-up to the dashboard. Server components can read cookies but not write them, which is
// why the refresh happens here.
export async function proxy(request: NextRequest) {
  // Supabase sends people to the Site URL (this site's home page) with
  // ?code= when the redirect it was asked for isn't on its Redirect URLs
  // list. Finish the sign-in at /auth/confirm instead of leaving them
  // signed out on the landing page.
  if (request.nextUrl.pathname === "/") {
    const params = request.nextUrl.searchParams;
    if (params.has("code") || params.has("token_hash")) {
      const confirm = new URL("/auth/confirm", request.url);
      params.forEach((value, key) => confirm.searchParams.set(key, value));
      if (!confirm.searchParams.has("next")) confirm.searchParams.set("next", "/dashboard");
      return NextResponse.redirect(confirm);
    }
    if (params.has("error_description")) {
      return NextResponse.redirect(new URL("/auth/signin?notice=link-expired", request.url));
    }
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authPage = request.nextUrl.pathname.startsWith("/auth/");
  if (!url || !anonKey) {
    return authPage ? NextResponse.next() : NextResponse.redirect(new URL("/auth/signin?notice=auth-unavailable", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims verifies the token (and refreshes it first when it's about to expire).
  const { data } = await supabase.auth.getClaims();

  // Sign-in and sign-up: someone already signed in (e.g. coming back through
  // the landing page's Get started buttons) goes straight to the dashboard
  // instead of seeing the form as if they'd been signed out.
  if (authPage) {
    if (!data?.claims) return response;
    const next = request.nextUrl.searchParams.get("next");
    const to = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    const redirect = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (!data?.claims) {
    const signIn = new URL("/auth/signin", request.url);
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/auth/signin", "/auth/signup"],
};
