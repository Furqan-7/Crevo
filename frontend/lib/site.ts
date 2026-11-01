import type { Metadata } from "next";

/** The public origin, used to make canonical and og:url absolute. Set SITE_URL
 *  to your domain; on Vercel it falls back to the production domain. */
export function siteUrl(): URL | undefined {
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

/** The origin for links that must be absolute (sitemap, robots.txt). Falls
 *  back to localhost when SITE_URL isn't set, so local builds still work. */
export function siteOrigin(): string {
  return (siteUrl()?.origin ?? "http://localhost:3000").replace(/\/$/, "");
}

/** The public marketing pages, listed in the sitemap. */
export const PUBLIC_PAGES = [
  { path: "/", priority: 1 },
  { path: "/contact-us", priority: 0.6 },
  { path: "/privacy-policy", priority: 0.3 },
  { path: "/terms-of-service", priority: 0.3 },
] as const;

const PREVIEW_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "Crevo, the AI operating system for creators: run your creator business. Smarter. With AI",
};

/** Shared page metadata: title, description, Open Graph and Twitter cards. */
export function pageMetadata(path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { "max-image-preview": "large" },
    // Link previews use app/opengraph-image.png and app/twitter-image.png. They
    // are named here because a page's own openGraph replaces the inherited one.
    openGraph: { type: "website", url: path, title, description, images: [PREVIEW_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [{ ...PREVIEW_IMAGE, url: "/twitter-image.png" }] },
  };
}
