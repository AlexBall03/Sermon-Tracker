import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Rich text, fonts, typography, and named styles (PS-1B.2B.2B) in a real
 * browser: what a unit test cannot see. The selection kept through menus,
 * fields, and popovers; fonts drawn and the pages measured again when one
 * arrives; colors that follow the theme without touching the document, and
 * print in their paper colors; the Document Styles preview. On a development
 * server, signed in, as editor.spec.ts is; nothing is written anywhere.
 * Desktop only: the phone's formatting controls are a later phase.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");
const fixture = "Typography and color (B.2B)";

type Editor = import("@tiptap/core").Editor;

const editor = (page: Page) => page.getByTestId("lab-editor");

async function openLab(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/editor");
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 60_000 });
  await expect(page.getByTestId("editor-lab")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await page.getByRole("combobox", { name: "Document" }).click();
  await page.getByRole("option", { name: fixture, exact: true }).click();
  await expect(editor(page)).toContainText("Typography and Color");
}

/** Runs in the page with the lab's editor (Tiptap keeps it on its element). */
const withEditor = <T>(page: Page, run: (editor: Editor) => T) =>
  page.evaluate((source) => {
    const element = document.querySelector('[data-testid="lab-editor"]') as HTMLElement & {
      editor: Editor;
    };
    return new Function("editor", `return (${source})(editor)`)(element.editor) as T;
  }, run.toString());

/** Selects `word` (its first occurrence in the document) as a person would, by double-clicking it. */
async function selectWord(page: Page, word: string) {
  const box = await editor(page).evaluate((root, target) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = (node as Text).data.indexOf(target);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + target.length);
      (node.parentElement as HTMLElement).scrollIntoView({ block: "center" });
      const rect = range.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return null;
  }, word);
  if (!box) throw new Error(`no "${word}"`);
  await page.mouse.dblclick(box.x, box.y);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim())).toBe(word);
}

/** What is selected in the editor's own state, and whether the editor has the focus. */
const selected = (page: Page) =>
  withEditor(page, (e) => ({
    text: e.state.doc.textBetween(e.state.selection.from, e.state.selection.to),
    focused: e.view.hasFocus(),
  }));

/** The marks on the first text run that reads exactly `word`. */
const marksOf = (page: Page, word: string) =>
  page.evaluate((target) => {
    const element = document.querySelector('[data-testid="lab-editor"]') as HTMLElement & {
      editor: Editor;
    };
    let found: unknown = null;
    element.editor.state.doc.descendants((node) => {
      if (found) return false;
      if (node.isText && node.text === target) found = node.marks.map((mark) => mark.toJSON());
      return true;
    });
    return found;
  }, word);

test.describe("typography and rich text", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "The lab is tested against the development Clerk instance only.",
  );
  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Desktop formatting controls.");
  });

  test("keeps the selection through the font menu, the size field, and the color popover", async ({
    page,
  }) => {
    await openLab(page);
    await selectWord(page, "default");

    // A menu: the font is applied to the word, and the word is still selected, in the editor.
    await page.getByRole("combobox", { name: "Font", exact: true }).click();
    await page.getByRole("option", { name: "Merriweather", exact: true }).click();
    expect(await marksOf(page, "default")).toEqual([
      { type: "textStyle", attrs: { color: null, fontFamily: "merriweather", fontSize: null } },
    ]);
    await expect.poll(() => selected(page)).toEqual({ text: "default", focused: true });

    // A field: typed, Enter, back in the text with the same selection.
    const size = page.getByRole("combobox", { name: "Font size" });
    await size.click();
    await size.fill("20");
    await size.press("Enter");
    expect(await marksOf(page, "default")).toEqual([
      { type: "textStyle", attrs: { color: null, fontFamily: "merriweather", fontSize: 20 } },
    ]);
    await expect.poll(() => selected(page)).toEqual({ text: "default", focused: true });

    // A popover with its own fields: a custom exact color typed in, then applied.
    await page.getByRole("button", { name: "Text color" }).click();
    await page
      .getByTestId("lab-color-ink")
      .getByRole("radio", { name: "Exact" })
      .evaluate((input: HTMLInputElement) => input.click());
    const hex = page.getByRole("textbox", { name: "Hex color: Custom color" });
    await hex.fill("#7c2d12");
    await page.getByTestId("lab-color-ink").getByRole("button", { name: "Apply" }).click();
    expect(await marksOf(page, "default")).toEqual([
      {
        type: "textStyle",
        attrs: {
          color: { mode: "exact", color: "#7c2d12" },
          fontFamily: "merriweather",
          fontSize: 20,
        },
      },
    ]);
    await expect.poll(() => selected(page)).toEqual({ text: "default", focused: true });

    // Other text is untouched, and each change was one step to undo.
    expect(await marksOf(page, "Lora by ")).toEqual([]);
    const steps = await withEditor(page, (e) => {
      let count = 0;
      while (e.can().undo() && count < 10) {
        e.commands.undo();
        count += 1;
      }
      return count;
    });
    expect(steps).toBe(3);
  });

  test("a format chosen at a collapsed cursor applies to what is typed next", async ({ page }) => {
    await openLab(page);
    await selectWord(page, "ayúdame");
    await page.keyboard.press("End");
    const size = page.getByRole("combobox", { name: "Font size" });
    await size.click();
    await size.fill("24");
    await size.press("Enter");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.type(" Amén");
    const marks = (await marksOf(page, " Amén")) as unknown[];
    expect(marks).toHaveLength(2);
    expect(marks).toContainEqual({ type: "bold" });
    expect(marks).toContainEqual({
      type: "textStyle",
      attrs: { color: null, fontFamily: null, fontSize: 24 },
    });
  });

  test("named styles change the look only, and the paragraph style menu rests in a title", async ({
    page,
  }) => {
    await openLab(page);
    await selectWord(page, "Lora");
    const attrs = await withEditor(page, (e) => JSON.stringify(e.state.doc.attrs));
    await page.getByRole("combobox", { name: "Paragraph style" }).click();
    await page.getByRole("option", { name: "Heading 2", exact: true }).click();
    await expect(editor(page).locator("h2", { hasText: "Lora by default" })).toHaveCSS(
      "font-size",
      "21.3333px",
    );
    expect(await withEditor(page, (e) => JSON.stringify(e.state.doc.attrs))).toBe(attrs);
    await expect.poll(() => selected(page)).toMatchObject({ focused: true });

    await selectWord(page, "title");
    await expect(page.getByRole("combobox", { name: "Paragraph style" })).toBeDisabled();
  });

  test("colors follow the theme without touching the document, and print in paper colors", async ({
    page,
  }) => {
    await openLab(page);
    const colorOf = (text: string) =>
      editor(page).evaluate((root, target) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if ((node as Text).data.includes(target))
            return getComputedStyle(node.parentElement!).color;
        }
        return null;
      }, text);
    const before = {
      json: await withEditor(page, (e) => JSON.stringify(e.getJSON())),
      undo: await withEditor(page, (e) => e.can().undo()),
      html: await editor(page).innerHTML(),
    };
    const light = { blue: await colorOf("Adaptive blue"), exact: await colorOf("exact navy") };

    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const dark = {
      blue: await colorOf("Adaptive blue"),
      exact: await colorOf("exact navy"),
      themed: await colorOf("per theme"),
      onFill: await colorOf("red on a custom fill"),
    };
    expect(dark.blue).not.toBe(light.blue);
    // Exact stays exact; per theme is the person's dark color.
    expect(dark.exact).toBe("rgb(30, 58, 138)");
    expect(dark.themed).toBe("rgb(253, 186, 116)");
    expect(dark.onFill).not.toBe(dark.blue);
    expect(await withEditor(page, (e) => JSON.stringify(e.getJSON()))).toBe(before.json);
    expect(await withEditor(page, (e) => e.can().undo())).toBe(before.undo);
    expect(await editor(page).innerHTML()).toBe(before.html);

    // Printing from the dark theme draws the light (paper) colors.
    await page.emulateMedia({ media: "print" });
    expect(await colorOf("Adaptive blue")).toBe(light.blue);
    expect(await colorOf("per theme")).toBe("rgb(124, 45, 18)");
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  });

  test("Document Styles previews, cancels to nothing, and applies in one undo step", async ({
    page,
  }) => {
    await openLab(page);
    await page
      .getByRole("radio", { name: "Styles" })
      .evaluate((input: HTMLInputElement) => input.click());
    const panel = page.getByTestId("lab-document-styles");
    const body = editor(page).locator("p", { hasText: "Lora by default" });
    await expect(body).toHaveCSS("font-size", "16px");
    const json = await withEditor(page, (e) => JSON.stringify(e.getJSON()));

    const size = panel.locator('[data-field="fontSize"]').getByRole("textbox");
    await size.fill("15");
    await size.press("Enter");
    await expect(body).toHaveCSS("font-size", "20px");
    await expect(panel.locator('[data-field="fontSize"]')).toContainText("Customized");
    expect(await withEditor(page, (e) => JSON.stringify(e.getJSON()))).toBe(json);
    expect(await withEditor(page, (e) => e.can().undo())).toBe(false);

    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(body).toHaveCSS("font-size", "16px");
    expect(await withEditor(page, (e) => JSON.stringify(e.getJSON()))).toBe(json);

    await size.fill("15");
    await size.press("Enter");
    await panel.getByRole("button", { name: "Apply" }).click();
    await expect(body).toHaveCSS("font-size", "20px");
    expect(await withEditor(page, (e) => e.getJSON().attrs?.styles)).toEqual({
      version: 1,
      named: { normal: { fontSize: 15 } },
    });
    // Text with its own size keeps it.
    await expect(editor(page).locator('[data-font-size="11"]')).toHaveCSS("font-size", /^14\.66/);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(body).toHaveCSS("font-size", "16px");
    expect(await withEditor(page, (e) => JSON.stringify(e.getJSON()))).toBe(json);
  });

  test("Print Layout measures mixed sizes and a font that arrives late, with no line in a page gap", async ({
    page,
  }) => {
    await openLab(page);
    await page
      .getByRole("radio", { name: "Print", exact: true })
      .evaluate((input: HTMLInputElement) => input.click());
    await expect(editor(page)).toHaveAttribute("data-layout", "print");
    const pages = () => editor(page).locator(".lab-pages").getAttribute("data-pages").then(Number);
    const settle = () =>
      page.evaluate(async () => {
        await document.fonts.ready;
        for (let i = 0; i < 6; i += 1)
          await new Promise((resolve) => requestAnimationFrame(resolve));
      });
    await settle();
    const first = await pages();

    // A family nothing on the page used yet: it downloads, and the pages follow it.
    await page
      .getByRole("radio", { name: "Styles" })
      .evaluate((input: HTMLInputElement) => input.click());
    const panel = page.getByTestId("lab-document-styles");
    await panel.locator('[data-field="fontFamily"]').getByRole("combobox").click();
    await page.getByRole("option", { name: "Cormorant Garamond", exact: true }).click();
    await panel.locator('[data-field="fontSize"]').getByRole("textbox").fill("20");
    await panel.locator('[data-field="fontSize"]').getByRole("textbox").press("Enter");
    await panel.getByRole("button", { name: "Apply" }).click();
    await settle();
    const loaded = await page.evaluate(() =>
      Array.from(document.fonts).some(
        (face) => face.family.includes("Cormorant") && face.status === "loaded",
      ),
    );
    expect(loaded).toBe(true);
    const after = await pages();
    expect(after).toBeGreaterThan(first);

    // The pages were measured after the font arrived: measuring again changes nothing.
    await page
      .getByRole("radio", { name: "Regular", exact: true })
      .evaluate((input: HTMLInputElement) => input.click());
    await page
      .getByRole("radio", { name: "Print", exact: true })
      .evaluate((input: HTMLInputElement) => input.click());
    await settle();
    expect(await pages()).toBe(after);

    // No line of text, in any font or size, sits in a page gap.
    const crossings = await editor(page).evaluate((root) => {
      const gaps = Array.from(root.querySelectorAll(".lab-page-gap")).map((gap) =>
        gap.getBoundingClientRect(),
      );
      const bad: string[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest(".lab-pages")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const line of Array.from(range.getClientRects())) {
          if (line.height === 0) continue;
          for (const gap of gaps) {
            if (line.top < gap.bottom - 1 && line.bottom > gap.top + 1) {
              bad.push((node as Text).data.slice(0, 30));
            }
          }
        }
      }
      return bad;
    });
    expect(crossings).toEqual([]);
  });
});

/*
 * The caret around sections (PS-1B.2B.2B, the owner's checks): Enter at the
 * start of a section's title moves the section down; a press in the space
 * just above a section lands on the nearest line, already while it is held;
 * a press between two boxes gives the caret between them, drawn in the space
 * between them; and the application's bar never shows over the workspace.
 */
test.describe("the caret around sections", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "The lab is tested against the development Clerk instance only.",
  );
  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Desktop pointer and keys.");
  });

  /** The lab on its first document (The Power of God's Word), once the splash has lifted. */
  async function openDefault(page: Page) {
    await page.goto("/sign-in");
    await clerk.signIn({ page, emailAddress: email ?? "" });
    await page.goto("/lab/editor");
    await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, {
      timeout: 60_000,
    });
    await expect(page.getByTestId("editor-lab")).toHaveAttribute("data-ready", "true", {
      timeout: 60_000,
    });
  }

  const selection = (page: Page) =>
    withEditor(page, (e) => ({
      type: e.state.selection.toJSON().type as string,
      block: e.state.selection.$head.parent.type.name,
      text: e.state.selection.$head.parent.textContent.slice(0, 12),
    }));

  test("Enter moves a section down, and a press just above it lands on the empty line", async ({
    page,
  }) => {
    await openDefault(page);
    // The application's bar is hidden behind the workspace.
    await expect(page.locator("header").first()).toBeHidden();

    await editor(page).getByText("Conclusion", { exact: true }).click();
    await page.keyboard.press("Home");
    await expect.poll(async () => (await selection(page)).text).toBe("Conclusion");
    await page.keyboard.press("Enter");
    // The section moved down under a new empty line; the caret stayed on its title.
    expect(await selection(page)).toMatchObject({ block: "sectionTitle", text: "Conclusion" });
    const box = await page.evaluate(() => {
      const section = document.querySelector(
        '[data-testid=lab-editor] .lab-section[data-role="conclusion"]',
      )!;
      const empty = section.previousElementSibling as HTMLElement;
      empty.scrollIntoView({ block: "center" });
      return {
        empty: empty.outerHTML.startsWith("<p><br"),
        x: empty.getBoundingClientRect().left + 200,
        // The space between the empty line and the section's rule.
        y: (empty.getBoundingClientRect().bottom + section.getBoundingClientRect().top) / 2,
      };
    });
    expect(box.empty).toBe(true);
    await editor(page).getByText("Take up the Book").click();
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    expect(await selection(page)).toMatchObject({ type: "text", block: "paragraph", text: "" });
    await page.mouse.up();
    expect(await selection(page)).toMatchObject({ type: "text", block: "paragraph", text: "" });
  });

  test("a press between a section and a point gives the caret between them, in the space between them", async ({
    page,
  }) => {
    await openDefault(page);
    const space = await page.evaluate(() => {
      const intro = document.querySelector(
        '[data-testid=lab-editor] .lab-section[data-role="introduction"]',
      )!;
      const point = intro.nextElementSibling as HTMLElement;
      const title = point.querySelector(".lab-title")!;
      return {
        x: intro.getBoundingClientRect().left + 200,
        above: intro.getBoundingClientRect().bottom,
        // The point's own box begins where the white space between the two ends.
        start: point.getBoundingClientRect().top,
        // Where the title's words begin (its box begins higher, with its own top padding).
        below: (() => {
          const range = document.createRange();
          range.selectNodeContents(title);
          return range.getClientRects()[0].top;
        })(),
      };
    });
    await page.mouse.click(space.x, (space.above + space.start) / 2);
    await expect.poll(async () => (await selection(page)).type).toBe("gapcursor");
    const caret = page.locator(".lab-gap-caret");
    await expect(caret).toBeVisible();
    const drawn = (await caret.boundingBox())!;
    // In the white space: below the introduction's rule, above the point's title, never on either.
    expect(drawn.y).toBeGreaterThanOrEqual(space.above);
    expect(drawn.y + drawn.height).toBeLessThanOrEqual(space.below);
  });
});
