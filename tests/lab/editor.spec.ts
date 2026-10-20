import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * The editor lab (PS-1A, PS-1B.2A) on a development server, signed in. It needs the
 * same account the main suite's signed-in specs use: E2E_CLERK_USER_EMAIL,
 * an admitted user of the development Clerk instance (tests/e2e/library.spec.ts
 * explains). The lab saves nothing and reads no account data; these tests
 * create, change, and delete nothing on the server.
 *
 * Measurements are printed as `LAB-MEASURE {json}` lines for the handoff.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");

test.describe.configure({ mode: "serial" });

function report(name: string, values: Record<string, unknown>) {
  console.log(
    `LAB-MEASURE ${JSON.stringify({ name, project: test.info().project.name, ...values })}`,
  );
}

async function openLab(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  const started = Date.now();
  await page.goto("/lab/editor");
  await expect(page.getByRole("heading", { level: 1, name: "Editor Lab" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
  await expect(page.getByTestId("editor-lab")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
  return Date.now() - started;
}

const editor = (page: Page) => page.getByTestId("lab-editor");
const titleOf = (page: Page, id: string) =>
  editor(page).locator(`[data-id="${id}"] > [data-type="point-title"]`);

/** Puts the cursor at the end of a point's title. */
async function intoTitle(page: Page, id: string) {
  await titleOf(page, id).click();
  await page.keyboard.press("End");
}

async function panel(page: Page, name: string) {
  // As a click does: in the editor workspace (PS-1B.2B.1) the inspector can be scrolled out of view.
  await page.getByRole("radio", { name }).evaluate((input: HTMLInputElement) => input.click());
}

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/**
 * The shell's own background work, which the lab inherits by living in the
 * (app) layout (migration document §15.2): the offline agent's Bible download.
 */
const shellBackground = /\/api\/bible\/package\//;

/** Waits until the page has made no request for `quietMs`, so a measurement starts from rest. */
async function settle(page: Page, quietMs = 2_500, limitMs = 90_000) {
  let last = Date.now();
  const listener = () => (last = Date.now());
  page.on("request", listener);
  const started = Date.now();
  while (Date.now() - last < quietMs && Date.now() - started < limitMs) {
    await page.waitForTimeout(250);
  }
  page.off("request", listener);
}

/** Requests the page makes while `work` runs, by kind. */
async function requestsDuring(page: Page, work: () => Promise<void>) {
  await settle(page);
  const seen: { url: string; type: string }[] = [];
  const listener = (request: { url(): string; resourceType(): string }) =>
    seen.push({ url: request.url(), type: request.resourceType() });
  page.on("request", listener);
  await work();
  // Anything the work set off has had time to leave.
  await page.waitForTimeout(1_500);
  page.off("request", listener);
  return seen;
}

async function measure(page: Page) {
  await panel(page, "Measure");
  await page.getByRole("button", { name: "Measure this document" }).click();
  const values: Record<string, string | null> = {};
  for (const cell of await page.locator("[data-measure]").all()) {
    values[(await cell.getAttribute("data-measure"))!] = await cell.getAttribute("data-value");
  }
  return values;
}

test.describe("editor lab, signed in", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(
    Boolean(email) && !development,
    "The lab is tested against the development Clerk instance only.",
  );

  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });

  test("writes, formats, undoes, and sends nothing while typing", async ({ page }) => {
    const loadMs = await openLab(page);
    const sermon = editor(page);
    await expect(sermon).toContainText("Every generation has asked");

    const requests = await requestsDuring(page, async () => {
      await sermon.getByText("Tonight we open the Book").click();
      await page.keyboard.press("End");
      await page.keyboard.type(" Amen and amen.");
      await page.keyboard.press("ControlOrMeta+b");
      await page.keyboard.type(" Strong words");
      await page.keyboard.press("ControlOrMeta+b");
      await page.keyboard.press("ControlOrMeta+i");
      await page.keyboard.type(" and a slant");
      await page.keyboard.press("ControlOrMeta+i");
    });
    await expect(sermon.locator("strong", { hasText: "Strong words" })).toBeVisible();
    await expect(sermon.locator("em", { hasText: "and a slant" })).toBeVisible();
    await expect(sermon).toContainText("Amen and amen.");

    // Nothing the application sends: no fetch, no XHR, no document.
    const sameOrigin = requests.filter(
      (request) =>
        new URL(request.url).origin === new URL(page.url()).origin &&
        ["fetch", "xhr", "document", "eventsource", "websocket"].includes(request.type),
    );
    const shell = sameOrigin.filter((request) => shellBackground.test(request.url));
    const own = sameOrigin.filter((request) => !shellBackground.test(request.url));
    expect(own).toEqual([]);
    report("typing-requests", {
      loadMs,
      all: requests.length,
      own: own.length,
      shellBackground: shell.map((r) => r.url),
      urls: requests.map((r) => r.url),
    });

    await page.keyboard.press("ControlOrMeta+z");
    await expect(sermon.locator("em", { hasText: "and a slant" })).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(sermon.locator("em", { hasText: "and a slant" })).toBeVisible();

    // Underline from the toolbar keeps the editor's selection.
    await page.keyboard.press("Shift+Home");
    await page.getByRole("button", { name: "Underline" }).click();
    await expect(sermon.locator("u").first()).toBeVisible();
  });

  test("renumbers on move, indent, outdent, and a change of style", async ({ page }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "Keyboard outline moves are checked at desktop size.",
    );
    await openLab(page);
    await expect(titleOf(page, "pw-1")).toHaveAttribute("data-label", "I.");
    await expect(titleOf(page, "pw-2")).toHaveAttribute("data-label", "II.");
    await expect(titleOf(page, "pw-1b")).toHaveAttribute("data-label", "B.");
    // The number is not in the text.
    await expect(titleOf(page, "pw-1")).toHaveText("The Word of God Is Pure");

    await intoTitle(page, "pw-2");
    await page.getByRole("button", { name: "Move point up" }).click();
    await expect(titleOf(page, "pw-2")).toHaveAttribute("data-label", "I.");
    await expect(titleOf(page, "pw-1")).toHaveAttribute("data-label", "II.");

    await page.keyboard.press("Alt+Shift+ArrowDown");
    await expect(titleOf(page, "pw-2")).toHaveAttribute("data-label", "II.");
    await page.keyboard.press("Alt+Shift+ArrowRight");
    await expect(titleOf(page, "pw-2")).toHaveAttribute("data-label", "C.");
    await expect(editor(page).locator('[data-id="pw-1"] [data-id="pw-2"]')).toHaveCount(1);
    await page.keyboard.press("Alt+Shift+ArrowLeft");
    await expect(titleOf(page, "pw-2")).toHaveAttribute("data-label", "II.");

    // A new point after it, numbered from the structure.
    await page.keyboard.press("ControlOrMeta+Enter");
    await page.keyboard.type("A third point");
    const third = editor(page).locator('[data-type="point-title"]', { hasText: "A third point" });
    await expect(third).toHaveAttribute("data-label", "III.");
    await page.keyboard.press("ControlOrMeta+Shift+Enter");
    await page.keyboard.type("Its first subpoint");
    await expect(
      editor(page).locator('[data-type="point-title"]', { hasText: "Its first subpoint" }),
    ).toHaveAttribute("data-label", "A.");

    // Tab is the browser's: it leaves the editor and moves nothing.
    const before = await editor(page).innerHTML();
    await page.keyboard.press("Tab");
    expect(await editor(page).evaluate((element) => element.contains(document.activeElement))).toBe(
      false,
    );
    expect(await editor(page).innerHTML()).toBe(before);

    await choose(page, "Numbering", "Decimal");
    await expect(titleOf(page, "pw-1")).toHaveAttribute("data-label", "1.");
    await expect(titleOf(page, "pw-1b")).toHaveAttribute("data-label", "1.2.");
    await choose(page, "Numbering", "Custom (POINT I: / (a) / 1.1.1.)");
    await expect(titleOf(page, "pw-1")).toHaveAttribute("data-label", "POINT I:");
    await expect(titleOf(page, "pw-1a")).toHaveAttribute("data-label", "(a)");
    await expect(titleOf(page, "pw-1")).toHaveText("The Word of God Is Pure");
  });

  test("inserts a passage, refuses one that does not exist, and copies a saved point twice", async ({
    page,
  }) => {
    await openLab(page);
    const chips = editor(page).locator(".lab-scripture");
    const blocks = editor(page).locator(".lab-passage");
    const before = await chips.count();
    const blocksBefore = await blocks.count();

    await editor(page).getByText("Be ye doers of the word").click();
    await page.keyboard.press("End");
    await panel(page, "Insert");
    await page.getByRole("textbox", { name: "Passage" }).fill("James 1:22");
    await page.getByRole("button", { name: "Insert inline reference" }).click();
    await expect(page.getByTestId("lab-scripture-message")).toHaveText("Inserted.");
    await expect(chips).toHaveCount(before + 1);
    await expect(editor(page).locator('.lab-scripture[data-book="59"]')).toHaveText("James 1:22");

    // A passage block goes after the line the cursor is on.
    await editor(page).getByText("Be ye doers of the word").click();
    await page.getByRole("textbox", { name: "Passage" }).fill("James 1:23");
    await page.getByRole("button", { name: "Insert passage" }).click();
    await expect(blocks).toHaveCount(blocksBefore + 1);
    await expect(editor(page).locator('.lab-passage[data-verse-start="23"]')).toHaveAttribute(
      "data-print",
      "full",
    );

    await page.getByRole("textbox", { name: "Passage" }).fill("John 99:1");
    await page.getByRole("button", { name: "Insert passage" }).click();
    await expect(page.getByTestId("lab-scripture-message")).not.toHaveText("Inserted.");
    await expect(chips).toHaveCount(before + 1);
    await expect(blocks).toHaveCount(blocksBefore + 1);

    // The same saved point, twice: two points with their own IDs.
    await intoTitle(page, "pw-2");
    const save = page.getByRole("button", { name: "Insert “Grace that saves”" });
    await save.click();
    await intoTitle(page, "pw-2");
    await save.click();
    const copies = editor(page).locator('[data-source-point-id="saved-grace"]');
    await expect(copies).toHaveCount(2);
    const [a, b] = await copies.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-id")),
    );
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  test("survives a reload from JSON and a legacy round trip", async ({ page }) => {
    await openLab(page);
    await editor(page).getByText("Tonight we open the Book").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Typed before the reload.");

    await panel(page, "Checks");
    await page.getByRole("button", { name: "Reload from JSON and compare" }).click();
    await expect(page.getByTestId("lab-check-result")).toHaveAttribute("data-ok", "true");
    await expect(editor(page)).toContainText("Typed before the reload.");
    await expect(titleOf(page, "pw-1")).toHaveAttribute("data-label", "I.");

    await page.getByRole("button", { name: "Convert to legacy and back" }).click();
    await expect(page.getByTestId("lab-check-result")).toHaveAttribute("data-ok", "true");

    await panel(page, "JSON");
    await page.getByRole("button", { name: "Show current JSON" }).click();
    const json = await page.getByTestId("lab-json").textContent();
    expect(json).toContain('"type": "outlinePoint"');
    expect(json).toContain('"legacyEntryId"');
    expect(json).not.toContain("data-label");
    expect(json).not.toContain('"text": "I."');

    // A legacy fixture converts, and reports what an entry cannot hold when asked.
    await choose(page, "Document", "Malformed hierarchy");
    await panel(page, "Legacy");
    await expect(page.getByTestId("lab-issues")).toContainText("orphan_parent");
  });

  test("copies and pastes nested points, plain text, and rich text from outside", async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "Clipboard handling is checked at desktop size.",
    );
    await openLab(page);

    /** A paste as the browser delivers one, through the editor's own paste handling. */
    const paste = (data: Record<string, string>) =>
      page.evaluate((entries) => {
        const transfer = new DataTransfer();
        for (const [type, value] of Object.entries(entries)) transfer.setData(type, value);
        const target = document.querySelector('[data-testid="lab-editor"]')!;
        target.dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
      }, data);

    // Copy: select from the first subpoint's title to the end of the second's, and let the editor copy it.
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="lab-editor"]')!;
      const from = root.querySelector('[data-id="pw-1a"] > [data-type="point-title"]')!.firstChild!;
      const to = root.querySelector('[data-id="pw-1b"] > [data-type="point-title"]')!.firstChild!;
      const range = document.createRange();
      range.setStart(from, 0);
      range.setEnd(to, to.textContent!.length);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.waitForTimeout(200);
    const copied = await page.evaluate(() => {
      const transfer = new DataTransfer();
      document
        .querySelector('[data-testid="lab-editor"]')!
        .dispatchEvent(
          new ClipboardEvent("copy", { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
      return { html: transfer.getData("text/html"), text: transfer.getData("text/plain") };
    });
    expect(copied.html).toContain('data-type="outline-point"');
    // Labels are never copied: they are not in the document.
    expect(copied.text).not.toMatch(/^\s*[AB]\./m);

    // Paste the points at the end of the second main point.
    await editor(page).getByText("Be ye doers of the word").click();
    await page.keyboard.press("End");
    await paste({ "text/html": copied.html, "text/plain": copied.text });
    const allIds = await editor(page)
      .locator("[data-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-id")));
    expect(new Set(allIds).size).toBe(allIds.length);
    for (const original of ["pw-1a", "pw-1b"]) {
      await expect(editor(page).locator(`[data-id="${original}"]`)).toHaveCount(1);
    }
    await expect(editor(page).locator('[data-derived-from="pw-1a"]')).toHaveCount(1);

    // Plain text from outside: each line a paragraph.
    await editor(page).getByText("Take up the Book").click();
    await page.keyboard.press("End");
    await paste({ "text/plain": "First pasted line\nSecond pasted line" });
    await expect(editor(page)).toContainText("First pasted line");
    await expect(editor(page)).toContainText("Second pasted line");

    // Rich text from a word processor: bold, italic, a list, and a passage chip that does not exist.
    await paste({
      "text/html":
        '<meta charset="utf-8"><p><b>Bold from outside</b> and <i>slanted</i></p><ul><li><p>A pasted item</p></li></ul>' +
        '<p><span data-type="scripture-reference" data-book="43" data-chapter-start="99" data-verse-start="1">John 99:1</span></p>',
      "text/plain": "Bold from outside and slanted\nA pasted item\nJohn 99:1",
    });
    await expect(editor(page).locator("strong", { hasText: "Bold from outside" })).toBeVisible();
    await expect(editor(page).locator("em", { hasText: "slanted" })).toBeVisible();
    await expect(editor(page).locator("li", { hasText: "A pasted item" })).toBeVisible();
    // The impossible passage is kept as words, not as a passage.
    await expect(editor(page)).toContainText("John 99:1");
    await expect(editor(page).locator('.lab-scripture[data-chapter-start="99"]')).toHaveCount(0);
  });

  test("schema v2: rich titles, leaving a point with Enter, and a paste between documents", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "Checked at desktop size.");
    await openLab(page);
    await choose(page, "Document", "The Lamp and the Path (schema v2, mixed)");
    await expect(titleOf(page, "lp-1")).toHaveAttribute("data-label", "I.");
    // Rich titles: the bold word is part of the title, the number is not.
    await expect(titleOf(page, "lp-1").locator("strong")).toHaveText("Illuminates");
    await expect(titleOf(page, "lp-2")).toHaveAttribute("data-label", "II.");

    // Bold in a title, from the keyboard.
    await titleOf(page, "lp-2").click();
    await page.keyboard.press("End");
    for (let index = 0; index < "Light".length; index += 1)
      await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("ControlOrMeta+b");
    await expect(titleOf(page, "lp-2").locator("strong")).toHaveText("Light");

    // Enter on an empty last line leaves the subpoint; what is typed then belongs to its parent.
    await editor(page).getByText("Plain to the simple.").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Written after the subpoint");
    const written = editor(page).getByText("Written after the subpoint");
    await expect(written).toBeVisible();
    await expect(editor(page).locator('[data-id="lp-1a"]')).not.toContainText("Written after");
    await expect(editor(page).locator('[data-id="lp-1"]')).toContainText("Written after");

    // Copy a passage block, open another document, and paste it there: it gets a new ID.
    await editor(page).locator('.lab-passage[data-id="lp-1-p1"]').click();
    const copied = await page.evaluate(() => {
      const transfer = new DataTransfer();
      document
        .querySelector('[data-testid="lab-editor"]')!
        .dispatchEvent(
          new ClipboardEvent("copy", { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
      return transfer.getData("text/html");
    });
    expect(copied).toContain("data-ps-document=");
    expect(copied).toContain('data-id="lp-1-p1"');
    await choose(page, "Document", "Outline only");
    await titleOf(page, "oo-2").click();
    await page.keyboard.press("End");
    await page.evaluate((html) => {
      const transfer = new DataTransfer();
      transfer.setData("text/html", html);
      document
        .querySelector('[data-testid="lab-editor"]')!
        .dispatchEvent(
          new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
    }, copied);
    const pasted = editor(page).locator(".lab-passage");
    await expect(pasted).toHaveCount(1);
    const id = await pasted.getAttribute("data-id");
    expect(id).toBeTruthy();
    expect(id).not.toBe("lp-1-p1");

    // The document still passes the validator and reloads unchanged.
    await panel(page, "Checks");
    await page.getByRole("button", { name: "Reload from JSON and compare" }).click();
    await expect(page.getByTestId("lab-check-result")).toHaveAttribute("data-ok", "true");
  });

  test("stays responsive on a 500-entry outline and renders nothing per keystroke", async ({
    page,
  }) => {
    await openLab(page);
    await choose(page, "Document", "500 entries (stress)");
    await expect(editor(page).locator('[data-type="outline-point"]')).toHaveCount(498);

    const first = await measure(page);
    await page.evaluate(() => {
      const slow: number[] = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) slow.push(entry.duration);
      }).observe({
        type: "event",
        durationThreshold: 16,
        buffered: false,
      } as PerformanceObserverInit);
      (window as unknown as { labSlow: number[] }).labSlow = slow;
    });
    await titleOf(page, "s-30-1").click();
    await page.keyboard.press("End");
    const started = Date.now();
    await page.keyboard.type(" — typed into a long outline", { delay: 20 });
    const typingMs = Date.now() - started;
    await page.keyboard.press("Alt+Shift+ArrowUp");
    await expect(titleOf(page, "s-30-1")).toHaveAttribute("data-label", "A.");
    const slow = await page.evaluate(() => (window as unknown as { labSlow: number[] }).labSlow);
    const second = await measure(page);

    // Typing renders no React in the lab's own tree.
    expect(second.renders).toBe(first.renders);
    report("stress", {
      first,
      second,
      typedCharacters: " — typed into a long outline".length,
      typingWallMs: typingMs,
      eventsOver16ms: slow.length,
      slowestEventMs: slow.length ? Math.max(...slow) : 0,
    });
  });

  test("records the coalesced saves of a sustained writing session", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Measured once, at desktop size.");
    // Two minutes by default; LAB_SESSION_SECONDS=900 gives the 15-minute session of §15.5 item 10.
    const sessionMs = Number(process.env.LAB_SESSION_SECONDS ?? 120) * 1000;
    test.setTimeout(sessionMs + 120_000);
    await openLab(page);
    await editor(page).getByText("Tonight we open the Book").click();
    await page.keyboard.press("End");
    await measure(page);
    const sentence =
      " The word of the Lord endureth for ever, and this is the word preached unto you.";
    const started = Date.now();
    let sentences = 0;
    // Steady writing: a sentence at about 25 characters a second, then a pause.
    while (Date.now() - started < sessionMs) {
      await editor(page).focus();
      await page.keyboard.type(sentence, { delay: 40 });
      sentences += 1;
      await page.waitForTimeout(sentences % 4 === 0 ? 4_000 : 1_200);
    }
    await page.waitForTimeout(1_500);
    const result = await measure(page);
    report("sustained", {
      seconds: Math.round((Date.now() - started) / 1000),
      sentences,
      characters: sentences * sentence.length,
      ...result,
    });
    expect(Number(result.saves)).toBeGreaterThan(0);
    expect(Number(result.saves)).toBeLessThanOrEqual(sentences + 1);
  });

  test("fits a phone: no sideways scroll, reachable controls, touch editing", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "Phone layout.");
    await openLab(page);
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
    expect(await overflow()).toBeLessThanOrEqual(0);

    const bold = page.getByRole("button", { name: "Bold" });
    await expect(bold).toBeVisible();
    const box = (await bold.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await editor(page).getByText("Tonight we open the Book").tap();
    await page.keyboard.press("End");
    await page.keyboard.type(" Written on a phone");
    await expect(editor(page)).toContainText("Written on a phone");
    for (let index = 0; index < "phone".length; index += 1)
      await page.keyboard.press("Shift+ArrowLeft");
    await bold.tap();
    await expect(editor(page).locator("strong", { hasText: "phone" })).toBeVisible();

    for (const name of ["Insert", "Measure", "JSON"]) {
      await panel(page, name);
      expect(await overflow()).toBeLessThanOrEqual(0);
    }
    await choose(page, "Document", "Six levels deep");
    await expect(titleOf(page, "n-a1x1ii")).toHaveAttribute("data-label", "(1)");
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});
