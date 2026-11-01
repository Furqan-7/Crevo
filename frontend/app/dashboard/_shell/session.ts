import { redirect } from "next/navigation";
import { serverSupabase } from "@/src/auth/supabase";

// Sends signed-out visitors to sign-in. proxy.ts already does this for
// every /dashboard request; this check keeps each page safe on its own.
export async function requireSession() {
  const supabase = await serverSupabase();
  const { data } = supabase ? await supabase.auth.getClaims() : { data: null };
  if (!data?.claims) redirect("/auth/signin");
}
