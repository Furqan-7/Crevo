import type { Metadata } from "next";

// Shown only when code calls notFound() outside the dashboard (which has its
// own). Next.js embeds this component in every page's data, so it stays tiny;
// the full Crevo 404 page for unknown addresses is app/global-not-found.tsx.
export const metadata: Metadata = { title: "Page Not Found — Crevo", robots: { index: false } };

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: '"Inter", system-ui, sans-serif', color: "#181818", background: "#f9f9f9" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#686868", margin: 0 }}>[ 404 ]</p>
        <h1 style={{ fontSize: 40, letterSpacing: "-0.03em", margin: "12px 0" }}>Page not found</h1>
        <p style={{ color: "#686868", margin: "0 0 24px" }}>This page doesn&apos;t exist.</p>
        <a href="/" style={{ display: "inline-block", padding: "12px 20px", background: "#181818", color: "#fff", textDecoration: "none" }}>
          Back to Crevo
        </a>
      </div>
    </main>
  );
}
