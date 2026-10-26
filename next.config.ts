import type { NextConfig } from "next";

/*
 * This build's version. The service worker is served with it inside
 * (src/app/sw.js/route.ts), so every deployment is a different script and the
 * browser finds the update by itself (features/pwa).
 */
const appVersion =
  process.env.VERCEL_DEPLOYMENT_ID ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  `local-${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  env: { APP_VERSION: appVersion },
  experimental: {
    agentUpgrade: "security",
    /*
     * A sermon document is saved whole through a Server Action, and may be up
     * to 3 MiB (`documentLimits`, src/features/sermon-editor/persistence).
     * 4 MB leaves 1 MiB for the action's encoding and for a document slightly
     * over the limit, which the service then refuses as `too_large`; it stays
     * under Vercel's 4.5 MB request cap and the proxy's 10 MB buffer. It
     * applies to every action; each still validates its own input.
     */
    serverActions: { bodySizeLimit: "4mb" },
  },
  /*
   * The service worker is never kept by a cache between the browser and the
   * server, so an update is seen as soon as it is deployed.
   */
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Content-Type", value: "text/javascript; charset=utf-8" },
      ],
    },
  ],
  partialPrefetching: true,
  /*
   * Where two of the library's sections used to be, kept for old links
   * (src/lib/site.ts). A search in the address is carried across. `/library`
   * is the overview and is not redirected here: its page sends on only an
   * address that still carries the ideas query it used to answer. An idea,
   * `/library/<id>`, is not matched by either of these.
   */
  redirects: async () => [
    { source: "/library/scripture", destination: "/library/saved-scripture", permanent: false },
    { source: "/library/history", destination: "/library/preaching-record", permanent: false },
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
