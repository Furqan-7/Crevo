import type { Metadata, Viewport } from "next";
import { siteOrigin } from "@/lib/site";
import "@/src/styles/base.css";
import "@/src/styles/shared.css";

export const metadata: Metadata = {
  // Makes the preview image and canonical links absolute (SITE_URL, else
  // Vercel's production domain, else localhost for local builds).
  metadataBase: new URL(siteOrigin()),
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
      <body>{children}</body>
    </html>
  );
}
