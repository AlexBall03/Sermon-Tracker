import { mergeAttributes, Node } from "@tiptap/core";

import { defaultNumbering } from "@/features/outlines/numbering";

/*
 * The candidate sermon document (PS-1A, Proposed; migration document §3.3).
 *
 *   doc               sermonIntroduction? (outlinePoint | block)* sermonConclusion?
 *   sermonIntroduction / sermonConclusion
 *                     entryTitle entryPassages? block*        (never holds a point)
 *   outlinePoint      entryTitle entryPassages? (block | outlinePoint)*
 *   entryTitle        text*   (plain, no marks: a legacy title is plain text)
 *   entryPassages     scriptureReference*
 *
 * `block` is ordinary manuscript: paragraphs, headings, lists, quotations.
 * Points are real nested nodes, never styled paragraphs or list items, and a
 * point's number is never in the document: it is drawn from the structure by
 * the numbering plugin with the outline's own engine.
 *
 * Everything here is a prototype for PS-1B to judge, not a decided schema.
 */

/** The node types that carry a document-node identity. */
export const identifiedTypes = [
  "sermonIntroduction",
  "sermonConclusion",
  "outlinePoint",
  "scriptureReference",
] as const;

/** The node types that stand for a legacy outline entry. */
export const entryNodeTypes = ["sermonIntroduction", "outlinePoint", "sermonConclusion"] as const;

/** An attribute kept in the HTML as `data-<name>`, so copy and paste carry it. */
export function dataAttribute(name: string, kind: "string" | "number" = "string") {
  const attribute = `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  return {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute(attribute);
      if (value === null || value === "") return null;
      if (kind === "string") return value;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    },
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[name] === null || attributes[name] === undefined
        ? {}
        : { [attribute]: String(attributes[name]) },
  };
}

/** Provenance kept on a node that stands for an outline entry. */
const entryAttributes = () => ({
  id: dataAttribute("id"),
  /** The legacy `outline_entries.id` this node was converted from. */
  legacyEntryId: dataAttribute("legacyEntryId"),
  /** That entry's own revision when it was converted. */
  legacyRevision: dataAttribute("legacyRevision", "number"),
  /** The node this one was copied or split from, when it is a copy. */
  derivedFrom: dataAttribute("derivedFrom"),
});

export const LabDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "sermonIntroduction? (outlinePoint | block)* sermonConclusion?",
  addAttributes() {
    return {
      schemaVersion: { default: 1 },
      numbering: { default: defaultNumbering },
      legacyOutlineId: { default: null },
      legacyRevision: { default: null },
    };
  },
});

function section(name: "sermonIntroduction" | "sermonConclusion", type: string) {
  return Node.create({
    name,
    content: "entryTitle entryPassages? block*",
    defining: true,
    isolating: true,
    addAttributes: entryAttributes,
    parseHTML() {
      return [{ tag: `section[data-type="${type}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "section",
        mergeAttributes(HTMLAttributes, { "data-type": type, class: "lab-section" }),
        0,
      ];
    },
  });
}

export const SermonIntroduction = section("sermonIntroduction", "sermon-introduction");
export const SermonConclusion = section("sermonConclusion", "sermon-conclusion");

export const OutlinePoint = Node.create({
  name: "outlinePoint",
  content: "entryTitle entryPassages? (block | outlinePoint)*",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      ...entryAttributes(),
      /** The saved point idea this point was made from (`source_point_id` today). */
      sourcePointId: dataAttribute("sourcePointId"),
      /**
       * The parent the legacy row named, kept only when conversion could not
       * honour it (an orphan, a point under a section, a loop), so it is not lost.
       */
      legacyParentId: dataAttribute("legacyParentId"),
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="outline-point"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "outline-point", class: "lab-point" }),
      0,
    ];
  },
});

export const EntryTitle = Node.create({
  name: "entryTitle",
  content: "text*",
  marks: "",
  defining: true,
  parseHTML() {
    return [{ tag: 'p[data-type="entry-title"]', priority: 60 }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, { "data-type": "entry-title", class: "lab-title" }),
      0,
    ];
  },
});

export const EntryPassages = Node.create({
  name: "entryPassages",
  content: "scriptureReference*",
  parseHTML() {
    return [{ tag: 'div[data-type="entry-passages"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "entry-passages", class: "lab-passages" }),
      0,
    ];
  },
});
