import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// Supabase Auth for server code (pages, server actions, route handlers). The
// session lives in Supabase's own cookies, written by @supabase/ssr.

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** A Supabase client bound to this request's cookies, or null when the
 *  Supabase env vars aren't set. Cookie writes work in server actions and
 *  route handlers; in server components they are skipped. */
export async function serverSupabase() {
  const env = supabaseEnv();
  if (!env) return null;
  const store = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a server component, which can't set cookies.
        }
      },
    },
  });
}

/** This site's public origin, for links Supabase sends people back to
 *  (email links and Google). APP_URL overrides it behind a proxy. Every
 *  resulting URL must be listed under Authentication › URL Configuration ›
 *  Redirect URLs in Supabase. */
export async function appOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only same-site paths, so a link can't bounce people to another site. */
export function safeNext(value: string | null | undefined, fallback = "/dashboard"): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
