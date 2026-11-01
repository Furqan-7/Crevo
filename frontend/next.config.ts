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
};

export default nextConfig;
