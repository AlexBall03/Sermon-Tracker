import type { JSONContent } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { asV2, documentFixtures, point, sermonDocument, text, unreadableLayout } from "./documents";
import { powerOfGodsWord } from "./fixtures";
import { documentToLegacy } from "./legacy";
import { migrateDocument, migrateV2 } from "./migrate";
import { labSchema } from "./schema/extensions";
import {
  documentStylesSchema,
  fontKeys,
  fontRegistry,
  isFontSize,
  pageSetupSchema,
  type DocumentStyles,
} from "./styles/model";
import {
  builtInDefaults,
  builtInNamed,
  componentOf,
  namedStyleOf,
  readStyles,
  resolveComponent,
  resolveNamed,
} from "./styles/resolve";
import { restoreDocument } from "./validate";

/*
 * Schema v3 (PS-1B.2B.2 B.2A): v2 documents keep loading, the style
 * contracts are strict, the resolver inherits one property at a time, and a
 * legacy reader is told everything v3 adds that it cannot hold.
 */

const schema = labSchema();

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** The v3 fixtures that use nothing v3 added: each has a faithful v2 form. */
const plainFixtures = Object.entries(documentFixtures).filter(
  ([name]) => name !== "stylesAndScript" && name !== "typography",
);

describe("v2 documents keep loading", () => {
  it.each(plainFixtures)(
    "%s, as schema v2 wrote it, becomes exactly the v3 document",
    (_name, v3) => {
      const v2 = deepFreeze(asV2(v3));
      expect(v2.attrs?.schemaVersion).toBe(2);
      const restored = restoreDocument(v2, schema);
      if (!restored.ok) throw new Error(JSON.stringify(restored.problems));
      expect(restored.migratedFrom).toBe(2);
      expect(restored.warnings).toEqual([]);
      expect(restored.doc.toJSON()).toEqual(v3);
    },
  );

  it.each(plainFixtures)(
    "%s: the migration changes the version only, and leaves the Outline Layout as it was",
    (_name, v3) => {
      const v2 = deepFreeze(asV2(v3));
      const migrated = migrateDocument(v2);
      if (!migrated.ok) throw new Error(migrated.code);
      expect(migrated.from).toBe(2);
      const { schemaVersion, ...attrs } = migrated.doc.attrs!;
      const { schemaVersion: was, ...attrsBefore } = v2.attrs!;
      expect([was, schemaVersion]).toEqual([2, 3]);
      // The same objects: nothing in the layout or the content was rebuilt or rewritten.
      expect(attrs).toEqual(attrsBefore);
      expect(migrated.doc.attrs!.layout).toBe(v2.attrs!.layout);
      expect(migrated.doc.content).toBe(v2.content);
    },
  );

  it("is pure, never lowers a version, and returns a v3 document as it is", () => {
    const v2 = deepFreeze(asV2(documentFixtures.outlineOnly));
    expect(migrateV2(v2)).not.toBe(v2);
    const once = migrateDocument(v2);
    if (!once.ok) throw new Error(once.code);
    const again = migrateDocument(once.doc);
    expect(again.ok && again.doc).toBe(once.doc);
    expect(again.ok && again.from).toBe(3);
  });

  it("keeps a v2 layout it cannot read as a warning, verbatim", () => {
    const v2 = deepFreeze(asV2(unreadableLayout));
    const restored = restoreDocument(v2, schema);
    if (!restored.ok) throw new Error(JSON.stringify(restored.problems));
    expect(restored.migratedFrom).toBe(2);
    expect(restored.warnings).toEqual([{ code: "invalid_layout", path: "/attrs/layout" }]);
    expect(restored.doc.attrs.layout).toEqual(unreadableLayout.attrs!.layout);
  });
});

describe("a document older than v3 holds only what its version could", () => {
  const v2 = () => structuredClone(asV2(documentFixtures.outlineOnly));
  const script = {
    type: "script",
    attrs: { id: "s-1" },
    content: [{ type: "paragraph", content: [{ type: "text", text: "said" }] }],
  };
  const cases: [string, () => JSONContent, string, string][] = [
    [
      "the v3 fixture labelled v2 (its heading 1 comes first)",
      () => asV2(documentFixtures.stylesAndScript),
      "unknown_attribute",
      "/content/2",
    ],
    [
      "a Script",
      () => {
        const doc = v2();
        doc.content!.push(script);
        return doc;
      },
      "unknown_node",
      "/content/3",
    ],
    [
      "a document style, even null",
      () => {
        const doc = v2();
        doc.attrs!.styles = null;
        return doc;
      },
      "unknown_attribute",
      "",
    ],
    [
      "an appearance on a point, even null",
      () => {
        const doc = v2();
        doc.content![0].attrs!.appearance = null;
        return doc;
      },
      "unknown_attribute",
      "/content/0",
    ],
    [
      "a level-one heading",
      () => {
        const doc = v2();
        doc.content!.push({
          type: "heading",
          attrs: { level: 1, textAlign: null },
          content: [{ type: "text", text: "Big" }],
        });
        return doc;
      },
      "unknown_attribute",
      "/content/3",
    ],
    [
      "a font size on text",
      () => {
        const doc = v2();
        doc.content![0].content![0].content = [
          { type: "text", text: "First", marks: [{ type: "textStyle", attrs: { fontSize: 14 } }] },
        ];
        return doc;
      },
      "unknown_attribute",
      "/content/0/content/0/content/0/marks/0",
    ],
  ];

  it.each(cases)("refuses %s, naming where, without changing it", (_name, make, code, path) => {
    const json = deepFreeze(make());
    const before = structuredClone(json);
    const restored = restoreDocument(json, schema);
    expect(restored.ok).toBe(false);
    if (restored.ok) return;
    expect(restored.problems[0]).toMatchObject({ code });
    if (path) expect(restored.problems.map((problem) => problem.path)).toContain(path);
    expect(json).toEqual(before);
  });

  it("refuses a v1 document holding a Script too", () => {
    const v1 = structuredClone(powerOfGodsWord);
    v1.content!.push({
      type: "script",
      attrs: { id: "s-1" },
      content: [{ type: "paragraph", content: [{ type: "text", text: "said" }] }],
    });
    const restored = restoreDocument(v1, schema);
    expect(restored.ok ? [] : restored.problems.map((problem) => problem.code)).toEqual([
      "unknown_node",
    ]);
  });
});

describe("the style contracts", () => {
  it("the font registry is stable: keys are never renamed or removed", () => {
    expect(fontKeys).toEqual([
      "lora",
      "source-serif-4",
      "eb-garamond",
      "merriweather",
      "tinos",
      "figtree",
      "inter",
      "source-sans-3",
      "atkinson-hyperlegible-next",
      "arimo",
      "jetbrains-mono",
      "cousine",
      "playfair-display",
      "cormorant-garamond",
    ]);
    const categories = new Set(Object.values(fontRegistry).map((font) => font.category));
    expect([...categories].sort()).toEqual(["display", "mono", "sans", "serif"]);
  });

  it("a font size is points, 4 to 144, in half points", () => {
    for (const size of [4, 10.5, 12, 144]) expect(isFontSize(size), String(size)).toBe(true);
    for (const size of [3.5, 12.25, 144.5, Number.NaN, Infinity, "12" as unknown]) {
      expect(isFontSize(size), String(size)).toBe(false);
    }
  });

  it("accepts the fixture's styles and page setup exactly, and nothing extra", () => {
    const { styles, page } = documentFixtures.stylesAndScript.attrs!;
    expect(documentStylesSchema.safeParse(styles).success).toBe(true);
    expect(pageSetupSchema.safeParse(page).success).toBe(true);
    expect(documentStylesSchema.safeParse({ ...styles, theme: "dark" }).success).toBe(false);
    expect(
      pageSetupSchema.safeParse({ ...page, margins: { ...page.margins, gutter: 10 } }).success,
    ).toBe(false);
  });

  it("each component takes only the colors its design shows", () => {
    const ok = (components: Record<string, unknown>) =>
      documentStylesSchema.safeParse({ version: 1, components }).success;
    expect(ok({ script: { fill: "yellow", border: "#123456", accent: "teal" } })).toBe(true);
    expect(ok({ preacherNote: { labelColor: "gray", fill: null } })).toBe(true);
    expect(ok({ point: { notationColor: "red", titleColor: "blue" } })).toBe(true);
    expect(ok({ point: { fill: "yellow" } })).toBe(false);
    expect(ok({ script: { notationColor: "red" } })).toBe(false);
    expect(ok({ scripture: { referenceColor: "blue" } })).toBe(true);
    // A fill takes a highlight preset; text-like colors take a text preset.
    expect(ok({ script: { fill: "amber" } })).toBe(false);
    expect(ok({ script: { accent: "amber" } })).toBe(true);
  });

  it("reads fonts, format, styles, and appearance from its own HTML only when they are valid", () => {
    const parse = (html: string) => {
      const element = document.createElement("div");
      element.innerHTML = html;
      return ProseMirrorDOMParser.fromSchema(schema).parse(element).toJSON() as JSONContent;
    };
    const foreign = parse(
      '<p><span style="font-family: Arial; font-size: 14pt">pasted</span></p>' +
        '<p><span data-font-family="comic-sans" data-font-size="13.3">made up</span></p>',
    );
    // A foreign font is mapped when it can be (Arial → Arimo, B.2B); an invalid one of ours gives no mark.
    expect(foreign.content!.map((block) => block.content![0])).toEqual([
      {
        type: "text",
        text: "pasted",
        marks: [{ type: "textStyle", attrs: { color: null, fontFamily: "arimo", fontSize: 14 } }],
      },
      { type: "text", text: "made up" },
    ]);
    const own = parse(
      '<p data-style-name="subtitle" data-format=\'{"spaceAfter":6}\'>' +
        '<span data-font-family="inter" data-font-size="10.5">ours</span></p>' +
        '<div data-type="script" data-id="s1" data-appearance=\'{"fill":"var(--x)"}\'><p>said</p></div>',
    );
    expect(own.content![0].attrs).toMatchObject({
      styleName: "subtitle",
      format: { spaceAfter: 6 },
    });
    expect(own.content![0].content![0].marks).toEqual([
      { type: "textStyle", attrs: { color: null, fontFamily: "inter", fontSize: 10.5 } },
    ]);
    // A script stays a script; an appearance that is not one is dropped, never kept.
    expect(own.content![1]).toMatchObject({
      type: "script",
      attrs: { id: "s1", appearance: null },
    });
  });
});

describe("the resolver: one property at a time", () => {
  it("with no styles, Normal is the built-in defaults", () => {
    expect(resolveNamed(null, "normal")).toEqual(builtInDefaults);
    expect(readStyles(null)).toBeNull();
    expect(readStyles({ version: 9 })).toBeNull();
  });

  it("a document default reaches Normal, and a named style keeps what it sets itself", () => {
    const styles: DocumentStyles = { version: 1, defaults: { fontSize: 14, color: "#333333" } };
    expect(resolveNamed(styles, "normal")).toMatchObject({ fontSize: 14, color: "#333333" });
    // Title sets its own size; it inherits the color it does not set.
    const title = resolveNamed(styles, "title");
    expect(title.fontSize).toBe(builtInNamed.title.fontSize);
    expect(title.color).toBe("#333333");
  });

  it("the document's version of a named style changes only what it names", () => {
    const styles: DocumentStyles = { version: 1, named: { title: { color: "#1e3a8a" } } };
    const title = resolveNamed(styles, "title");
    expect(title).toMatchObject({ color: "#1e3a8a", fontSize: 26, fontFamily: "playfair-display" });
  });

  it("a paragraph's own format wins, property by property", () => {
    const styles: DocumentStyles = { version: 1, named: { normal: { spaceAfter: 10 } } };
    const resolved = resolveNamed(styles, "normal", { spaceBefore: 12 });
    expect(resolved).toMatchObject({ spaceBefore: 12, spaceAfter: 10 });
  });

  it("one note's red fill survives a later change to the note style's font size", () => {
    const appearance = { fill: "red" } as const;
    const before: DocumentStyles = { version: 1, components: { preacherNote: { fontSize: 11 } } };
    const after: DocumentStyles = { version: 1, components: { preacherNote: { fontSize: 13 } } };
    expect(resolveComponent(before, "preacherNote", appearance)).toMatchObject({
      fill: "red",
      fontSize: 11,
    });
    expect(resolveComponent(after, "preacherNote", appearance)).toMatchObject({
      fill: "red",
      fontSize: 13,
    });
    // Another note, with no override, follows the style alone.
    expect(resolveComponent(after, "preacherNote").fill).toBeUndefined();
  });

  it("null turns a style's color off; unset leaves the theme's", () => {
    const styles: DocumentStyles = { version: 1, components: { script: { fill: "yellow" } } };
    expect(resolveComponent(styles, "script").fill).toBe("yellow");
    expect(resolveComponent(styles, "script", { fill: null }).fill).toBeNull();
    expect(resolveComponent(null, "script").border).toBeUndefined();
  });

  it("names the style or component a node stands for", () => {
    expect(namedStyleOf("paragraph", { styleName: null })).toBe("normal");
    expect(namedStyleOf("paragraph", { styleName: "title" })).toBe("title");
    expect(namedStyleOf("heading", { level: 1 })).toBe("heading1");
    expect(namedStyleOf("blockquote", {})).toBeNull();
    expect(componentOf("outlinePoint", {}, false)).toBe("point");
    expect(componentOf("outlinePoint", {}, true)).toBe("subpoint");
    expect(componentOf("sermonSection", { role: "conclusion" }, false)).toBe("conclusion");
    expect(componentOf("script", {}, true)).toBe("script");
    expect(componentOf("paragraph", {}, false)).toBeNull();
  });
});

describe("a legacy reader is told what v3 adds", () => {
  it("reports the document's styles, subtitle, page, Scripts, and appearances", () => {
    const { losses } = documentToLegacy(documentFixtures.stylesAndScript);
    const codes = (code: string) => losses.filter((loss) => loss.code === code);
    expect(codes("styles")).toHaveLength(1);
    expect(codes("page")).toHaveLength(1);
    expect(codes("subtitle")).toEqual([{ code: "subtitle", text: "Romans 8:28" }]);
    expect(codes("script").map((loss) => [loss.entryId ?? null, loss.text])).toEqual([
      [null, "Friends, tonight I want you to see one thing.Not three things. One."],
      ["st-1", "Say it slowly: all things.The goodThe hard"],
      ["st-end", "Will you trust Him with all things?"],
    ]);
    // A note's or Script's own appearance goes with the note or Script, reported whole above.
    expect(codes("appearance").map((loss) => loss.entryId)).toEqual(["st-intro", "st-1", "st-1a"]);
  });

  it("reports a paragraph's named style, format, and fonts inside a point", () => {
    const doc = sermonDocument([
      point(
        "p-1",
        [text("One")],
        [
          {
            type: "paragraph",
            attrs: { textAlign: null, styleName: "subtitle", format: { spaceAfter: 3 } },
            content: [
              text("sized", {
                type: "textStyle",
                attrs: { color: null, fontFamily: null, fontSize: 18 },
              }),
            ],
          },
        ],
      ),
    ]);
    expect(restoreDocument(doc, schema).ok).toBe(true);
    const { losses } = documentToLegacy(doc);
    expect(losses).toEqual([
      { code: "text_style", entryId: "p-1", detail: "subtitle" },
      { code: "paragraph_format", entryId: "p-1" },
      { code: "font", entryId: "p-1", text: "sized" },
    ]);
  });
});
