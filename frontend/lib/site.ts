import type { Metadata } from "next";

/** The public origin, used to make canonical and og:url absolute. Set SITE_URL
 *  to your domain; on Vercel it falls back to the production domain. */
function siteUrl(): URL | undefined {
  const raw = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const value = raw || (vercel ? `https://${vercel}` : "");
  if (!value) return undefined;
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    return undefined;
  }
}

const OG_IMAGE = "/assets/img/crevo-hero-2048.webp";

/** Shared page metadata: title, description, Open Graph and Twitter cards. */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    metadataBase: siteUrl(),
    title,
    description,
    alternates: { canonical: path },
    robots: { "max-image-preview": "large" },
    openGraph: { type: "website", url: path, title, description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE] },
  };
}
