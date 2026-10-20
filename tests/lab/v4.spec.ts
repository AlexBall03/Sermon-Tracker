import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * The schema v4 prototype (/lab/editor/v4) in a real browser: only what
 * jsdom cannot establish. The unit tests (src/features/editor-lab/v4) check
 * the documents; these check the caret, real typing and native deletion,
 * arrow keys across blocks, the presentation, and Print Layout. Signed in
 * as editor.spec.ts is; nothing is created or changed on the server.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

async function openV4(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/editor/v4");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("schema v4", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
  await expect(editor(page).locator('[data-id="p-a"]')).toBeVisible({ timeout: 30_000 });
}

const editor = (page: Page) => page.getByTestId("lab-v4-editor");
const point = (page: Page, id: string) =>
  editor(page).locator(`p[data-type="point"][data-id="${id}"]`);
const paragraph = (page: Page, text: string) =>
  editor(page).locator("p:not([data-type])", { hasText: text });

/** Where the browser's caret is: the point it is in (by ID) or the text of its paragraph. */
function caretBlock(page: Page) {
  return page.evaluate(() => {
    const node = window.getSelection()?.anchorNode;
    const element = node instanceof Element ? node : node?.parentElement;
    const block = element?.closest(".lab-editor > *");
    if (!block) return null;
    return block.getAttribute("data-type") === "point"
      ? `point:${block.getAttribute("data-id")}`
      : `text:${block.textContent}`;
  });
}

/** Clicks at the very end (or start) of a block's text. */
async function clickEdge(page: Page, target: ReturnType<typeof point>, edge: "start" | "end") {
  await target.click();
  await page.keyboard.press(edge === "end" ? "End" : "Home");
}

test.describe("schema v4 prototype, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(Boolean(email) && !development, "Tested against the development Clerk instance only.");
  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Checked at desktop size.");
  });

  test("Enter at a heading's end writes in a new paragraph that belongs to the point", async ({
    page,
  }) => {
    await openV4(page);
    await clickEdge(page, point(page, "p-a"), "end");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Typed under A");
    await expect(paragraph(page, "Typed under A")).toHaveAttribute("data-depth", "2");
    const row = page.getByTestId("lab-v4-structure").locator("tr", { hasText: "Typed under A" });
    await expect(row).toContainText("Subpoint A");
  });

  test("Enter in a heading's middle splits it; the original keeps its ID and the caret is on it", async ({
    page,
  }) => {
    await openV4(page);
    await clickEdge(page, point(page, "p-b"), "start");
    for (let index = 0; index < "Subpoint".length; index += 1)
      await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(point(page, "p-b")).toHaveText(" B");
    await expect(
      editor(page).locator('p[data-type="point"]', { hasText: /^Subpoint$/ }),
    ).toHaveCount(1);
    expect(await caretBlock(page)).toBe("point:p-b");
    await page.keyboard.type("X");
    await expect(point(page, "p-b")).toHaveText("X B");
  });

  test("Backspace deletes characters natively, and at a heading's start turns the point into writing", async ({
    page,
  }) => {
    await openV4(page);
    await clickEdge(page, point(page, "p-b"), "end");
    await page.keyboard.press("Backspace");
    await expect(point(page, "p-b")).toHaveText("Subpoint ");
    await page.keyboard.press("Home");
    await page.keyboard.press("Backspace");
    await expect(point(page, "p-b")).toHaveCount(0);
    await expect(paragraph(page, "Subpoint")).toHaveAttribute("data-depth", "1");
    await expect(page.getByTestId("lab-v4-notice")).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(point(page, "p-b")).toHaveText("Subpoint ");
  });

  test("Delete before a point moves into its heading; arrows cross blocks without stopping between them", async ({
    page,
  }) => {
    await openV4(page);
    await clickEdge(page, paragraph(page, "Belongs to I") as ReturnType<typeof point>, "end");
    await page.keyboard.press("Delete");
    expect(await caretBlock(page)).toBe("point:p-b");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowDown");
    expect(await caretBlock(page)).toBe("text:Body of B");
    await page.keyboard.press("ArrowDown");
    expect(await caretBlock(page)).toBe("point:p-ii");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    expect(await caretBlock(page)).toBe("point:p-b");
  });

  test("typing over a selection from writing into a heading keeps the point", async ({ page }) => {
    await openV4(page);
    await paragraph(page, "Body of A").click();
    await page.keyboard.press("Home");
    for (let index = 0; index < 4; index += 1) await page.keyboard.press("ArrowRight");
    await page.keyboard.down("Shift");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let index = 0; index < "Subpoint ".length; index += 1)
      await page.keyboard.press("ArrowRight");
    await page.keyboard.up("Shift");
    await page.keyboard.type("!");
    await expect(paragraph(page, "Body!")).toHaveCount(1);
    await expect(point(page, "p-b")).toHaveText("B");
  });

  test("presentation changes indentation only; Print Layout paginates and stays editable", async ({
    page,
  }) => {
    await openV4(page);
    const body = paragraph(page, "Body of A");
    const indent = () => body.evaluate((element) => getComputedStyle(element).paddingLeft);
    expect(await indent()).not.toBe("0px");
    await page.getByRole("radio", { name: "Manuscript" }).check({ force: true });
    expect(await indent()).toBe("0px");
    await expect(body).toHaveAttribute("data-depth", "2");
    await page.getByRole("radio", { name: "Outline" }).check({ force: true });

    await page.getByRole("combobox", { name: "Document" }).click();
    await page.getByRole("option", { name: /Print Layout test/ }).click();
    await page.getByRole("radio", { name: "Print" }).check({ force: true });
    await expect(editor(page)).toHaveAttribute("data-layout", "print");
    const gaps = await editor(page).locator(".lab-page-gap").count();
    expect(gaps).toBeGreaterThan(0);
    const first = editor(page).locator('p[data-type="point"]').first();
    await clickEdge(page, first, "end");
    await page.keyboard.type(" typed in print");
    await expect(first).toContainText("typed in print");
    console.log(`LAB-MEASURE ${JSON.stringify({ name: "v4-print", gaps })}`);
  });
});
