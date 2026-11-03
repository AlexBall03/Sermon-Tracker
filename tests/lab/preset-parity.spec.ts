import { readFileSync, writeFileSync } from "node:fs";

import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Preset parity (A4.2A): an outline stored before A4.2A, which names no
 * preset revision, is drawn exactly as it was. A4.2A moved the presets'
 * single-valued lines and space from the studio CSS into `presets.ts` and
 * added level and number styles; none of that may change what an existing
 * outline looks like. This reads the computed styles of every container,
 * section, and numbered point in two fixtures, in each preset and theme, and
 * compares them with `preset-parity.baseline.json`, which was recorded from
 * the code before A4.2A (`git archive 7c9d3b6`, served on its own port, with
 * `PARITY_RECORD` set to the file to write). Desktop Chromium; nothing is
 * written anywhere but that file when recording.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");
const record = process.env.PARITY_RECORD;
const baselineFile = "tests/lab/preset-parity.baseline.json";

const fixtures = [
  "When Idols Fall (a realistic sermon)",
  "Component gallery (every note, script, and passage)",
];
const presetIds = ["minimal", "balanced", "expressive"] as const;
const themes = ["light", "dark"] as const;

type Snapshot = Record<string, Record<string, string>>;

async function openV4(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/editor/v4");
  await expect(page.getByTestId("sermon-workspace")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-splash", /.+/, { timeout: 30_000 });
}

async function chooseFixture(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Document" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByTestId("sermon-editor")).toBeVisible();
  await page.waitForTimeout(300);
}

/** Every measured element's computed properties, by a stable name. */
function measure(page: Page, preset: string, theme: string) {
  return page.evaluate(
    async ({ preset, theme }) => {
      const root = document.querySelector('[data-testid="sermon-editor"]') as HTMLElement & {
        editor: { commands: { setOutlinePreset: (id: string) => boolean } };
      };
      document.documentElement.classList.toggle("dark", theme === "dark");
      root.editor.commands.setOutlinePreset(preset);
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const props = [
        "border-top-width",
        "border-right-width",
        "border-bottom-width",
        "border-left-width",
        "border-top-style",
        "border-left-style",
        "border-top-color",
        "border-left-color",
        "border-bottom-color",
        "border-top-left-radius",
        "border-top-right-radius",
        "border-bottom-right-radius",
        "border-bottom-left-radius",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "margin-top",
        "margin-bottom",
        "margin-left",
        "background-color",
        "color",
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "line-height",
        "text-indent",
        "text-align",
      ];
      const out: Record<string, Record<string, string>> = {};
      const read = (name: string, element: Element, pseudo?: string) => {
        const style = getComputedStyle(element, pseudo);
        out[name] = Object.fromEntries(props.map((prop) => [prop, style.getPropertyValue(prop)]));
        if (pseudo) out[name].content = style.content;
        if (pseudo) out[name]["min-width"] = style.minWidth;
      };
      // The document's own blocks: never Print Layout's page gaps, which move with the text.
      const blocks = Array.from(root.children).filter(
        (child) => !child.matches(".lab-page-gap, .lab-page-end, .ProseMirror-widget"),
      );
      blocks.forEach((block, index) => {
        const element = block as HTMLElement;
        const tag = `${index}:${element.tagName.toLowerCase()}.${element.className
          .split(" ")
          .filter((name) => name.startsWith("lab-") && name !== "lab-v4-resume")
          .sort()
          .join(".")}${element.dataset.kind ? `[${element.dataset.kind}]` : ""}`;
        read(tag, element);
        if (element.matches(".lab-numbered, .lab-v4-frame-start, .lab-note, .lab-script"))
          read(`${tag}::before`, element, "::before");
        if (element.matches(".lab-v4-frame-end")) read(`${tag}::after`, element, "::after");
      });
      return out;
    },
    { preset, theme },
  );
}

test("an outline that names no preset revision is drawn exactly as before A4.2A", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Desktop Chromium measures the presets.");
  test.skip(!email || !development, "Needs the development Clerk instance and a test user.");
  test.setTimeout(240_000);
  await clerkSetup({ publishableKey });
  await openV4(page);
  const snapshot: Record<string, Snapshot> = {};
  for (const fixture of fixtures) {
    await chooseFixture(page, fixture);
    for (const preset of presetIds) {
      for (const theme of themes) {
        snapshot[`${fixture} | ${preset} | ${theme}`] = await measure(page, preset, theme);
      }
    }
  }
  if (record) {
    writeFileSync(record, `${JSON.stringify(snapshot, null, 1)}\n`);
    return;
  }
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8")) as Record<string, Snapshot>;
  expect(Object.keys(snapshot)).toEqual(Object.keys(baseline));
  const differences: string[] = [];
  for (const [key, elements] of Object.entries(baseline)) {
    expect(Object.keys(snapshot[key]), key).toEqual(Object.keys(elements));
    for (const [element, values] of Object.entries(elements)) {
      for (const [prop, value] of Object.entries(values)) {
        const now = snapshot[key][element]?.[prop];
        // A border that is not drawn has no visible color; webpack and Turbopack order the base
        // layer's \`border-color\` differently, so only a drawn border's color is compared.
        const side = /^border-(top|left|bottom)-color$/.exec(prop)?.[1];
        if (side && values[`border-${side}-width`] === "0px") continue;
        if (now !== value) differences.push(`${key} | ${element} | ${prop}: ${value} → ${now}`);
      }
    }
  }
  expect(differences).toEqual([]);
});
