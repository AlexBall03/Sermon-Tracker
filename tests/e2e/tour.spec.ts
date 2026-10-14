import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

import { keepTourState } from "./onboarding-account";

/**
 * The product tour, signed in, run again from Settings: every stop on its own
 * page, Back, Escape, and the card and the light where they belong, at the
 * desktop width and a phone's.
 *
 * It uses the same development account as the other signed-in specs (see
 * library.spec.ts); without `E2E_CLERK_USER_EMAIL` it is skipped. Finishing
 * and skipping the tour are kept on the account, so where its tour stood is
 * put back afterwards (onboarding-account.ts, development only). Run it by
 * itself, so no other spec sees the account's tour change under it:
 *
 *   npx playwright test tour --workers=1
 *
 * With `E2E_TOUR_SHOTS` set to a folder, a picture of every stop is saved there.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");
const shots = process.env.E2E_TOUR_SHOTS;

test.describe.configure({ mode: "serial" });

const stops = [
  { title: "Your Dashboard", path: "/dashboard" },
  { title: "Capture an Idea", path: "/dashboard" },
  { title: "Your Library", path: "/library" },
  { title: "The Bible", path: "/bible" },
  { title: "Outlines", path: "/outlines" },
  { title: "Preaching Record", path: "/library/preaching-record" },
  { title: "You're ready to begin.", path: "/dashboard" },
];

test.describe("the product tour, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "Signed-in tests run against the development Clerk instance only.",
  );

  let restore: (() => Promise<void>) | undefined;
  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
    restore = await keepTourState(email ?? "");
  });
  test.afterAll(async () => {
    await restore?.();
  });

  const tour = (page: Page) => page.getByRole("dialog");
  const fits = async (page: Page) =>
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);

  async function start(page: Page) {
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
    await page.goto("/settings/app");
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Restart Product Tour" }).click();
    await expect(tour(page)).toBeVisible();
  }

  /** The light glides from one thing to the next in 0.3 seconds; this waits until it has arrived. */
  async function settled(page: Page) {
    const light = page.locator("[data-tour-layer] > div");
    await expect
      .poll(async () => {
        const before = JSON.stringify(await light.boundingBox());
        await page.waitForTimeout(120);
        return before === JSON.stringify(await light.boundingBox());
      })
      .toBe(true);
  }

  /** The stop is on its page, its words are shown, and the way on is open. */
  async function at(page: Page, index: number) {
    const stop = stops[index];
    await expect(tour(page).getByRole("heading", { name: stop.title })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${stop.path}$`));
    await expect(tour(page).getByText(`Step ${index + 1} of 7`, { exact: true })).toBeVisible();
    await expect(tour(page).getByRole("button", { name: /Next|Finish Tour/ })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  }

  test("goes through every stop on its own page, and back, and finishes", async ({
    page,
  }, info) => {
    await start(page);
    const wide = (page.viewportSize()?.width ?? 0) >= 768;

    for (let index = 0; index < stops.length; index += 1) {
      await at(page, index);
      await settled(page);
      await fits(page);

      // The card stays on the screen, clear of the tab bar on a phone.
      const card = await tour(page).boundingBox();
      const viewport = page.viewportSize();
      expect(card && viewport).toBeTruthy();
      if (card && viewport) {
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.y).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);
        expect(card.y + card.height).toBeLessThanOrEqual(viewport.height - (wide ? 0 : 56));
      }
      // Where it points at a destination, that destination is the one lit.
      if (index >= 2 && index <= 4) {
        const name = `${wide ? "nav" : "tab"}-${stops[index].path.slice(1)}`;
        const target = await page.locator(`[data-tour="${name}"]`).boundingBox();
        const light = await page.locator("[data-tour-layer] > div").boundingBox();
        expect(target && light).toBeTruthy();
        if (target && light) {
          expect(light.x).toBeLessThanOrEqual(target.x);
          expect(light.y).toBeLessThanOrEqual(target.y);
          expect(light.x + light.width).toBeGreaterThanOrEqual(target.x + target.width - 1);
        }
      }
      if (shots) {
        await page.screenshot({ path: `${shots}/tour-${info.project.name}-${index + 1}.png` });
      }

      if (index === 3) {
        // Back goes to the stop before, on its own page, and Next returns.
        await tour(page).getByRole("button", { name: "Back" }).click();
        await at(page, 2);
        await tour(page).getByRole("button", { name: "Next" }).click();
        await at(page, 3);
      }
      if (index < stops.length - 1) await tour(page).getByRole("button", { name: "Next" }).click();
    }

    await tour(page).getByRole("button", { name: "Finish Tour" }).click();
    await expect(tour(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);
    // The page is usable again: its own controls answer.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await fits(page);
  });

  test("Escape ends it at once, wherever it is, and nothing behind it was touched", async ({
    page,
  }) => {
    await start(page);
    await at(page, 0);
    await tour(page).getByRole("button", { name: "Next" }).click();
    await at(page, 1);
    // Pointing at capture opens nothing: the tour is the only dialog.
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(tour(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard$/);
    // Capture still opens as usual afterwards, and closes without saving.
    const capture = page.locator('[data-tour="quick-capture"], [data-tour="tab-quick-capture"]');
    await capture.filter({ visible: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
