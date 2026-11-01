import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/src/auth/supabase";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

// Preview of the morning briefing email, rendered by the API from the
// signed-in creator's workspace (the same HTML the daily email uses):
// /dashboard/email/briefing?time=8:00&sections=todo,inbox&name=Maya[&format=text]
export async function GET(request: NextRequest) {
  const supabase = await serverSupabase();
  const { data } = supabase ? await supabase.auth.getClaims() : { data: null };
  const token = data?.claims ? (await supabase!.auth.getSession()).data.session?.access_token : undefined;
  if (!token) return NextResponse.redirect(new URL("/auth/signin", request.url), 303);

  const params = new URLSearchParams();
  for (const key of ["time", "name", "sections"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) params.set(key, value);
  }
  const format = request.nextUrl.searchParams.get("format") === "text" ? "text" : "html";
  params.set("format", format);

  const response = await fetch(`${API_URL}/api/briefing/preview?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) {
    return new NextResponse("Couldn't load your workspace for the preview. Try again in a moment.", { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(await response.text(), {
    headers: { "content-type": format === "text" ? "text/plain; charset=utf-8" : "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  });
}
