import type { MetadataRoute } from "next";

import { isIndexable } from "@/lib/env";
import { privateRoutes, siteConfig } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: [...privateRoutes] },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
