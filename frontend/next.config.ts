import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// The pnpm workspace root. pnpm links packages from there, so the bundler and
// file tracing have to see the whole workspace.
const workspace = join(here, "..");

// Origins the browser may contact besides this site: Supabase (sign-in,
// uploads) and the Crevo API. Read at build time from the same env vars the
// app uses, so local development (http://localhost:4000) keeps working.
const origin = (value?: string) => {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
};
const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const api = origin(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");
const dev = process.env.NODE_ENV !== "production";

// Content Security Policy. Inline scripts and styles stay allowed because
// Next.js and the page sections use them; everything else is limited to this
// site plus Supabase and the API. frame-ancestors stops other sites from
// embedding Crevo in a frame (clickjacking).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https:`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabase} ${supabase.replace(/^http/, "ws")} ${api}${dev ? " ws: http://localhost:*" : ""}`.replace(/\s+/g, " ").trim(),
  `media-src 'self' blob: ${supabase} ${api}`.replace(/\s+/g, " ").trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' mailto:",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: workspace },
  outputFileTracingRoot: workspace,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Images and fonts under public/assets. Some keep their name when edited
      // (crevo-hero-*.webp), so they are cached for a week, not forever.
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
  // Short addresses people type for the auth pages, which live under /auth.
  async redirects() {
    const to = (destination: string, sources: string[]) =>
      sources.map((source) => ({ source, destination, permanent: false }));
    return [
      ...to("/auth/signin", ["/signin", "/sign-in", "/login", "/log-in", "/auth", "/auth/login"]),
      ...to("/auth/signup", ["/signup", "/sign-up", "/register", "/join", "/auth/register"]),
      ...to("/auth/forgot", ["/forgot-password", "/reset-password"]),
      ...to("/auth/signout", ["/signout", "/sign-out", "/logout", "/log-out"]),
    ];
  },
};

export default nextConfig;
