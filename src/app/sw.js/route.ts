import { serviceWorkerSource } from "@/features/pwa/service-worker";
import { env } from "@/lib/env";

/*
 * The service worker (features/pwa/service-worker.ts), with this build's
 * version written in. The proxy does not run for it (its matcher skips `.js`),
 * and next.config.ts keeps every cache from holding it.
 */
export function GET() {
  return new Response(serviceWorkerSource(env.APP_VERSION ?? "development"), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
