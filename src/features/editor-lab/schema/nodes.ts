import { mergeAttributes, Node } from "@tiptap/core";

import { defaultLayout } from "../layout";
import { currentSchemaVersion, noteKinds } from "./model";

/*
 * The canonical sermon document, schema v2 (PS-1B.1 §B.2, Proposed; validated
 * in PS-1B.2A). One document holds outline, manuscript, or both:
 *
 *   doc               (block | scripturePassage | preacherNote | outlinePoint
 *                      | sermonSection | pageBreak)+
 *   sermonSection     sectionTitle (block | scripturePassage | preacherNote)*
 *   outlinePoint      pointTitle (block | scripturePassage | preacherNote | outlinePoint)*
 *   pointTitle, sectionTitle   (text | scriptureReference)*, with marks
 *   preacherNote      (paragraph | bulletList | orderedList)+
 *
 * `block` is StarterKit's ordinary manuscript (paragraphs, headings, lists,
 * quotations), and lists and quotations hold only those: a point, a section,
 * a passage block, a note, or a page break never sits inside one. The
 * introduction and conclusion are optional, at most one of each, anywhere at
 * the top level; "at most one" is not a content expression, so it is kept by
 * the validator and by the section guard (`outline-commands.ts`). A point's
 * number is never in the document: the numbering plugin draws it.
 */

/** The node types that carry a document-node identity (`id`). */
export const identifiedTypes = [
  "sermonSection",
  "outlinePoint",
  "scripturePassage",
  "scriptureReference",
  "preacherNote",
] as const;

/** The node types that stand for a legacy outline entry. */
export const entryNodeTypes = ["sermonSection", "outlinePoint"] as const;

/** Content a point's or a section's body may hold besides subpoints. */
export const proseContent = "block | scripturePassage | preacherNote";

/** An attribute kept in the HTML as `data-<name>`, so copy and paste carry it. */
export function dataAttribute(name: string, kind: "string" | "number" | "json" = "string") {
  const attribute = `data-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  return {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const value = element.getAttribute(attribute);
      if (value === null || value === "") return null;
      if (kind === "string") return value;
      if (kind === "json") {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    },
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[name] === null || attributes[name] === undefined
        ? {}
        : {
            [attribute]:
              kind === "json" ? JSON.stringify(attributes[name]) : String(attributes[name]),
          },
  };
}

/** Provenance kept on a node that stands for an outline entry (§B.6). */
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
  content: `(${proseContent} | outlinePoint | sermonSection | pageBreak)+`,
  addAttributes() {
    return {
      schemaVersion: { default: currentSchemaVersion },
      layout: { default: defaultLayout() },
      /** The sermon's own Bible translation, or null to follow the account's (§B.8.4). */
      translation: { default: null },
      legacyOutlineId: { default: null },
      legacyRevision: { default: null },
    };
  },
});

export const SermonSection = Node.create({
  name: "sermonSection",
  content: `sectionTitle (${proseContent})*`,
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      ...entryAttributes(),
      /** "introduction" or "conclusion". No default: a section that does not say is refused. */
      role: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-role"),
        renderHTML: (attributes: Record<string, unknown>) => ({ "data-role": attributes.role }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'section[data-type="sermon-section"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-type": "sermon-section", class: "lab-section" }),
      0,
    ];
  },
});

export const OutlinePoint = Node.create({
  name: "outlinePoint",
  content: `pointTitle (${proseContent} | outlinePoint)*`,
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      ...entryAttributes(),
      /** The saved point idea this point was made from (`source_point_id` today). A hint (§E.3). */
      sourcePointId: dataAttribute("sourcePointId"),
      /**
       * The parent the legacy row named, kept only when conversion could not
       * honour it (an orphan, a point under a section, a loop), so it is not lost.
       */
      legacyParentId: dataAttribute("legacyParentId"),
      /** This point's own numbering override (§D.3), or null. */
      presentation: dataAttribute("presentation", "json"),
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

/** Marks a title may carry: no link, no code, no strike (§B.4). */
const titleMarks = "bold italic underline textStyle highlight";

function title(name: "pointTitle" | "sectionTitle", type: string) {
  return Node.create({
    name,
    content: "(text | scriptureReference)*",
    marks: titleMarks,
    defining: true,
    parseHTML() {
      return [{ tag: `p[data-type="${type}"]`, priority: 60 }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["p", mergeAttributes(HTMLAttributes, { "data-type": type, class: "lab-title" }), 0];
    },
  });
}

export const PointTitle = title("pointTitle", "point-title");
export const SectionTitle = title("sectionTitle", "section-title");

export const PreacherNote = Node.create({
  name: "preacherNote",
  content: "(paragraph | bulletList | orderedList)+",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      id: dataAttribute("id"),
      kind: {
        default: noteKinds[5],
        parseHTML: (element: HTMLElement) => element.getAttribute("data-kind"),
        renderHTML: (attributes: Record<string, unknown>) => ({ "data-kind": attributes.kind }),
      },
      /** "show", "hide", or null for the kind's default (§B.10). */
      print: dataAttribute("print"),
    };
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="preacher-note"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { "data-type": "preacher-note", class: "lab-note" }),
      0,
    ];
  },
});

export const PageBreak = Node.create({
  name: "pageBreak",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "page-break", class: "lab-page-break" }),
    ];
  },
});
