import { readFileSync } from "node:fs";

import { Editor, type JSONContent } from "@tiptap/core";
import { redo, undo } from "@tiptap/pm/history";
import { DOMParser } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { renderColor } from "../styles/colors";
import {
  componentStyleSchemas,
  documentStylesSchema,
  narrowAppearance,
  userPresetIds,
} from "../styles/model";
import { presetIdInForce, presetInForce } from "../styles/plugin";
import { presets } from "../styles/presets";
import { appearanceStyle, styleSheet } from "../styles/render";
import { resolveAt } from "../styles/context";
import { resolveComponent } from "../styles/resolve";
import { setRole } from "./commands";
import { rebase } from "./plugins";
import { catchUp } from "./caret-sync";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, noteV4, passageV4, pointV4, proseV4, whenIdolsFall } from "./fixtures";
import { ref } from "../fixtures";
import { allIds, caret, owners, press, textStart } from "./testing";
import { labV4Schema } from "./extensions";
import { restoreV4 } from "./validate";

/*
 * A1-UI.2B.1: the three presentation presets, the outline's own choice of
 * one, the treatment properties, a single component's own appearance drawn,
 * the resets, and the section boundary's spacing and caret.
 */

const scope = ".lab-editor[data-sheet='t']";
const editors: Editor[] = [];

function open(content: JSONContent, preset: "baseline" | "balanced" = "balanced") {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, extensions: labV4Extensions({ preset }) });
  const loaded = loadV4(editor, content, "doc-a");
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.problems));
  editors.push(editor);
  return editor;
}
afterEach(() => {
  while (editors.length) {
    const editor = editors.pop()!;
    editor.view.dom.parentElement?.remove();
    editor.destroy();
  }
});

const withAttrs = (node: JSONContent, attrs: Record<string, unknown>): JSONContent => ({
  ...node,
  attrs: { ...node.attrs, ...attrs },
});

const sermon = documentV4([
  pointV4("intro", "Introduction", 1, { role: "introduction" }),
  proseV4("Why this psalm.", 1),
  pointV4("p-1", "The lamp", 1),
  withAttrs(passageV4("s-1", ref(19, 119, 105), 1), { appearance: { fill: "blue" } }),
  passageV4("s-2", ref(19, 119, 106), 1),
  noteV4("n-1", "Ask who walked in the dark.", 1),
  withAttrs(pointV4("p-1a", "A small light", 2), { appearance: { titleColor: "red" } }),
]);

/** Where the first top-level node of `type` (and with `id`, when given) starts. */
function posOf(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;
  editor.state.doc.forEach((node, pos) => {
    if (found === null && node.type.name === type && (!id || node.attrs.id === id)) found = pos;
  });
  if (found === null) throw new Error(`no ${type}`);
  return found;
}

describe("the presets", () => {
  it("are three a person may choose, beside the v3 lab's baseline", () => {
    expect(userPresetIds).toEqual(["minimal", "balanced", "expressive"]);
    expect(Object.keys(presets).sort()).toEqual(["balanced", "baseline", "expressive", "minimal"]);
  });

  it("each resolve every property, and draw components except the baseline", () => {
    for (const id of userPresetIds) {
      const preset = presets[id];
      expect(preset.componentColors, id).toBe(true);
      expect(preset.hangingNumbers, id).toBe(true);
      for (const kind of ["introduction", "point", "subpoint", "preacherNote"] as const) {
        const resolved = resolveComponent(null, kind, null, preset);
        expect(resolved.fontFamily, `${id} ${kind}`).toBeTruthy();
        expect(resolved.fontSize, `${id} ${kind}`).toBeGreaterThan(8);
      }
    }
    expect(presets.baseline.componentColors).toBe(false);
  });

  it("keep their hierarchy: a main point is never smaller than a subpoint", () => {
    for (const id of userPresetIds) {
      const point = resolveComponent(null, "point", null, presets[id]);
      const sub = resolveComponent(null, "subpoint", null, presets[id]);
      expect(point.fontSize, id).toBeGreaterThan(sub.fontSize);
      expect(point.spaceBefore, id).toBeGreaterThan(sub.spaceBefore);
    }
  });

  it("show on the editor: every studio preset as data-studio, the baseline without it", () => {
    const studio = open(sermon);
    expect(studio.view.dom.dataset.preset).toBe("balanced");
    expect(studio.view.dom.hasAttribute("data-studio")).toBe(true);
    const lab = open(sermon, "baseline");
    expect(lab.view.dom.dataset.preset).toBe("baseline");
    expect(lab.view.dom.hasAttribute("data-studio")).toBe(false);
  });

  it("leave the baseline's sheet alone: no component rule, no single node's properties", () => {
    const sheet = styleSheet(null, scope, presets.baseline);
    expect(sheet).not.toContain("--ps-");
    expect(sheet).not.toContain(".lab-passage {");
  });
});

describe("the outline's own preset", () => {
  it("is stored as styles.preset, from the three only", () => {
    expect(documentStylesSchema.safeParse({ version: 1, preset: "minimal" }).success).toBe(true);
    expect(documentStylesSchema.safeParse({ version: 1, preset: "baseline" }).success).toBe(false);
    expect(documentStylesSchema.safeParse({ version: 1, preset: "loud" }).success).toBe(false);
  });

  it("wins over the editor's default, and a document without one keeps the default", () => {
    const plain = open(sermon);
    expect(presetIdInForce(plain.state)).toBe("balanced");
    const chosen = open({
      ...sermon,
      attrs: { ...sermon.attrs, styles: { version: 1, preset: "expressive" } },
    });
    expect(presetIdInForce(chosen.state)).toBe("expressive");
    expect(chosen.view.dom.dataset.preset).toBe("expressive");
    // The v3 lab's editor reads an outline's choice the same way.
    const lab = open(
      { ...sermon, attrs: { ...sermon.attrs, styles: { version: 1, preset: "minimal" } } },
      "baseline",
    );
    expect(presetIdInForce(lab.state)).toBe("minimal");
  });

  it("changes nothing but itself: words, identities, ownership, numbering, appearances, and overrides stay", () => {
    const styled = {
      ...whenIdolsFall,
      attrs: {
        ...whenIdolsFall.attrs,
        styles: {
          version: 1,
          components: { scripture: { fill: "pink" } },
          defaults: { fontSize: 13 },
        },
      },
    };
    const editor = open(styled);
    caret(editor, "wif-intro", 4);
    const before = editor.getJSON();
    const ids = allIds(editor);
    const owned = owners(editor);
    const selection = editor.state.selection.toJSON();
    for (const id of ["minimal", "expressive", "balanced"] as const) {
      expect(editor.commands.setOutlinePreset(id)).toBe(true);
      expect(editor.view.dom.dataset.preset).toBe(id);
      const after = editor.getJSON();
      expect(after.attrs!.styles).toEqual({ ...styled.attrs.styles, preset: id });
      expect({ ...after, attrs: { ...after.attrs, styles: null } }).toEqual({
        ...before,
        attrs: { ...before.attrs, styles: null },
      });
      expect(allIds(editor)).toEqual(ids);
      expect(owners(editor)).toEqual(owned);
      expect(editor.state.selection.toJSON()).toEqual(selection);
    }
  });

  it("is undone in one step each, and redone", () => {
    const editor = open(sermon);
    editor.commands.setOutlinePreset("minimal");
    editor.commands.setOutlinePreset("expressive");
    undo(editor.state, editor.view.dispatch);
    expect(presetIdInForce(editor.state)).toBe("minimal");
    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc.attrs.styles).toBeNull();
    expect(presetIdInForce(editor.state)).toBe("balanced");
    redo(editor.state, editor.view.dispatch);
    expect(presetIdInForce(editor.state)).toBe("minimal");
  });

  it("refuses the baseline and a choice already made", () => {
    const editor = open(sermon);
    expect(editor.commands.setOutlinePreset("baseline" as never)).toBe(false);
    expect(editor.commands.setOutlinePreset("minimal")).toBe(true);
    expect(editor.commands.setOutlinePreset("minimal")).toBe(false);
  });

  it("redraws the sheet and the toolbar's inherited values", () => {
    const editor = open(sermon);
    caret(editor, "p-1", 2);
    const balanced = resolveAt(null, editor.state.selection.$head, presetInForce(editor.state));
    editor.commands.setOutlinePreset("expressive");
    const expressive = resolveAt(null, editor.state.selection.$head, presetInForce(editor.state));
    expect(balanced.fontSize).toBe(13);
    expect(expressive.fontSize).toBe(14);
    const sheet = document.head.querySelector<HTMLStyleElement>(
      `style[data-lab-sheet="${editor.view.dom.dataset.sheet}"]`,
    )!.textContent!;
    expect(sheet).toContain("14pt");
  });
});

describe("resets", () => {
  const styled = {
    ...sermon,
    attrs: {
      ...sermon.attrs,
      styles: {
        version: 1,
        preset: "minimal",
        defaults: { fontSize: 13 },
        components: { scripture: { fill: "pink" }, preacherNote: { italic: true } },
      },
    },
  };

  it("of one component take away its own appearance only", () => {
    const editor = open(styled);
    const pos = posOf(editor, "scripturePassage", "s-1");
    expect(editor.commands.setComponentAppearance(pos, null)).toBe(true);
    expect(editor.state.doc.nodeAt(pos)!.attrs.appearance).toBeNull();
    expect(editor.getJSON().attrs!.styles).toEqual(styled.attrs.styles);
  });

  it("of a component type take away that type's style only", () => {
    const editor = open(styled);
    expect(editor.commands.setComponentStyle("scripture", null)).toBe(true);
    expect(editor.getJSON().attrs!.styles).toEqual({
      version: 1,
      preset: "minimal",
      defaults: { fontSize: 13 },
      components: { preacherNote: { italic: true } },
    });
    expect(
      editor.state.doc.nodeAt(posOf(editor, "scripturePassage", "s-1"))!.attrs.appearance,
    ).toEqual({
      fill: "blue",
    });
  });

  it("of the outline keep its preset and every node's own appearance", () => {
    const editor = open(styled);
    expect(editor.commands.resetOutlineToPreset()).toBe(true);
    expect(editor.getJSON().attrs!.styles).toEqual({ version: 1, preset: "minimal" });
    expect(
      editor.state.doc.nodeAt(posOf(editor, "scripturePassage", "s-1"))!.attrs.appearance,
    ).toEqual({
      fill: "blue",
    });
    // Without a preset to keep, nothing is left: null, never an empty object.
    const plain = open({
      ...sermon,
      attrs: { ...sermon.attrs, styles: { version: 1, defaults: { fontSize: 13 } } },
    });
    plain.commands.resetOutlineToPreset();
    expect(plain.state.doc.attrs.styles).toBeNull();
  });

  it("refuse what the contracts refuse", () => {
    const editor = open(sermon);
    expect(editor.commands.setComponentStyle("point", { fill: "blue" } as never)).toBe(false);
    const pos = posOf(editor, "scripturePassage", "s-1");
    expect(editor.commands.setComponentAppearance(pos, { radius: 99 })).toBe(false);
    expect(
      editor.commands.setComponentAppearance(posOf(editor, "paragraph"), { fill: "blue" }),
    ).toBe(false);
  });
});

describe("appearance changes are attribute changes only", () => {
  it("make no structural step, keep marks, IDs, and ownership, trip no guard, and undo and redo exactly", () => {
    const notices: unknown[] = [];
    const element = document.createElement("div");
    const editor = new Editor({
      element,
      extensions: labV4Extensions({ onNotice: (notice) => notices.push(notice) }),
    });
    editors.push(editor);
    loadV4(editor, whenIdolsFall, "doc-a");
    const start = editor.state.doc;
    const ids = allIds(editor);
    const owned = owners(editor);
    const steps: string[] = [];
    editor.on("transaction", ({ transaction }) =>
      transaction.steps.forEach((step) => steps.push(step.constructor.name)),
    );
    const passage = posOf(editor, "scripturePassage");
    const point = posOf(editor, "point", "wif-intro");
    const changes = [
      () => editor.commands.setOutlinePreset("expressive"),
      () => editor.commands.setComponentStyle("preacherNote", { fill: "green", radius: 2 }),
      () => editor.commands.setComponentAppearance(passage, { fill: "blue", accentWidth: 3 }),
      () => editor.commands.setComponentAppearance(point, { fill: "yellow", titleColor: "red" }),
      () => editor.commands.setComponentAppearance(passage, null),
      () => editor.commands.setComponentStyle("preacherNote", null),
      () => editor.commands.resetOutlineToPreset(),
      () => editor.commands.setOutlinePreset("minimal"),
    ];
    const docs = [start];
    for (const change of changes) {
      expect(change()).toBe(true);
      docs.push(editor.state.doc);
      expect(allIds(editor)).toEqual(ids);
      expect(owners(editor)).toEqual(owned);
      // Words and marks are untouched: only attributes differ.
      expect(editor.state.doc.textContent).toBe(start.textContent);
    }
    expect(new Set(steps)).toEqual(new Set(["DocAttrStep", "AttrStep"]));
    expect(notices).toEqual([]);
    for (let index = docs.length - 2; index >= 0; index -= 1) {
      undo(editor.state, editor.view.dispatch);
      expect(editor.state.doc.eq(docs[index])).toBe(true);
    }
    for (let index = 1; index < docs.length; index += 1) {
      redo(editor.state, editor.view.dispatch);
      expect(editor.state.doc.eq(docs[index])).toBe(true);
    }
  });
});

describe("treatment properties", () => {
  it("are bounded, from a closed list, and only on components drawn with lines", () => {
    const note = componentStyleSchemas.preacherNote;
    expect(
      note.safeParse({ borderStyle: "double", borderWidth: 1.5, accentWidth: 3, radius: 6 })
        .success,
    ).toBe(true);
    expect(note.safeParse({ borderStyle: "groove" }).success).toBe(false);
    expect(note.safeParse({ borderWidth: 5 }).success).toBe(false);
    expect(note.safeParse({ accentWidth: -1 }).success).toBe(false);
    expect(note.safeParse({ radius: 13 }).success).toBe(false);
    expect(note.safeParse({ radius: "4px" }).success).toBe(false);
    expect(componentStyleSchemas.introduction.safeParse({ accentWidth: 2.5 }).success).toBe(true);
    expect(componentStyleSchemas.introduction.safeParse({ radius: 4 }).success).toBe(false);
    expect(componentStyleSchemas.point.safeParse({ borderWidth: 1 }).success).toBe(false);
  });

  it("are drawn as the outline's properties, which the studio CSS reads first", () => {
    const sheet = styleSheet(
      { version: 1, components: { script: { borderStyle: "dashed", borderWidth: 0, radius: 2 } } },
      scope,
      presets.balanced,
    );
    expect(sheet).toContain("--ps-script-border-style: dashed");
    expect(sheet).toContain("--ps-script-border-w: 0pt");
    expect(sheet).toContain("--ps-script-radius: 2pt");
    const css = readFileSync("src/features/editor-lab/v4/lab-v4.css", "utf8");
    for (const part of ["border-style", "border-w", "accent-w", "radius"]) {
      for (const name of ["scripture", "note", "script"]) {
        expect(css, `${name}-${part}`).toContain(`var(--ps-${name}-${part},`);
      }
    }
  });
});

describe("a single component's own appearance", () => {
  it("is drawn on its node, as the same properties, over its type's style", () => {
    const editor = open({
      ...sermon,
      attrs: {
        ...sermon.attrs,
        styles: { version: 1, components: { scripture: { fill: "pink" } } },
      },
    });
    const own = editor.view.nodeDOM(posOf(editor, "scripturePassage", "s-1")) as HTMLElement;
    const other = editor.view.nodeDOM(posOf(editor, "scripturePassage", "s-2")) as HTMLElement;
    expect(own.style.getPropertyValue("--ps-scripture-fill")).toBe(
      renderColor("blue", "fill", "light"),
    );
    expect(own.style.getPropertyValue("--ps-scripture-fill-d")).toBe(
      renderColor("blue", "fill", "dark"),
    );
    expect(other.getAttribute("style") ?? "").not.toContain("--ps-scripture-fill");
    // The node's data is unchanged, and copy and paste still carry it.
    expect(own.getAttribute("data-appearance")).toBe(JSON.stringify({ fill: "blue" }));
  });

  it("follows a change of the appearance, and is gone when it is reset", () => {
    const editor = open(sermon);
    const pos = posOf(editor, "scripturePassage", "s-2");
    editor.commands.setComponentAppearance(pos, { accentWidth: 4, borderStyle: "dashed" });
    const dom = () => editor.view.nodeDOM(pos) as HTMLElement;
    expect(dom().style.getPropertyValue("--ps-scripture-accent-w")).toBe("4pt");
    expect(dom().style.getPropertyValue("--ps-scripture-border-style")).toBe("dashed");
    editor.commands.setComponentAppearance(pos, null);
    expect(dom().getAttribute("style") ?? "").not.toContain("--ps-");
  });

  it("writes only what it sets, judges its text on its own fill, and keeps turned off apart", () => {
    const resolved = resolveComponent(
      null,
      "preacherNote",
      { fill: "yellow", fontSize: 12 },
      presets.balanced,
    );
    const style = appearanceStyle("preacherNote", resolved, { fill: "yellow", fontSize: 12 });
    expect(style).toContain("--ps-note-i-size: 12pt");
    expect(style).toMatch(/--ps-note-i-color-d: #[0-9a-f]{6}/);
    expect(style).toMatch(/--ps-note-ink: #[0-9a-f]{6}/);
    expect(style).not.toContain("--ps-note-i-font:");
    const off = appearanceStyle(
      "preacherNote",
      resolveComponent(null, "preacherNote", { fill: null }, presets.balanced),
      { fill: null },
    );
    expect(off).toContain("--ps-note-fill: transparent");
  });

  it("gives a point its title color, and its own format still comes last", () => {
    const editor = open(sermon);
    const pos = posOf(editor, "point", "p-1a");
    const dom = editor.view.nodeDOM(pos) as HTMLElement;
    expect(dom.style.getPropertyValue("--ps-subpoint-i-color")).toBe(
      renderColor("red", "ink", "light"),
    );
    // The toolbar reports it, as the editor draws it.
    caret(editor, "p-1a", 2);
    expect(resolveAt(null, editor.state.selection.$head, presetInForce(editor.state)).color).toBe(
      "red",
    );
  });

  it("is not drawn by the baseline, which never drew one", () => {
    const editor = open(sermon, "baseline");
    const dom = editor.view.nodeDOM(posOf(editor, "scripturePassage", "s-1")) as HTMLElement;
    expect(dom.getAttribute("style") ?? "").not.toContain("--ps-");
  });

  it("keeps a section's lines and fill on every block of the section", () => {
    const editor = open(
      documentV4([
        withAttrs(pointV4("intro", "Introduction", 1, { role: "introduction" }), {
          appearance: { fill: "green", accentWidth: 3 },
        }),
        proseV4("Why this psalm.", 1),
        pointV4("p-1", "The lamp", 1),
      ]),
    );
    const body = editor.view.nodeDOM(textStart(editor, "Why this psalm.") - 1) as HTMLElement;
    expect(body.dataset.frame).toBe("introduction");
    expect(body.style.getPropertyValue("--ps-intro-fill")).toBe(
      renderColor("green", "fill", "light"),
    );
    expect(body.style.getPropertyValue("--ps-intro-accent-w")).toBe("3pt");
  });
});

describe("appearance data stays valid", () => {
  it("the validator refuses a passage's, a note's, or a script's appearance outside its contract", () => {
    for (const [node, bad] of [
      [passageV4("s-1", ref(19, 119, 105), 0), { labelColor: "red" }],
      [noteV4("n-1", "A note.", 0), { radius: 40 }],
      [
        { type: "script", attrs: { id: "sc-1", depth: 0 }, content: [{ type: "paragraph" }] },
        { referenceColor: "red" },
      ],
    ] as [JSONContent, object][]) {
      const restored = restoreV4(documentV4([withAttrs(node, { appearance: bad })]), labV4Schema());
      expect(restored.ok, JSON.stringify(bad)).toBe(false);
      const good = restoreV4(
        documentV4([withAttrs(node, { appearance: { fill: "blue" } })]),
        labV4Schema(),
      );
      expect(good.ok).toBe(true);
    }
  });

  it("a section's appearance is read back from copied HTML", () => {
    const editor = open(
      documentV4([
        withAttrs(pointV4("intro", "Introduction", 1, { role: "introduction" }), {
          appearance: { fill: "green", borderStyle: "dashed" },
        }),
        proseV4("Why.", 1),
      ]),
    );
    const html = editor.getHTML();
    expect(html).toContain("data-appearance");
    const copy = open(documentV4([proseV4("x", 0)]));
    copy.commands.setContent(html, { emitUpdate: false });
    const intro = copy.state.doc.firstChild!;
    expect(intro.attrs.role).toBe("introduction");
    expect(intro.attrs.appearance).toEqual({ fill: "green", borderStyle: "dashed" });
  });

  it("is narrowed to a point's when a section's role is taken away, so the outline still loads", () => {
    expect(narrowAppearance({ fill: "green", titleColor: "red", accentWidth: 2 }, "point")).toEqual(
      {
        titleColor: "red",
      },
    );
    expect(narrowAppearance({ fill: "green" }, "point")).toBeNull();
    const editor = open(
      documentV4([
        withAttrs(pointV4("intro", "Introduction", 1, { role: "introduction" }), {
          appearance: { fill: "green", titleColor: "red" },
        }),
        proseV4("Why.", 1),
      ]),
    );
    caret(editor, "intro", 2);
    expect(setRole(null)(editor.state, editor.view.dispatch)).toBe(true);
    const point = editor.state.doc.firstChild!;
    expect(point.attrs.role).toBeNull();
    expect(point.attrs.appearance).toEqual({ titleColor: "red" });
    expect(restoreV4(editor.getJSON(), labV4Schema()).ok).toBe(true);
  });

  it("is narrowed when a pasted section loses its role to the one already there", () => {
    const source = open(
      documentV4([
        withAttrs(pointV4("intro", "Opening", 1, { role: "introduction" }), {
          appearance: { fill: "green", titleColor: "red" },
        }),
        proseV4("Why.", 1),
      ]),
    );
    // What a paste parses from the copied HTML, then rebases where it lands (`transformPasted`).
    const element = document.createElement("div");
    element.innerHTML = source.getHTML();
    const slice = DOMParser.fromSchema(source.schema).parseSlice(element);
    const target = open(sermon);
    caret(target, "Why this psalm.", 3);
    const notices: unknown[] = [];
    const rebased = rebase(slice, target.state.doc, target.state.selection.$from, (notice) =>
      notices.push(notice),
    );
    const pasted = rebased.content.firstChild!;
    expect(pasted.type.name).toBe("point");
    expect(pasted.attrs.role).toBeNull();
    expect(pasted.attrs.appearance).toEqual({ titleColor: "red" });
    expect(notices).toEqual([{ code: "role_dropped", role: "introduction" }]);
    target.view.dispatch(target.state.tr.replaceSelection(rebased));
    expect(restoreV4(target.getJSON(), labV4Schema()).ok).toBe(true);
  });
});

describe("section boundaries (A1-UI.2B.1)", () => {
  const css = readFileSync("src/features/editor-lab/v4/lab-v4.css", "utf8");

  it("put a section's rule at the top of its heading's box, lifted by the heading's own space before", () => {
    const sheet = styleSheet(null, scope, presets.balanced);
    const intro = resolveComponent(null, "introduction", null, presets.balanced);
    expect(sheet).toMatch(
      new RegExp(
        `p\\.lab-v4-point\\[data-role="introduction"\\] \\{[^}]*--x-space-before: var\\(--ps-intro-i-before, ${intro.spaceBefore}pt\\)`,
      ),
    );
    expect(css).toContain("top: calc(-1 * var(--x-space-before");
  });

  it("keep an empty heading's rule its own width, over Print Layout's empty-line mark", () => {
    // The mark (`lab.css`) made the rule one pixel wide while its margin took the line back, so the
    // caret was drawn a line's width left of the page.
    expect(css).toMatch(
      /p\.lab-v4-point\.lab-v4-frame-start:has\(> br\.ProseMirror-trailingBreak:first-child\)::before \{\s*width: 100%;\s*height: 0;/,
    );
  });

  it("close a section that ends in a container under its box, where its own border cannot cover it", () => {
    expect(css).toContain(".lab-v4-frame-end:is(.lab-passage, .lab-note, .lab-script)");
    // A real border on `::after` (A1-UI.2B.2), so the section's style reaches it, as a text block's.
    expect(css).toMatch(
      /\.lab-v4-frame-end:is\(\.lab-passage, \.lab-note, \.lab-script\)::after \{[^}]*border-top: var\(--x-frame-border-w\) var\(--x-frame-border-style\) var\(--x-frame-border\);/,
    );
    expect(css).not.toMatch(/box-shadow: 0 var\(--k-section-end-gap\)/);
  });
});

describe("a key pressed before the browser's selectionchange arrives (A1-UI.2B.1)", () => {
  // A focused editor scrolls a change into view, and jsdom lays nothing out: give it empty boxes.
  const rect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 });
  for (const proto of [Range.prototype, Text.prototype] as unknown as Record<string, unknown>[]) {
    proto.getClientRects ??= () => [];
    proto.getBoundingClientRect ??= rect;
  }

  /** The browser's caret moved (as a click moves it) without ProseMirror hearing of it yet. */
  function browserCaret(editor: Editor, name: string, offset: number, focusOffset = offset) {
    const view = editor.view;
    view.dom.setAttribute("tabindex", "0");
    view.focus();
    const at = (o: number) => view.domAtPos(textStart(editor, name) + o);
    const anchor = at(offset);
    const focus = at(focusOffset);
    view.dom.ownerDocument
      .getSelection()!
      .setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
  }

  it("acts on the caret the browser shows: a click at a heading's start, then Backspace", () => {
    const editor = open(sermon);
    caret(editor, "intro", "Introduction".length);
    browserCaret(editor, "intro", 0);
    expect(editor.state.selection.$head.parentOffset).toBe("Introduction".length);
    expect(press(editor, "Backspace")).toBe(true);
    // The designed edge: the heading becomes writing, because that is where the caret was.
    expect(editor.state.doc.firstChild!.type.name).toBe("paragraph");
    expect(editor.state.doc.firstChild!.textContent).toBe("Introduction");
  });

  it("never converts a heading the caret has left: a click at its end, then Backspace", () => {
    const editor = open(sermon);
    caret(editor, "intro", 0);
    browserCaret(editor, "intro", "Introduction".length);
    // The v4 keys leave a plain Backspace inside a heading to the browser.
    expect(press(editor, "Backspace")).toBe(false);
    expect(editor.state.doc.firstChild!.type.name).toBe("point");
    expect(editor.state.selection.$head.parentOffset).toBe("Introduction".length);
  });

  it("does not replace a selection that is gone: a click away from it, then typing", () => {
    const editor = open(sermon);
    const from = textStart(editor, "intro") + 2;
    const to = textStart(editor, "Why this psalm.") + 3;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
    );
    browserCaret(editor, "p-1", 3);
    press(editor, "x");
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.from).toBe(textStart(editor, "p-1") + 3);
    expect(editor.state.doc.textContent).toContain("IntroductionWhy this psalm.");
  });

  it("does nothing when unsure: no focus, or a selection outside the editor", () => {
    const editor = open(sermon);
    caret(editor, "intro", 4);
    const before = editor.state.selection.head;
    expect(catchUp(editor.view)).toBe(false);
    const outside = document.createElement("p");
    outside.textContent = "elsewhere";
    document.body.append(outside);
    editor.view.dom.setAttribute("tabindex", "0");
    editor.view.focus();
    document.getSelection()!.collapse(outside.firstChild!, 2);
    expect(catchUp(editor.view)).toBe(false);
    expect(editor.state.selection.head).toBe(before);
    outside.remove();
  });

  it("changes nothing but the selection, and adds no history", () => {
    const editor = open(sermon);
    caret(editor, "intro", 0);
    const doc = editor.state.doc;
    browserCaret(editor, "p-1", 2);
    expect(catchUp(editor.view)).toBe(true);
    expect(editor.state.doc).toBe(doc);
    undo(editor.state, editor.view.dispatch);
    expect(editor.state.doc).toBe(doc);
  });
});
