import type { Metadata, Viewport } from "next";
import "@/src/styles/base.css";
import "@/src/styles/shared.css";
import "@/src/styles/reveal.css";
import ScrollReveal from "@/src/components/ScrollReveal";
import SiteInteractions from "@/src/components/SiteInteractions";

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/assets/img/44d0d9b5421a4c6d.png", media: "(prefers-color-scheme: light)" },
      { url: "/assets/img/e3d88f812481c013.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/assets/img/4664e7161a9e34c5.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ScrollReveal />
        <SiteInteractions />
        <noscript>
          <style>{"[data-scroll-reveal]{opacity:1}"}</style>
        </noscript>
      </body>
    </html>
  );
}
