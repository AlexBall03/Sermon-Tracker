import { Extension, getSchema, mergeAttributes, Node, type Extensions } from "@tiptap/core";
import { TextAlign } from "@tiptap/extension-text-align";
import type { Schema } from "@tiptap/pm/model";

import { defaultLocale } from "@/i18n/locales";
import { documentStarterKit, type SchemaExtensionOptions } from "../schema/document-schema";
import { formattingExtensions, LabTextAlign } from "../schema/formatting";
import { textAlignments } from "../schema/model";
import { dataAttribute, LabDocument, PageBreak, PreacherNote, Script } from "../schema/nodes";
import { ScripturePassageNode, ScriptureReferenceNode } from "../schema/scripture";
import { StyleAttributes } from "../styles/attributes";
import { namedStyles } from "../styles/model";
import { depthTypes, maxDepth, pointRoles, v4SchemaVersion } from "./model";

/*
 * Schema v4 (prototype, `model.ts`):
 *
 *   doc     (block | point | scripturePassage | preacherNote | script | pageBreak)+
 *   point   inline*      one heading: text, marks, inline references, line breaks
 *
 * `block` is StarterKit's paragraphs, headings, lists, and quotations, whose
 * insides are unchanged. A point is not in `block`, so it stands only at the
 * top level: never inside a list, a quotation, a note, or a script.
 *
 * Every top-level block has a `depth` (a point's is 1 or more; another
 * block's 0 or more). Blocks nested inside a container keep depth 0: the
 * container's depth is theirs. Depth is meaning, not indentation: how deep
 * a block is drawn is the presentation's choice (`lab-v4.css`).
 */

/** An integer attribute kept as `data-<name>`, so copy and paste carry it. */
function integerAttribute(name: string, fallback: number) {
  const attribute = `data-${name}`;
  return {
    default: fallback,
    parseHTML: (element: HTMLElement) => {
      const value = Number(element.getAttribute(attribute));
      return Number.isInteger(value) && value >= 0 && value <= maxDepth ? value : fallback;
    },
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[name] ? { [attribute]: String(attributes[name]) } : {},
  };
}

export const DocumentV4 = LabDocument.extend({
  content: "(block | point | scripturePassage | preacherNote | script | pageBreak)+",
  addAttributes() {
    return { ...this.parent?.(), schemaVersion: { default: v4SchemaVersion } };
  },
});

export const PointNode = Node.create({
  name: "point",
  content: "inline*",
  defining: true,
  addAttributes() {
    return {
      id: dataAttribute("id"),
      depth: { ...integerAttribute("depth", 1), keepOnSplit: true },
      /** "introduction", "conclusion", or null. Only a main point plays one (the validator). */
      role: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-role");
          return (pointRoles as readonly string[]).includes(value ?? "") ? value : null;
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.role ? { "data-role": attributes.role } : {},
      },
      /** A named style the heading looks like (it stays a point), or null for its component's look. */
      styleName: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.getAttribute("data-style-name");
          return (namedStyles as readonly string[]).includes(value ?? "") ? value : null;
        },
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.styleName ? { "data-style-name": attributes.styleName } : {},
      },
      sourcePointId: dataAttribute("sourcePointId"),
      presentation: dataAttribute("presentation", "json"),
      legacyEntryId: dataAttribute("legacyEntryId"),
      legacyRevision: dataAttribute("legacyRevision", "number"),
      legacyParentId: dataAttribute("legacyParentId"),
      derivedFrom: dataAttribute("derivedFrom"),
    };
  },
  parseHTML() {
    return [{ tag: 'p[data-type="point"]', priority: 60 }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        "data-type": "point",
        // `lab-title` keeps a point out of the prose rules of the style sheet (`render.ts`).
        class: "lab-title lab-v4-point",
      }),
      0,
    ];
  },
});

/** `depth` on every block type that can stand at the top level besides a point. */
export const DepthAttribute = Extension.create({
  name: "v4Depth",
  addGlobalAttributes() {
    return [{ types: [...depthTypes], attributes: { depth: integerAttribute("depth", 0) } }];
  },
});

/**
 * A preacher note that edits like a quotation at its edges (v3's is
 * isolating): Backspace at its start lifts the line out, as anywhere else.
 */
export const PreacherNoteV4 = PreacherNote.extend({ isolating: false });

/** Alignment on paragraphs, headings, and point headings. */
export const TextAlignV4 = TextAlign.configure({
  types: ["heading", "paragraph", "point"],
  alignments: [...textAlignments],
  defaultAlignment: null,
});

/**
 * Schema v4's extensions, and nothing else (A2.0): the canonical schema. An
 * editor (`labV4Extensions`) adds its behaviour after these and passes the
 * passage with its node view, so its schema is exactly this one. Nothing here
 * touches the DOM, so it is built on a server too.
 */
export function v4SchemaExtensions({
  locale = defaultLocale,
  passage = ScripturePassageNode,
}: SchemaExtensionOptions = {}): Extensions {
  return [
    documentStarterKit(),
    ...formattingExtensions.filter((extension) => extension !== LabTextAlign),
    TextAlignV4,
    DocumentV4,
    PointNode,
    DepthAttribute,
    PreacherNoteV4,
    Script,
    StyleAttributes,
    PageBreak,
    ScriptureReferenceNode.configure({ locale }),
    passage.configure({ locale }),
  ];
}

let v4: Schema | undefined;

/** Schema v4, built once. */
export const v4Schema = (): Schema => (v4 ??= getSchema(v4SchemaExtensions()));
