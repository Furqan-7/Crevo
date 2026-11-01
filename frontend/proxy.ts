import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before every /dashboard request: refreshes the Supabase session (an
// expired access token is swapped using the refresh token, and the new
// cookies go out with the response) and sends signed-out visitors to
// sign-in. Server components can read cookies but not write them, which is
// why the refresh happens here.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.redirect(new URL("/auth/signin?notice=auth-unavailable", request.url));

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
  if (!data?.claims) {
    const signIn = new URL("/auth/signin", request.url);
    return NextResponse.redirect(signIn);
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
