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
 * A passage in the document: one inline atom carrying the five numbers of
 * `ScriptureReference`, nothing else. Its words ("John 3:16–18") are drawn
 * from the numbers each time it is shown, in the interface's language; no
 * verse text and no translation is stored. The same node stands in prose and
 * in an entry's passages (`entryPassages`), so the two placements are one
 * type and one validation.
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

export type ScriptureNodeOptions = { locale: Locale };

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
      id: dataAttribute("id"),
      book: dataAttribute("book", "number"),
      chapterStart: dataAttribute("chapterStart", "number"),
      verseStart: dataAttribute("verseStart", "number"),
      chapterEnd: dataAttribute("chapterEnd", "number"),
      verseEnd: dataAttribute("verseEnd", "number"),
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="scripture-reference"]',
        // Anything that is not a passage of the Bible is not taken as one: its
        // words are kept as plain text instead.
        getAttrs: (element) => {
          const read = (field: string) => {
            const value = element.getAttribute(
              `data-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
            );
            return value === null || value === "" ? null : Number(value);
          };
          const reference = referenceFrom(Object.fromEntries(fields.map((f) => [f, read(f)])));
          return reference ? { ...reference, id: element.getAttribute("data-id") } : false;
        },
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
