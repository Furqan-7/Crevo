import type { Metadata, Viewport } from "next";
import NotFoundPage from "@/src/views/NotFoundPage";
import { pageMetadata, siteOrigin } from "@/lib/site";
import ScrollReveal from "@/src/components/ScrollReveal";
import SiteInteractions from "@/src/components/SiteInteractions";
import "@/src/styles/base.css";
import "@/src/styles/shared.css";
import "@/src/styles/not-found.css";
import "@/src/styles/reveal.css";

// The Crevo 404 page for addresses that match no route. Next.js renders it
// only for those requests (experimental.globalNotFound in next.config.ts), so
// its ~300 KB of markup isn't embedded in every other page the way the root
// not-found.tsx is. It bypasses app/layout.tsx, so it brings its own <html>,
// styles and icons.
export const metadata: Metadata = {
  ...pageMetadata("/404", "Page Not Found — Crevo", "This page doesn't exist. Head back to Crevo."),
  metadataBase: new URL(siteOrigin()),
  alternates: undefined,
  robots: { index: false },
  icons: {
    icon: [
      { url: "/assets/img/44d0d9b5421a4c6d.png", media: "(prefers-color-scheme: light)" },
      { url: "/assets/img/e3d88f812481c013.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/assets/img/4664e7161a9e34c5.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <NotFoundPage />
        <ScrollReveal />
        <SiteInteractions />
      </body>
    </html>
  );
}
