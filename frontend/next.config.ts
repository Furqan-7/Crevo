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

// The landing page (app/route.ts) is Framer's export and runs Framer's
// runtime from framerusercontent.com, which also loads its fonts, images and
// data from there. It gets its own, looser policy; every other page keeps the
// strict one above.
const landingCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://framerusercontent.com https://*.framerusercontent.com https://events.framer.com https://app.framerstatic.com",
  "style-src 'self' 'unsafe-inline' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' mailto:",
  // Only the landing page may be embedded, and only by the owner's portfolio,
  // which shows it as a live preview on its project card.
  "frame-ancestors 'self' https://furqan7.dev https://www.furqan7.dev",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// The landing page gets the same headers minus X-Frame-Options (which cannot name
// an allowed site); its Content-Security-Policy frame-ancestors decides instead.
const landingHeaders = [
  { key: "Content-Security-Policy", value: landingCsp },
  ...securityHeaders.filter((h) => h.key !== "Content-Security-Policy" && h.key !== "X-Frame-Options"),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Unknown addresses get app/global-not-found.tsx, rendered only for them,
  // instead of embedding the full 404 page in every page (see that file).
  experimental: { globalNotFound: true },
  turbopack: { root: workspace },
  outputFileTracingRoot: workspace,
  async headers() {
    return [
      // Every page except the landing page: strict policy, never embeddable.
      { source: "/:path+", headers: securityHeaders },
      { source: "/", headers: landingHeaders },
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
