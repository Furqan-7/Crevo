import { readFileSync } from "node:fs";
import { join } from "node:path";

// The landing page (/) is the Framer-exported page from the Verseo project,
// rebranded to Crevo (landing/index.html). Its scroll animations, the hero's
// sky and clouds and the "How it works" background are drawn by Framer's
// runtime, which the page loads from framerusercontent.com; public/crevo-copy.js
// keeps the Crevo wording on the page after that runtime re-renders it.
// next.config.ts allows those scripts on this page only.
export const dynamic = "force-static";

export function GET() {
  const html = readFileSync(join(process.cwd(), "landing", "index.html"), "utf8");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
