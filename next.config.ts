import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
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
