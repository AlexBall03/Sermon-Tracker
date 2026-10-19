import type { MetadataRoute } from "next";

import { routes, siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteConfig.url, changeFrequency: "monthly", priority: 1 },
    { url: `${siteConfig.url}${routes.contact}`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteConfig.url}${routes.privacy}`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteConfig.url}${routes.terms}`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
