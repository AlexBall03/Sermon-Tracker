import type { MetadataRoute } from "next";

import { routes, siteConfig } from "@/lib/site";

/*
 * The installed application (Phase 5A; features/pwa). It is only for people
 * who are signed in, so it opens on the dashboard and never on the landing
 * page: a guest is sent from there to sign-in by the proxy, and a new account
 * on to first-time setup by the dashboard's own access check, as in a browser.
 *
 * The colors are the light canvas, which is the default theme; the page sets
 * `theme-color` itself once it knows the theme in force (PwaRuntime).
 * Manifest words are in English only: a manifest has one language.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: routes.dashboard,
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: siteConfig.description,
    lang: "en",
    start_url: routes.dashboard,
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#f7f5f0",
    theme_color: "#f7f5f0",
    categories: ["productivity", "education"],
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
