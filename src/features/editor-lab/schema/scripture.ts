import { mergeAttributes, Node } from "@tiptap/core";

import { defaultLocale, type Locale } from "@/i18n/locales";
import {
  formatReference,
  normaliseReference,
  referenceSpans,
  scriptureReferenceSchema,
  type ScriptureReference,
} from "@/features/scripture/reference";
import {
  fallbackTranslation,
  isTranslationId,
  type TranslationId,
} from "@/features/scripture/translations";
import { loadChapter } from "@/features/scripture/use-chapter";
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

  /*
   * In the editor a passage is its reference and, when it may be shown, its
   * verses (PS-1B.2B.1: the smallest view that lets Print Layout give a
   * passage its printed height; the chevron and the rest are G.3's). CSS
   * decides what shows: in Regular Layout the verses only when expanded; in
   * Print Layout by `print` (full: the verses; reference: the label; hidden:
   * a marker that takes no space). The verses are read with `loadChapter`,
   * are never part of the document, and are never copied: copying a passage
   * still gives `renderHTML` and `renderText` above.
   */
  addNodeView() {
    const locale = this.options.locale;
    return ({ node, HTMLAttributes, editor }) => {
      const dom = document.createElement("div");
      const attributes = mergeAttributes(HTMLAttributes, {
        "data-type": "scripture-passage",
        class: "lab-passage",
      });
      for (const [name, value] of Object.entries(attributes)) {
        if (value !== null && value !== undefined) dom.setAttribute(name, String(value));
      }
      const reference = referenceFrom(node.attrs);
      const label = document.createElement("div");
      label.className = "lab-passage-label";
      label.textContent = reference ? formatReference(reference, locale) : "?";
      const verses = document.createElement("div");
      verses.className = "lab-passage-text";
      verses.dataset.state = "idle";
      dom.append(label, verses);

      const documentTranslation: unknown = editor.state.doc.attrs.translation;
      const translation: TranslationId = isTranslationId(node.attrs.translation)
        ? node.attrs.translation
        : isTranslationId(documentTranslation)
          ? documentTranslation
          : fallbackTranslation;

      const load = () => queueMicrotask(fetchVerses);
      const fetchVerses = () => {
        // Only an editor on a page reads Scripture (not one built off-screen, as in unit tests).
        if (!reference || !dom.isConnected || verses.dataset.state !== "idle") return;
        verses.dataset.state = "loading";
        const spans = referenceSpans(reference);
        Promise.all(spans.map((span) => loadChapter(translation, span.book, span.chapter)))
          .then((chapters) => {
            verses.replaceChildren(
              ...spans.map((span, index) => {
                const paragraph = document.createElement("p");
                if (spans.length > 1) paragraph.dataset.chapter = String(span.chapter);
                const text = chapters[index].verses;
                for (let verse = span.from; verse <= span.to; verse += 1) {
                  const number = document.createElement("sup");
                  number.textContent = String(verse);
                  paragraph.append(number, `${text[verse - 1] ?? ""} `);
                }
                return paragraph;
              }),
            );
            verses.dataset.state = "ready";
          })
          .catch(() => {
            verses.dataset.state = "error";
          });
      };

      // Loaded when it may be shown: printed in full, or expanded in Regular Layout.
      if (node.attrs.print === "full") load();

      return {
        dom,
        update(updated, decorations) {
          if (updated.type !== node.type) return false;
          // Another passage, or a change of `print` or translation: draw it again.
          if (JSON.stringify(updated.attrs) !== JSON.stringify(node.attrs)) return false;
          // The only decoration a passage gets is its expansion.
          if (decorations.length > 0) load();
          return true;
        },
        // The verses are drawn here, not by ProseMirror; changing them changes nothing in the document.
        ignoreMutation: () => true,
      };
    };
  },
});
