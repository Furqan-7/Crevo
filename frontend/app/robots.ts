import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

/** /robots.txt: index the marketing site, keep the app and sign-in pages out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/auth"] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
