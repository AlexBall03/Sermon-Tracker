import { readFileSync } from "node:fs";

import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { workspaceLayout } from "@/features/sermon-editor/layout";

import { editorLab } from "@/i18n/dictionaries/en/editorLab";
import { ref } from "../fixtures";
import { blockState, textState } from "../formatting-state";
import { writeTabLayout } from "../pagination/preferences";
import { renderColor } from "../styles/colors";
import type { DocumentStyles } from "../styles/model";
import { presetInForce } from "../styles/plugin";
import { presets } from "../styles/presets";
import { componentVariables, styleSheet } from "../styles/render";
import {
  builtInComponents,
  builtInDefaults,
  builtInNamed,
  resolveComponent,
  resolveNamed,
} from "../styles/resolve";
import { labV4Extensions, loadV4 } from "./extensions";
import {
  componentGallery,
  documentV4,
  noteV4,
  passageV4,
  pointV4,
  proseV4,
  whenIdolsFall,
} from "./fixtures";
import { labelEm } from "./numbering";
import { paperMeta } from "./paper";
import { caret, ownership } from "./testing";

/*
 * A1-UI.1, presentation: the Balanced preset as the cascade's first level,
 * the baseline kept exactly for the v3 lab, component colors drawn as custom
 * properties (unset, off, and a color kept apart), and the labels that say
 * what a note or a script is, without entering the document.
 */

const scope = ".lab-editor[data-sheet='t']";

const editors: Editor[] = [];
function open(content: JSONContent, labels = true) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: labV4Extensions({ componentLabels: labels ? editorLab.v4.components : undefined }),
  });
  const loaded = loadV4(editor, content, "doc-a");
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems));
  editors.push(editor);
  return editor;
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

const scriptV4 = (id: string, text: string, depth: number): JSONContent => ({
  type: "script",
  attrs: { id, depth },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

const sermon = documentV4([
  pointV4("intro", "Introduction", 1, { role: "introduction" }),
  proseV4("Why this psalm.", 1),
  pointV4("p-1", "The lamp", 1),
  passageV4("s-1", ref(19, 119, 105), 1),
  noteV4("n-1", "Ask who walked in the dark.", 1),
  scriptV4("sc-1", "Friends, see one thing.", 1),
  pointV4("p-1a", "A small light", 2),
]);

describe("the baseline preset (the v3 lab, unchanged)", () => {
  it("is what the resolver used before presets, under the same names", () => {
    expect(builtInDefaults).toBe(presets.baseline.defaults);
    expect(builtInNamed).toBe(presets.baseline.named);
    expect(builtInComponents).toBe(presets.baseline.components);
    expect(builtInDefaults).toMatchObject({ fontFamily: "lora", lineHeight: 1.5, spaceAfter: 6 });
    expect(resolveComponent(null, "point")).toMatchObject({
      fontFamily: "figtree",
      fontSize: 13.5,
    });
  });

  it("draws no component colors, so a v3 sheet is the same with or without the argument", () => {
    const styles: DocumentStyles = {
      version: 1,
      components: { preacherNote: { fill: "yellow" }, point: { titleColor: "blue" } },
    };
    expect(styleSheet(styles, scope)).toBe(styleSheet(styles, scope, presets.baseline));
    expect(styleSheet(styles, scope)).not.toContain("--ps-");
  });
});

describe("the Balanced preset", () => {
  it("is the v4 editor's default, shown on the editor for its CSS", () => {
    const editor = open(sermon);
    expect(presetInForce(editor.state)).toBe(presets.balanced);
    expect(editor.view.dom.getAttribute("data-preset")).toBe("balanced");
  });

  it("is level 1: the outline's styles override it, and a node's own format overrides both", () => {
    const balanced = presets.balanced;
    expect(resolveNamed(null, "normal", null, balanced).fontFamily).toBe("source-serif-4");
    const styles: DocumentStyles = { version: 1, components: { point: { fontSize: 15 } } };
    expect(resolveComponent(styles, "point", null, balanced)).toMatchObject({
      fontSize: 15,
      fontFamily: "source-sans-3",
    });
    expect(resolveComponent(styles, "point", { fontSize: 16 }, balanced).fontSize).toBe(16);
  });

  it("is what the toolbar reports as inherited, in a point and in writing", () => {
    const editor = open(sermon);
    caret(editor, "p-1", 2);
    expect(textState(editor.state)).toMatchObject({ fontFamily: "source-sans-3", fontSize: 13 });
    expect(blockState(editor.state)).toMatchObject({ spaceBefore: 12, spaceAfter: 3 });
    caret(editor, "Why this psalm.", 1);
    expect(textState(editor.state)).toMatchObject({ fontFamily: "source-serif-4", fontSize: 12 });
  });

  it("changes no content, structure, or identity", () => {
    const balanced = open(sermon);
    const baseline = new Editor({
      element: document.createElement("div"),
      extensions: labV4Extensions({ preset: "baseline" }),
    });
    editors.push(baseline);
    loadV4(baseline, sermon, "doc-b");
    expect(balanced.getJSON()).toEqual(baseline.getJSON());
    expect(ownership(balanced)).toEqual(ownership(baseline));
  });
});

describe("component colors", () => {
  const balanced = presets.balanced;

  it("are drawn only where set: unset gives no property, so the preset's own treatment applies", () => {
    expect(componentVariables(null, balanced)).toEqual([]);
    // No color property is set; the structural face (A1-UI.2A) is not a color. The rules only
    // read a single node's own properties (`--ps-*-i-*`, A1-UI.2B.1), with the style's as fallback.
    const sheet = styleSheet(null, scope, balanced);
    expect(sheet).not.toMatch(/[{;]\s*--ps-(?!structure-font)[\w-]+\s*:/);
    expect(sheet).not.toMatch(/var\(--ps-(?![a-z]+-i-|structure-font)/);
  });

  it("keep turned off apart from unset: no fill, no border, or no accent is transparent", () => {
    const lines = componentVariables(
      { version: 1, components: { script: { accent: null }, preacherNote: { fill: null } } },
      balanced,
    );
    expect(lines).toContain("--ps-script-accent: transparent");
    expect(lines).toContain("--ps-script-accent-d: transparent");
    expect(lines).toContain("--ps-note-fill: transparent");
    expect(lines.some((line) => line.startsWith("--ps-note-ink"))).toBe(false);
  });

  it("give each theme its variant, and keep an exact color exact in the dark theme too", () => {
    const lines = componentVariables(
      {
        version: 1,
        components: {
          preacherNote: { fill: "yellow" },
          scripture: { accent: { mode: "exact", color: "#123456" } },
        },
      },
      balanced,
    );
    expect(lines).toContain(`--ps-note-fill: ${renderColor("yellow", "fill", "light")}`);
    expect(lines).toContain(`--ps-note-fill-d: ${renderColor("yellow", "fill", "dark")}`);
    expect(lines).toContain("--ps-scripture-accent: #123456");
    expect(lines).toContain("--ps-scripture-accent-d: #123456");
  });

  it("keep text on a fill readable, judged with the fill, in each theme", () => {
    const sheet = styleSheet(
      { version: 1, components: { preacherNote: { fill: { mode: "exact", color: "#fde047" } } } },
      scope,
      balanced,
    );
    // The theme's light text would be unreadable on yellow in the dark theme: the note's text is dark there.
    const dark =
      /\.dark [^{]*\.lab-note [^{]*\{ color: var\(--ps-note-i-color-d, (#[0-9a-f]{6})\); \}/.exec(
        sheet,
      );
    expect(dark).not.toBeNull();
    expect(dark![1]).not.toBe("#efebe2");
    expect(sheet).toMatch(/--ps-note-ink-d: #[0-9a-f]{6}/);
  });

  it("give a point's title its title color", () => {
    const sheet = styleSheet(
      { version: 1, components: { point: { titleColor: { mode: "exact", color: "#1e3a8a" } } } },
      scope,
      balanced,
    );
    expect(sheet).toMatch(
      /p\.lab-v4-point\[data-depth="1"\]:not\(\[data-role\]\) \{[^}]*color: var\(--ps-point-i-color, #1e3a8a\)/,
    );
  });
});

describe("component labels", () => {
  it("say what a note (by its kind) and a script are, to the eye and to assistive technology", () => {
    const editor = open(sermon);
    const note = editor.view.dom.querySelector("aside.lab-note")!;
    expect(note.getAttribute("data-component-label")).toBe("Reminder");
    expect(note.getAttribute("role")).toBe("note");
    expect(note.getAttribute("aria-roledescription")).toBe("Reminder");
    const script = editor.view.dom.querySelector(".lab-script")!;
    expect(script.getAttribute("data-component-label")).toBe("Script");
    expect(script.getAttribute("role")).toBe("group");
    expect(script.getAttribute("aria-roledescription")).toBe("Script");
  });

  it("are never the outline's text: not in its JSON, its HTML, or its words", () => {
    const editor = open(sermon);
    expect(JSON.stringify(editor.getJSON())).not.toMatch(/Reminder|"Script"/);
    expect(editor.getHTML()).not.toContain("data-component-label");
    expect(editor.state.doc.textContent).not.toContain("Reminder");
  });

  it("are left out when the editor is given no words", () => {
    const editor = open(sermon, false);
    expect(editor.view.dom.querySelector("[data-component-label]")).toBeNull();
  });
});

describe("layout and paper (A1-UI.1)", () => {
  it("is Print Layout on a desktop, and Regular elsewhere unless this tab chose Print", () => {
    writeTabLayout(null);
    expect(workspaceLayout(true)).toBe("print");
    expect(workspaceLayout(false)).toBe("regular");
    writeTabLayout("print");
    expect(workspaceLayout(false)).toBe("print");
    writeTabLayout("regular");
    expect(workspaceLayout(true)).toBe("print");
    writeTabLayout(null);
  });

  it("draws Print Layout on light paper and Regular Layout on none, changing nothing in the outline", () => {
    const editor = open(sermon);
    const dom = editor.view.dom;
    editor.commands.setLayout("regular");
    expect(dom.hasAttribute("data-paper")).toBe(false);
    caret(editor, "p-1", 3);
    editor.commands.insertContent("x");
    const json = JSON.stringify(editor.getJSON());
    const { from } = editor.state.selection;
    editor.commands.setLayout("print");
    expect(dom.getAttribute("data-paper")).toBe("light");
    editor.view.dispatch(editor.state.tr.setMeta(paperMeta, "dark").setMeta("addToHistory", false));
    expect(dom.getAttribute("data-paper")).toBe("dark");
    editor.commands.setLayout("regular");
    // The outline, the caret, and the history are as they were: one undo takes back the typing.
    expect(JSON.stringify(editor.getJSON())).toBe(json);
    expect(editor.state.selection.from).toBe(from);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    editor.commands.undo();
    expect(editor.state.doc.textContent).not.toContain("Thex lamp");
    expect(editor.can().undo()).toBe(false);
  });

  it("keeps light paper out of the dark theme's colors", () => {
    const sheet = styleSheet(
      { version: 1, named: { title: { color: "#1e3a8a" } } },
      scope,
      presets.balanced,
    );
    const dark = /@media screen { (.*) }/.exec(sheet)![1];
    expect(dark).toContain(`.dark ${scope}:not([data-paper="light"])`);
    expect(dark).not.toMatch(/.dark .lab-editor[data-sheet='t'] /);
  });
});

/*
 * A1-UI.2A: hanging point numbers, the shared structural face, and the
 * realistic benchmark sermon. All of it is presentation: decorations and
 * the generated sheet, never the document.
 */
describe("Balanced, A1-UI.2A", () => {
  it("hangs a point's number: its first line starts the column back, after its own first-line indent", () => {
    const sheet = styleSheet(null, scope, presets.balanced);
    expect(sheet).toMatch(
      /p\.lab-v4-point\[data-depth="1"\]:not\(\[data-role\]\) \{[^}]*text-indent: calc\(0pt - var\(--x-hang, 0px\)\)/,
    );
    const styles: DocumentStyles = { version: 1, components: { point: { indentFirst: 9 } } };
    expect(styleSheet(styles, scope, presets.balanced)).toContain(
      "text-indent: calc(9pt - var(--x-hang, 0px))",
    );
    // Prose keeps a plain first-line indent, and the baseline hangs nothing.
    expect(sheet).toMatch(/p:not\(\.lab-title\)[^{]*\{[^}]*text-indent: 0pt/);
    expect(styleSheet(null, scope)).not.toContain("--x-hang");
  });

  it("draws the structural face once, as a shared default each label can override", () => {
    const editorRule = styleSheet(null, scope, presets.balanced).split("\n")[0];
    expect(editorRule.startsWith(`${scope} {`)).toBe(true);
    expect(editorRule).toContain("--ps-structure-font: var(--lab-font-source-sans-3");
    expect(styleSheet(null, scope)).not.toContain("--ps-structure-font");
    expect(presets.baseline.structureFont).toBeNull();
    expect(presets.baseline.hangingNumbers).toBe(false);
  });

  it("estimates a label's width generously, wider for longer and custom labels", () => {
    expect(labelEm("I.")).toBeLessThan(labelEm("III."));
    expect(labelEm("III.")).toBeLessThan(labelEm("VIII."));
    expect(labelEm("1.")).toBeLessThan(labelEm("2.1.1."));
    expect(labelEm("POINT VIII:")).toBeGreaterThan(4);
    // Every built-in main-point label up to VIII fits the one-step column at 13pt (22pt ≈ 1.7em) with its gap…
    expect(labelEm("IV.") + 0.35).toBeLessThan(22 / 13);
    // …and a parenthesised letter is never estimated narrower than it is drawn (about 1.29em).
    expect(labelEm("(b)")).toBeGreaterThanOrEqual(1.25);
    // Figures are as wide as letters in Source Sans 3 bold (measured at 13pt, A1-UI.2A.1):
    // `2.1.1.` draws 2.48em and `10.` 1.36em, so neither may be estimated narrower.
    expect(labelEm("2.1.1.")).toBeGreaterThanOrEqual(2.48);
    expect(labelEm("10.")).toBeGreaterThanOrEqual(1.36);
  });

  it("gives every point at one depth the column of its widest label, as a decoration only", () => {
    const editor = open(sermon);
    const labelled = [
      ...editor.view.dom.querySelectorAll<HTMLElement>("p.lab-v4-point[data-label]"),
    ];
    const byDepth = new Map<string, Set<string>>();
    const widest = new Map<string, number>();
    for (const heading of labelled) {
      const depth = heading.getAttribute("data-depth")!;
      byDepth.set(
        depth,
        (byDepth.get(depth) ?? new Set()).add(heading.style.getPropertyValue("--x-label")),
      );
      widest.set(
        depth,
        Math.max(widest.get(depth) ?? 0, labelEm(heading.getAttribute("data-label")!)),
      );
    }
    expect(byDepth.size).toBeGreaterThan(0);
    for (const [depth, columns] of byDepth) {
      expect([...columns]).toEqual([`${widest.get(depth)}em`]);
    }
    const heading = editor.view.dom.querySelector<HTMLElement>('[data-id="p-1"]')!;
    expect(heading.getAttribute("data-label")).toBe("I.");
    expect(JSON.stringify(editor.getJSON())).not.toContain("--x-label");
    expect(editor.getHTML()).not.toContain("--x-label");
  });

  it("opens the benchmark sermon unchanged, with the same outline under either preset", () => {
    const balanced = open(whenIdolsFall);
    const baseline = new Editor({
      element: document.createElement("div"),
      extensions: labV4Extensions({ preset: "baseline" }),
    });
    editors.push(baseline);
    expect(loadV4(baseline, whenIdolsFall, "doc-b").ok).toBe(true);
    expect(balanced.getJSON()).toEqual(baseline.getJSON());
    expect(ownership(balanced)).toEqual(ownership(baseline));
    // Its title and subtitle are styled writing (placeholders for the A1-UI.2C header), not attributes.
    expect(balanced.state.doc.attrs.subtitle ?? null).toBeNull();
    expect(balanced.state.doc.child(0).attrs.styleName).toBe("title");
  });
});

/*
 * A1-UI.2A.1: Balanced's refined component colors are the preset's defaults
 * only. Each component's drawn color (`--x-*`) reads the outline's own
 * property first (`--ps-*`, its `-d` variant on the dark screen), so the
 * cascade still runs preset, outline, node; and the per-kind treatments
 * (`--k-*`) live only under Balanced, never reaching the v3 baseline.
 */
describe("Balanced component colors (A1-UI.2A.1)", () => {
  const css = readFileSync("src/features/editor-lab/v4/lab-v4.css", "utf8");
  const colorParts =
    /^\s*(--x-(?:accent|border|fill|ink|label|reference|notation|frame-[a-z]+)):\s*([^;]+);/gm;
  const darkStart = css.indexOf("@media screen {");
  const darkEnd = css.indexOf("@media print", darkStart);

  it("draws every component color from the outline's own property first", () => {
    const found = [...css.matchAll(colorParts)];
    expect(found.length).toBeGreaterThan(20);
    for (const [, name, value] of found) {
      expect(value, name).toMatch(/^var\(--ps-/);
    }
  });

  it("gives the dark screen only the outline's dark variants, over the same fallbacks", () => {
    expect(darkStart).toBeGreaterThan(0);
    const darkParts = [...css.slice(darkStart, darkEnd).matchAll(colorParts)];
    expect(darkParts.length).toBeGreaterThan(10);
    for (const [, name, value] of darkParts) {
      expect(value, name).toMatch(/^var\(--ps-[a-z-]+-d,/);
    }
  });

  it("keeps the kinds' treatments to the studio presets and draws a label for every kind", () => {
    // Every token is the studio's (Balanced's values, A1-UI.2B.1) or one named preset's, never the baseline's.
    // One rule body at a time, so a rule inside `@media` is read under its own selector.
    for (const rule of css.matchAll(/([^{}]+)\{[^{}]*--k-[a-z-]+:/g)) {
      expect(rule[1]).toMatch(/\[data-studio\]|\[data-preset="(minimal|expressive)"\]/);
    }
    expect(css).not.toContain('[data-preset="baseline"]');
    expect(css).not.toContain('[data-preset="balanced"]');
    for (const kind of ["question", "illustration", "application", "reminder", "cue", "task"]) {
      expect(css).toContain(`.lab-note[data-kind="${kind}"]`);
    }
  });

  it("opens the component gallery unchanged under either preset", () => {
    const balanced = open(componentGallery);
    const baseline = new Editor({
      element: document.createElement("div"),
      extensions: labV4Extensions({ preset: "baseline" }),
    });
    editors.push(baseline);
    expect(loadV4(baseline, componentGallery, "doc-g").ok).toBe(true);
    expect(balanced.getJSON()).toEqual(baseline.getJSON());
    const kinds = [...balanced.view.dom.querySelectorAll<HTMLElement>(".lab-note")].map(
      (note) => note.dataset.kind,
    );
    expect(new Set(kinds)).toEqual(
      new Set(["question", "illustration", "application", "note", "task", "reminder", "cue"]),
    );
  });
});
