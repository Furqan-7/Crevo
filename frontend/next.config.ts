import type { NextConfig } from "next";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// The pnpm workspace root. pnpm links packages from there, so the bundler and
// file tracing have to see the whole workspace.
const workspace = join(here, "..");

const nextConfig: NextConfig = {
  turbopack: { root: workspace },
  outputFileTracingRoot: workspace,
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
