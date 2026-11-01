import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteOrigin } from "@/lib/site";

/** /sitemap.xml: the public pages search engines should index. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return PUBLIC_PAGES.map((page) => ({
    url: `${origin}${page.path}`,
    changeFrequency: "monthly",
    priority: page.priority,
  }));
}
