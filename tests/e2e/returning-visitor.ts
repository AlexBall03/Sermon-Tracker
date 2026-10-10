import type { BrowserContext } from "@playwright/test";

/**
 * Marks the browser as one that has seen the site this session, so the
 * loading screen does not appear. Most specs are about the page beneath it;
 * loading.spec.ts is the one that tests the splash and does not use this.
 */
export async function asReturningVisitor(context: BrowserContext, baseURL: string | undefined) {
  await context.addCookies([{ name: "st_seen", value: "guest", url: baseURL }]);
}
