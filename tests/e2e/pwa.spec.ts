import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

import { asReturningVisitor } from "./returning-visitor";

/**
 * The installed application (Phase 5A): the manifest and its icons, the
 * service worker and what it keeps, the offline page, and where the
 * application opens. On the production build, since the worker is registered
 * only there. The guest tests change nothing anywhere. The signed-in one only
 * reads the dashboard (see dashboard.spec.ts for the account it needs).
 *
 * With `E2E_PWA_SHOTS` set to a folder, pictures of the offline page are saved there.
 */

const shots = process.env.E2E_PWA_SHOTS;

/** Waits for the worker to be active and in control of the page. */
async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
  }
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

/** Every address the worker has kept, as paths. */
function keptPaths(page: Page) {
  return page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        paths.push(new URL(request.url).pathname);
      }
    }
    return paths;
  });
}

/**
 * Has the page report itself as the installed application, as Safari on iOS
 * does (`navigator.standalone`). Chromium here cannot emulate the
 * `display-mode` media query, so what is hidden by CSS alone (`standalone:`)
 * is on the handoff's manual list instead.
 */
async function asInstalled(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "standalone", { get: () => true });
  });
}

test.describe("the installed application, as a guest", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await asReturningVisitor(context, baseURL);
  });

  test("has a manifest that opens on the dashboard, with icons that load", async ({
    page,
    request,
  }) => {
    await page.goto("/sign-in");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(href).toBeTruthy();
    const manifest = await (await request.get(href!)).json();
    expect(manifest).toMatchObject({
      name: "Sermon Tracker",
      start_url: "/dashboard",
      scope: "/",
      display: "standalone",
    });
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(
      true,
    );
    for (const icon of manifest.icons as { src: string }[]) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Sermon Tracker",
    );
  });

  test("opens on sign-in for someone signed out, never on the public page", async ({ page }) => {
    const documents: string[] = [];
    page.on("request", (sent) => {
      if (sent.resourceType() === "document") documents.push(new URL(sent.url()).pathname);
    });
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
    expect(documents).not.toContain("/");
  });

  test("keeps only the offline page and public files, never a page or data", async ({ page }) => {
    await page.goto("/sign-in");
    await controlled(page);
    // Move around a little so the worker sees pages, router data, and the API.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
    await page.goto("/");

    const kept = await keptPaths(page);
    expect(kept).toContain("/offline");
    expect(kept.some((path) => path.startsWith("/_next/static/"))).toBe(true);
    for (const path of kept) {
      expect(
        path === "/offline" ||
          path.startsWith("/_next/static/") ||
          path.startsWith("/brand/") ||
          ["/icon.svg", "/apple-icon.png", "/manifest.webmanifest"].includes(path),
        path,
      ).toBe(true);
    }
  });

  test("shows the offline page when the network cannot be reached, and tries again", async ({
    page,
    context,
  }, testInfo) => {
    await page.goto("/sign-in");
    await controlled(page);

    await context.setOffline(true);
    await page.goto("/library");
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await expect(page.getByText(/have not been signed out/)).toBeVisible();
    // The address is still the one asked for, so trying again asks for it again.
    await expect(page).toHaveURL(/\/library$/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    if (shots) {
      await page.screenshot({ path: `${shots}/offline-${testInfo.project.name}-light.png` });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.reload();
      await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
      await page.screenshot({ path: `${shots}/offline-${testInfo.project.name}-dark.png` });
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
    }

    // In the last language the interface was shown in on this device.
    await page.evaluate(() => localStorage.setItem("st-locale", "es"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Estás sin conexión" })).toBeVisible();

    // Trying again while still offline asks again, and is answered the same way.
    await page.getByRole("button", { name: "Intentar de nuevo" }).click();
    await expect(page.getByRole("heading", { name: "Estás sin conexión" })).toBeVisible();

    // Back online it tries again by itself, and gets the real answer: a guest is sent
    // to sign-in (by way of Clerk's own domain, on a development instance).
    await context.setOffline(false);
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test("never shows the public page once installed", async ({ page }) => {
    await asInstalled(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe("the installed application, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in tests run against the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  test("offers a new version, and takes it with one reload when asked", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /^Welcome back/ })).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 15_000,
    });
    await controlled(page);

    const notice = page.getByRole("status").filter({ hasText: "A new version" });
    await expect(notice).toHaveCount(0);

    // A second script for the same scope is what a deployment looks like to the browser.
    await page.evaluate(() =>
      navigator.serviceWorker.register("/sw.js?simulated-update=1", {
        scope: "/",
        updateViaCache: "none",
      }),
    );
    await expect(notice).toBeVisible({ timeout: 20_000 });
    if (shots) await page.screenshot({ path: `${shots}/update-${testInfo.project.name}.png` });

    await page.evaluate(() => {
      (window as unknown as { beforeUpdate: boolean }).beforeUpdate = true;
    });
    await notice.getByRole("button", { name: "Update" }).click();
    await expect
      .poll(() => page.evaluate(() => "beforeUpdate" in window), { timeout: 20_000 })
      .toBe(false);
    await expect(page).toHaveURL(/\/dashboard/);

    // Settings offers installing, and says how.
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Install the app" })).toBeVisible();
    if (shots) {
      await page.getByRole("heading", { name: "Install the app" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/settings-${testInfo.project.name}.png` });
    }
  });
});
