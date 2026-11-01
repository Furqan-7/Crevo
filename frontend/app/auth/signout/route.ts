import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/src/auth/supabase";

// Ends the Supabase session on this device and clears its cookies.
export async function GET(request: NextRequest) {
  const supabase = await serverSupabase();
  await supabase?.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/auth/signin", request.url), 303);
}
