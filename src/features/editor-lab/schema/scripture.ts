import { mergeAttributes, Node } from "@tiptap/core";

import { defaultLocale, type Locale } from "@/i18n/locales";
import {
  formatReference,
  normaliseReference,
  scriptureReferenceSchema,
  type ScriptureReference,
} from "@/features/scripture/reference";
import { dataAttribute } from "./nodes";

/*
 * Scripture in the document (PS-1B.1 §B.8, Proposed). Both nodes carry the
 * five numbers of `ScriptureReference` and never verse text; the words
 * ("John 3:16–18") are drawn from the numbers each time they are shown, in
 * the interface's language.
 *
 * - `scriptureReference`: inline, in prose and in titles. `display` says
 *   whether it reads as its label or (later) as the quoted verse.
 * - `scripturePassage`: a block of its own, with a persistent `print`. Its
 *   expansion is editor view state and is never stored (§B.8.1); the chevron
 *   and the verse text arrive with its node view in PS-1B.2B.
 *
 * `translation` is null (follow the document, then the account) or a
 * translation ID; it names a translation, never its text (§B.8.4).
 *
 * This file is the nodes' schema alone and loads on a server (A2.0). The
 * passage's node view, which reads verses in the browser, is
 * `ScripturePassageNodeView` (`scripture-view.ts`), used only by editors.
 */

const fields = ["book", "chapterStart", "verseStart", "chapterEnd", "verseEnd"] as const;

/** The five numbers of a node's attributes, when they make a passage that exists; otherwise null. */
export function referenceFrom(attributes: Record<string, unknown>): ScriptureReference | null {
  const candidate = Object.fromEntries(fields.map((field) => [field, attributes[field] ?? null]));
  const parsed = scriptureReferenceSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const tidy = normaliseReference(parsed.data);
  // A reference is stored in its one normal form, so equal passages compare equal.
  return fields.every((field) => tidy[field] === parsed.data[field]) ? tidy : null;
}

/** The five numbers alone, from a node's attributes. */
export const numbersOf = (attributes: Record<string, unknown>) =>
  Object.fromEntries(fields.map((field) => [field, attributes[field] ?? null]));

const referenceAttributes = () => ({
  id: dataAttribute("id"),
  book: dataAttribute("book", "number"),
  chapterStart: dataAttribute("chapterStart", "number"),
  verseStart: dataAttribute("verseStart", "number"),
  chapterEnd: dataAttribute("chapterEnd", "number"),
  verseEnd: dataAttribute("verseEnd", "number"),
  translation: dataAttribute("translation"),
});

/** Reads a passage from pasted HTML; anything that is not a passage of the Bible is refused. */
function passageFromElement(element: HTMLElement, extra: (element: HTMLElement) => object) {
  const read = (field: string) => {
    const value = element.getAttribute(
      `data-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
    );
    return value === null || value === "" ? null : Number(value);
  };
  const reference = referenceFrom(Object.fromEntries(fields.map((f) => [f, read(f)])));
  return reference
    ? {
        ...reference,
        id: element.getAttribute("data-id"),
        translation: element.getAttribute("data-translation") || null,
        ...extra(element),
      }
    : false;
}

/**
 * A way from a passage to the Bible reader (A3.1), given by the page that
 * mounts an editor (the production host names its outline); none in the
 * schema, a preview, or the lab. Only a view's option: nothing of it is stored.
 */
export type PassageLink = {
  /** The reader's address for a reference (`readerHref`, `reader-location.ts`). */
  href: (reference: ScriptureReference) => string;
  /** The link's accessible name, given the formatted reference. */
  label: (reference: string) => string;
  title: string;
  /** Goes to the address in this tab, once nothing has stopped the click (the leave guard first). */
  navigate: (href: string) => void;
};

export type ScriptureNodeOptions = { locale: Locale; openInBible?: PassageLink | null };

export const ScriptureReferenceNode = Node.create<ScriptureNodeOptions>({
  name: "scriptureReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { locale: defaultLocale };
  },

  addAttributes() {
    return {
      ...referenceAttributes(),
      display: {
        default: "reference",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-display") || "reference",
        renderHTML: (attributes: Record<string, unknown>) => ({
          "data-display": attributes.display,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="scripture-reference"]',
        // Anything that is not a passage of the Bible is not taken as one: its
        // words are kept as plain text instead.
        getAttrs: (element) =>
          passageFromElement(element, (el) => ({
            display: el.getAttribute("data-display") || "reference",
          })),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const reference = referenceFrom(node.attrs);
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "scripture-reference",
        class: "lab-scripture",
      }),
      reference ? formatReference(reference, this.options.locale) : "?",
    ];
  },

  renderText({ node }) {
    const reference = referenceFrom(node.attrs);
    return reference ? formatReference(reference, this.options.locale) : "";
  },
});

export const ScripturePassageNode = Node.create<ScriptureNodeOptions>({
  name: "scripturePassage",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { locale: defaultLocale };
  },

  addAttributes() {
    return {
      ...referenceAttributes(),
      print: {
        default: "full",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-print") || "full",
        renderHTML: (attributes: Record<string, unknown>) => ({ "data-print": attributes.print }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="scripture-passage"]',
        getAttrs: (element) =>
          passageFromElement(element, (el) => ({ print: el.getAttribute("data-print") || "full" })),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const reference = referenceFrom(node.attrs);
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "scripture-passage",
        class: "lab-passage",
      }),
      reference ? formatReference(reference, this.options.locale) : "?",
    ];
  },

  renderText({ node }) {
    const reference = referenceFrom(node.attrs);
    return reference ? formatReference(reference, this.options.locale) : "";
  },
});
