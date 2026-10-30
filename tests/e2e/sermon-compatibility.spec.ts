import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

import { pdfLines } from "../lab/pdf-text";

/**
 * A3.1, legacy compatibility in the production sermon editor, signed in, on a
 * production build with conversion on: Add from Saved Point, folding points
 * (in Regular and Print Layout) apart from Scripture expansion, and a
 * passage's way to the Bible reader and back, under the leave guard.
 * Printing is checked in Chromium's own PDF pipeline, which runs the page's
 * `beforeprint` and `afterprint` as printing does: nothing dispatches them by hand.
 *
 * It signs in as `sermon-document.spec.ts` does and needs the same account.
 * Each test works only on ideas it makes itself, named with a prefix unique
 * to the run, and deletes them at the end.
 */
const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");
const converting = (process.env.SERMON_DOCUMENT_CONVERSION ?? "on") === "on";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/library/sermon-ideas");
  await expect(page.getByRole("heading", { level: 1, name: "Sermon Ideas" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 15_000 });
}

/** An idea of this run's, filed as `kind`; its ID. */
async function makeIdea(page: Page, title: string, kind: "Sermon" | "Point") {
  await page.goto("/library/sermon-ideas");
  await page
    .getByRole("button", { name: "Capture an idea" })
    .filter({ visible: true })
    .first()
    .click();
  const capture = page.getByRole("dialog", { name: "Capture an idea" });
  await capture.getByRole("textbox", { name: "Idea" }).fill(title);
  await capture.getByRole("button", { name: "Save idea" }).click();
  await expect(capture).toBeHidden();
  await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(title)}`);
  await page.getByRole("link", { name: title, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(title);
  const id = page.url().split("?")[0].split("/").pop() ?? "";
  await page.getByRole("radio", { name: kind }).check({ force: true });
  await expect(page.getByText(`Now filed as: ${kind} idea.`)).toBeVisible();
  return id;
}

async function removeIdea(page: Page, title: string) {
  await page.goto(`/library/sermon-ideas?q=${encodeURIComponent(title)}&archived=all`);
  const link = page.getByRole("link", { name: title, exact: true });
  await link.or(page.locator("#empty-heading")).first().waitFor();
  if ((await link.count()) === 0) return;
  await link.click();
  await page.getByRole("button", { name: "Delete idea" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /^Delete/ })
    .click();
  await expect(page).toHaveURL(/\/library\/sermon-ideas(\?|$)/);
}

async function makeOutline(page: Page, sermonId: string) {
  await page.goto(`/outlines/new?sermon=${sermonId}`);
  await page.getByRole("button", { name: "Create outline" }).click();
  await expect(page).toHaveURL(/\/outlines\/[0-9a-f-]{36}$/);
  await editorOpen(page);
  return page.url();
}

const editor = (page: Page) => page.getByTestId("sermon-editor");
const status = (page: Page) => page.getByTestId("save-status");

async function editorOpen(page: Page) {
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
  await expect(editor(page)).toHaveAttribute("contenteditable", "true", { timeout: 30_000 });
}

async function saved(page: Page) {
  await expect(status(page)).toHaveAttribute("data-label", "saved", { timeout: 30_000 });
}

async function typeAtEnd(page: Page, words: string) {
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(words);
}

async function insert(page: Page, component: string) {
  await page.getByTestId("insert-menu").click();
  await page.getByTestId(`insert-${component}`).click();
}

async function insertPassage(page: Page, reference: string) {
  await insert(page, "scripture");
  const dialog = page.getByTestId("insert-scripture-dialog");
  await dialog.getByRole("textbox", { name: "Reference" }).fill(reference);
  await dialog.getByTestId("insert-scripture-submit").click();
  await expect(dialog).toBeHidden();
}

async function view(page: Page, item: string) {
  await page.getByTestId("view-menu").click();
  await page.getByTestId(`view-${item}`).click();
}

/** Waits until the pages have been measured and nothing changed for a few frames. */
async function settled(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    let last = "";
    for (let stable = 0, tries = 0; stable < 6 && tries < 400; tries += 1) {
      await frame();
      const dom = document.querySelector<HTMLElement>("[data-testid=sermon-editor]");
      const pages = document.querySelector<HTMLElement>(".lab-pages")?.dataset.pages ?? "";
      const now = `${dom?.getBoundingClientRect().height}|${pages}`;
      stable = now === last ? stable + 1 : 0;
      last = now;
    }
  });
}

const pageCount = async (page: Page) => {
  await settled(page);
  return Number(await page.locator(".lab-pages").getAttribute("data-pages"));
};

/** Prints as Chrome prints (its `beforeprint` and `afterprint` included); the PDF's text lines and pages. */
async function print(page: Page) {
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return { pages, lines: pdfLines(pdf, 1056).map(({ page: at, y, text }) => ({ at, y, text })) };
}

/** Counts the requests that could save anything (Server Actions are POSTs). */
function posts(page: Page) {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") seen.push(request.url());
  });
  return seen;
}

test.describe("legacy compatibility in the sermon editor (A3.1), signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(Boolean(email) && !development, "Runs against the development Clerk instance only.");
  test.skip(!converting, "Needs conversion on (SERMON_DOCUMENT_CONVERSION unset or on).");

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  test("a saved point is placed, edited, folded, its Scripture expanded and opened in the Bible, and all of it comes back", async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);
    const run = `e2e${Date.now().toString(36)}${testInfo.project.name}`;
    const pointTitle = `${run} faith comes by hearing`;
    const sermonTitle = `${run} compat sermon`;
    await signIn(page);
    try {
      const pointId = await makeIdea(page, pointTitle, "Point");
      const sermonId = await makeIdea(page, sermonTitle, "Sermon");
      const outline = await makeOutline(page, sermonId);
      const outlineId = outline.split("/").pop()!;

      await typeAtEnd(page, "Opening words");
      await insert(page, "point");
      await page.keyboard.type("Grace");

      // Add from Saved Point, under the point the caret is in, twice.
      await insert(page, "savedPoint");
      const picker = page.getByRole("dialog", { name: "Add from a saved point" });
      await expect(picker).toBeVisible();
      await expect(picker).toContainText("Its notes and passages stay with the saved point");
      await picker.getByRole("radio", { name: "As a subpoint" }).check({ force: true });
      await picker.getByRole("searchbox").fill(pointTitle);
      const add = picker.getByRole("button", { name: `Add ${pointTitle}` });
      await add.click();
      await expect(picker.getByRole("status")).toHaveText(`Added “${pointTitle}”.`);
      await add.click();
      await page.screenshot({ path: testInfo.outputPath("saved-point-dialog.png") });
      await picker.getByRole("button", { name: "Done" }).click();
      await expect(picker).toBeHidden();
      const copies = editor(page).locator(`p[data-source-point-id="${pointId}"]`);
      await expect(copies).toHaveCount(2);
      await expect(copies.first()).toHaveText(pointTitle);
      await expect(copies.first()).toHaveAttribute("data-depth", "2");

      // The focus is back in the editor, at the end of the last copy: edit its heading.
      await page.waitForTimeout(700);
      await page.keyboard.type(" today");
      await expect(copies.last()).toHaveText(`${pointTitle} today`);
      // Undo and Redo the edit; the copies stay.
      await page.keyboard.press("Control+z");
      await expect(copies.last()).toHaveText(pointTitle);
      await page.keyboard.press("Control+Shift+z");
      await expect(copies.last()).toHaveText(`${pointTitle} today`);
      await expect(copies).toHaveCount(2);

      // A passage under the copy, then saved.
      await insertPassage(page, "Romans 8:28");
      const passage = editor(page).locator(".lab-passage", { hasText: "Romans 8:28" });
      await expect(passage).toBeVisible();
      await saved(page);

      // Folding is view state: nothing is saved for it.
      const sent = posts(page);
      await copies.last().hover();
      await copies.last().locator(".lab-fold-toggle").click();
      await expect(passage).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath("folded.png") });
      await view(page, "expand-points");
      await expect(passage).toBeVisible();
      await view(page, "collapse-points");
      await expect(passage).toBeHidden();
      await expect(copies).toHaveCount(2);
      await view(page, "expand-points");
      await expect(passage).toBeVisible();

      // Scripture, a separate control: its words in Regular Layout; on screen only in Print.
      const verses = passage.locator(".lab-passage-text");
      const print = (await editor(page).getAttribute("data-layout")) === "print";
      if (print) {
        await expect(verses).toBeVisible({ timeout: 30_000 });
        await view(page, "collapse-scripture");
        await expect(verses).toBeHidden();
        await view(page, "expand-scripture");
      } else {
        await expect(verses).toBeHidden();
        await view(page, "expand-scripture");
      }
      await expect(verses).toBeVisible({ timeout: 30_000 });
      await expect(verses).toContainText("all things work together");
      await page.waitForTimeout(3000);
      expect(sent).toEqual([]);
      await expect(status(page)).toHaveAttribute("data-label", "saved");
      await page.getByTestId("view-menu").click();
      await page.screenshot({ path: testInfo.outputPath("view-menu.png") });
      await page.keyboard.press("Escape");
      // The same in the dark theme: a folded point's chevron, the menu, and the passage's link.
      await page.emulateMedia({ colorScheme: "dark" });
      await copies.last().locator(".lab-fold-toggle").click();
      await page.screenshot({ path: testInfo.outputPath("folded-dark.png") });
      await copies.last().locator(".lab-fold-toggle").click();
      await page.getByTestId("view-menu").click();
      await page.screenshot({ path: testInfo.outputPath("view-menu-dark.png") });
      await page.keyboard.press("Escape");
      await page.emulateMedia({ colorScheme: "light" });
      await expect(status(page)).toHaveAttribute("data-label", "saved");

      // Open in the Bible: this tab, at the passage, with this outline as the way back.
      await passage.locator(".lab-passage-open").click();
      await expect(page).toHaveURL(
        new RegExp(`/bible\\?book=45&chapter=8&verse=28&outline=${outlineId}$`),
      );
      const back = page.getByRole("link", {
        name: new RegExp(`Back to the outline of.*${sermonTitle}`),
      });
      await expect(back).toBeVisible({ timeout: 30_000 });
      // Back and Forward behave as for any page.
      await page.goBack();
      await expect(page).toHaveURL(outline);
      await editorOpen(page);
      await page.goForward();
      await expect(page).toHaveURL(/\/bible\?/);
      await back.click();
      await expect(page).toHaveURL(outline);
      await editorOpen(page);
      // Everything is there, saved: two copies with their source, the edit, the passage.
      await expect(copies).toHaveCount(2);
      await expect(copies.last()).toHaveText(`${pointTitle} today`);
      await expect(passage).toBeVisible();
      await expect(status(page)).toHaveAttribute("data-label", "unchanged");

      // And after a reload, from the server.
      await page.reload();
      await editorOpen(page);
      await expect(copies).toHaveCount(2);
      await expect(copies.last()).toHaveText(`${pointTitle} today`);

      // The saved point itself is unchanged.
      await page.goto(`/library/${pointId}`);
      await expect(page.getByRole("textbox", { name: "Idea" })).toHaveValue(pointTitle);
    } finally {
      await removeIdea(page, sermonTitle);
      await removeIdea(page, pointTitle);
    }
  });

  test("Open in the Bible waits for words not yet kept: Stay keeps the page, Leave goes once", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} guard sermon`;
    await signIn(page);
    try {
      const sermonId = await makeIdea(page, title, "Sermon");
      const outline = await makeOutline(page, sermonId);
      await typeAtEnd(page, "Words");
      await insertPassage(page, "John 3:16");
      await saved(page);
      const link = editor(page).locator(".lab-passage-open");
      const bible: string[] = [];
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame() && frame.url().includes("/bible?")) bible.push(frame.url());
      });

      // Words not yet kept on the device: the guard asks first.
      await typeAtEnd(page, " not yet kept");
      await link.click();
      const leave = page.getByRole("alertdialog", { name: "Leave without saving?" });
      await expect(leave).toBeVisible();
      await leave.getByRole("button", { name: "Stay on this page" }).click();
      await expect(leave).toBeHidden();
      await expect(page).toHaveURL(outline);
      await page.waitForTimeout(1000);
      expect(bible).toEqual([]);
      await expect(editor(page)).toContainText("not yet kept");

      // Asked again, and agreed: exactly one navigation, to the passage.
      await typeAtEnd(page, " still not kept");
      await link.click();
      await expect(leave).toBeVisible();
      await leave.getByRole("button", { name: "Leave without saving" }).click();
      await expect(page).toHaveURL(/\/bible\?book=43&chapter=3&verse=16&outline=/);
      await page.waitForTimeout(1500);
      expect(bible).toHaveLength(1);
      await expect(page).toHaveURL(/\/bible\?/);

      // Back at the outline: it opens through a new session; what it shows is reported.
      await page.goto(outline);
      const opened = editor(page).or(page.getByRole("heading", { name: "Unsaved work was found" }));
      await expect(opened.first()).toBeVisible({ timeout: 30_000 });
      testInfo.annotations.push({
        type: "return",
        description: (await editor(page).isVisible()) ? "editor" : "recovery",
      });
    } finally {
      await removeIdea(page, title);
    }
  });

  test("words kept on this device but not yet saved: the link is not held, and nothing is lost on the way back", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "The same on a phone; observed once.");
    test.setTimeout(240_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} local sermon`;
    await signIn(page);
    try {
      const sermonId = await makeIdea(page, title, "Sermon");
      const outline = await makeOutline(page, sermonId);
      await typeAtEnd(page, "Words");
      await insertPassage(page, "John 3:16");
      await saved(page);
      await typeAtEnd(page, " kept here first");
      // On the device, the server's save still to come (A3: the guard holds only words not yet on the device).
      await expect(status(page)).toHaveAttribute("data-label", /^(local|waiting)$/, {
        timeout: 10_000,
      });
      await editor(page).locator(".lab-passage-open").click();
      await expect(page).toHaveURL(/\/bible\?book=43&chapter=3&verse=16&outline=/);
      await page.goBack();
      await expect(page).toHaveURL(outline);
      const opened = editor(page).or(page.getByRole("heading", { name: "Unsaved work was found" }));
      await expect(opened.first()).toBeVisible({ timeout: 30_000 });
      const shown = (await editor(page).isVisible()) ? "editor" : "recovery";
      testInfo.annotations.push({ type: "return", description: shown });
      if (shown === "editor") await expect(editor(page)).toContainText("kept here first");
      else await expect(page.getByText("kept here first").first()).toBeVisible();
    } finally {
      await removeIdea(page, title);
    }
  });

  test("folded points and collapsed Scripture still print the whole sermon, on the same pages", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Chromium's PDF printing, at desktop size.");
    test.setTimeout(300_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} print sermon`;
    await signIn(page);
    try {
      const sermonId = await makeIdea(page, title, "Sermon");
      await makeOutline(page, sermonId);
      await expect(editor(page)).toHaveAttribute("data-layout", "print");
      const long = (marker: string, count: number) =>
        Array.from(
          { length: count },
          (_, i) => `${marker} sentence ${i} about grace and its fruit.`,
        ).join(" ");

      await typeAtEnd(page, "Opening words");
      await insert(page, "point");
      await page.keyboard.type("Long point");
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.insertText(long("ALPHA", 260));
      await insertPassage(page, "John 3:16");
      // The passage is selected now; back to the long point's heading, so the next point follows its group.
      await editor(page).locator("p.lab-v4-point", { hasText: "Long point" }).click();
      await page.keyboard.press("End");
      await insert(page, "point");
      await page.keyboard.type("Second point");
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.insertText(`${long("OMEGA", 30)} OMEGAEND`);
      await saved(page);
      const passage = editor(page).locator(".lab-passage", { hasText: "John 3:16" });
      await expect(passage.locator(".lab-passage-text")).toHaveAttribute("data-state", "ready", {
        timeout: 30_000,
      });

      const sent = posts(page);
      const unfolded = await pageCount(page);
      const reference = await print(page);
      expect(reference.pages).toBe(unfolded);
      expect(reference.lines.map((line) => line.text).join(" ")).toContain("ALPHA");
      expect(await pageCount(page)).toBe(unfolded);

      // Fold the long point: fewer pages on screen, but only if it filled them.
      const heading = editor(page).locator("p.lab-v4-point", { hasText: "Long point" });
      await heading.hover();
      await heading.locator(".lab-fold-toggle").click();
      await expect(passage).toBeHidden();
      const folded = await pageCount(page);
      testInfo.annotations.push({ type: "pages", description: `${unfolded} → ${folded}` });
      if (unfolded >= 3) expect(folded).toBeLessThan(unfolded);
      await page.screenshot({ path: testInfo.outputPath("folded-print-layout.png") });

      // Printed while folded: exactly the unfolded print, line for line, page for page.
      const whileFolded = await print(page);
      expect(whileFolded.pages).toBe(reference.pages);
      expect(whileFolded.lines).toEqual(reference.lines);
      // And the screen is folded again after printing, on its own pages.
      await expect(passage).toBeHidden();
      expect(await pageCount(page)).toBe(folded);

      // Unfolding gives back exactly the pages there were.
      await view(page, "expand-points");
      await expect(passage).toBeVisible();
      expect(await pageCount(page)).toBe(unfolded);

      // Scripture collapsed on screen still prints in full (its print setting is "full").
      await view(page, "collapse-scripture");
      await expect(passage.locator(".lab-passage-text")).toBeHidden();
      const whileCollapsed = await print(page);
      expect(whileCollapsed.lines).toEqual(reference.lines);
      await expect(passage.locator(".lab-passage-text")).toBeHidden();
      await view(page, "expand-scripture");
      expect(await pageCount(page)).toBe(unfolded);

      expect(sent).toEqual([]);
      await expect(status(page)).toHaveAttribute("data-label", "saved");
    } finally {
      await removeIdea(page, title);
    }
  });

  test("on a phone: folding in Regular and in Print Layout, and the pages come back", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "The phone's own journey.");
    test.setTimeout(240_000);
    const title = `e2e${Date.now().toString(36)}${testInfo.project.name} phone fold sermon`;
    await signIn(page);
    try {
      const sermonId = await makeIdea(page, title, "Sermon");
      await makeOutline(page, sermonId);
      await expect(editor(page)).toHaveAttribute("data-layout", "regular");
      await insert(page, "point");
      await page.keyboard.type("Point one");
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.insertText("Words under point one. ".repeat(80));
      await insertPassage(page, "Psalm 23:1");
      await saved(page);
      const passage = editor(page).locator(".lab-passage", { hasText: "Psalm 23:1" });
      const heading = editor(page).locator("p.lab-v4-point", { hasText: "Point one" });

      // Regular: the chevron is there for a finger, on the screen beside a main point, and folds.
      const chevron = await heading.locator(".lab-fold-toggle").boundingBox();
      expect(chevron!.x).toBeGreaterThanOrEqual(0);
      expect(chevron!.height).toBeGreaterThanOrEqual(44);
      await heading.locator(".lab-fold-toggle").tap();
      await expect(passage).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath("phone-folded.png") });
      await heading.locator(".lab-fold-toggle").tap();
      await expect(passage).toBeVisible();

      // Print Layout, chosen on the phone: folding works there too, and the pages come back.
      await page
        .getByRole("radio", { name: "Print", exact: true })
        .evaluate((input: HTMLInputElement) => input.click());
      await expect(editor(page)).toHaveAttribute("data-layout", "print");
      const unfolded = await pageCount(page);
      await view(page, "collapse-points");
      await expect(passage).toBeHidden();
      const folded = await pageCount(page);
      if (unfolded >= 2) expect(folded).toBeLessThan(unfolded);
      await view(page, "expand-points");
      await expect(passage).toBeVisible();
      expect(await pageCount(page)).toBe(unfolded);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(0);
      await expect(status(page)).toHaveAttribute("data-label", "saved");
    } finally {
      await removeIdea(page, title);
    }
  });
});
