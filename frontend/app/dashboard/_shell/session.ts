import { redirect } from "next/navigation";
import { serverSupabase } from "@/src/auth/supabase";

// Sends signed-out visitors to sign-in. proxy.ts already does this for
// every /dashboard request; this check keeps each page safe on its own.
export async function requireSession() {
  const supabase = await serverSupabase();
  // From the cookies, without a network call (see proxy.ts): the API checks
  // the token itself on every data request.
  const { data } = supabase ? await supabase.auth.getSession() : { data: null };
  if (!data?.session?.access_token) redirect("/auth/signin");
}
