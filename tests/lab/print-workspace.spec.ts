import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * BUG-010 in a real browser: printing the sermon workspace (`/lab/editor/v4`,
 * the same `SermonWorkspace` as `/outlines/[id]`) prints the document alone,
 * in Print Layout, whatever layout the screen was in.
 *
 * Chrome's print runs `beforeprint` with the screen's layout in force, then
 * lays the page out at the paper's width with print media. Here that is
 * `beforeprint`, then a paper-wide viewport and print media, then
 * `afterprint`. Before the fix, the paper's width turned a desktop workspace
 * to Regular Layout and its toolbar was printed. Nothing is written anywhere:
 * the lab persists nothing, and every check reads the document too.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

const editor = (page: Page) => page.getByTestId("sermon-editor");

async function openV4(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/editor/v4");
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
}

const documentJson = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify(
      (
        document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
          editor: { getJSON: () => unknown };
        }
      ).editor.getJSON(),
    ),
  );

/** What the print shows: whether anything but the editor is drawn, and the editor's layout. */
const printed = (page: Page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement;
    const shown = (element: Element | null) =>
      Boolean(element) && getComputedStyle(element as Element).display !== "none";
    const visibleOutside = Array.from(document.body.querySelectorAll("button, header, aside"))
      .filter((element) => !root.contains(element))
      .filter((element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          if (!shown(node)) return false;
        }
        return true;
      }).length;
    return { layout: root.getAttribute("data-layout"), visibleOutside };
  });

async function print(page: Page, paper = { width: 816, height: 1056 }) {
  const screen = page.viewportSize()!;
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.setViewportSize(paper);
  await page.emulateMedia({ media: "print" });
  await page.waitForTimeout(500);
  const during = await printed(page);
  await page.emulateMedia({ media: "screen" });
  await page.setViewportSize(screen);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.waitForTimeout(300);
  return during;
}

test.beforeEach(async ({ page }, info) => {
  test.skip(!email || !development, "Needs the development Clerk instance and a test user.");
  test.skip(
    info.project.name !== "desktop",
    "Desktop Chromium; the narrow case sets its own size.",
  );
  await clerkSetup({ publishableKey });
  await openV4(page);
});

test("a desktop prints the document alone, in Print Layout, and stays in it", async ({ page }) => {
  await expect(editor(page)).toHaveAttribute("data-layout", "print");
  const before = await documentJson(page);
  const during = await print(page);
  expect(during).toEqual({ layout: "print", visibleOutside: 0 });
  await expect(editor(page)).toHaveAttribute("data-layout", "print");
  expect(await documentJson(page)).toBe(before);
});

test("a window in Regular Layout prints in Print Layout and returns to Regular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(editor(page)).toHaveAttribute("data-layout", "regular");
  const before = await documentJson(page);
  const during = await print(page);
  expect(during).toEqual({ layout: "print", visibleOutside: 0 });
  await expect(editor(page)).toHaveAttribute("data-layout", "regular");
  expect(await documentJson(page)).toBe(before);
});
