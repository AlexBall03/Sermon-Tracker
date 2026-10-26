import { mergeAttributes } from "@tiptap/core";

import { formatReference, referenceSpans } from "@/features/scripture/reference";
import {
  fallbackTranslation,
  isTranslationId,
  type TranslationId,
} from "@/features/scripture/translations";
import { loadChapter } from "@/features/scripture/use-chapter";
import { referenceFrom, ScripturePassageNode } from "./scripture";

/**
 * The passage as an editor draws it: the schema-only node (`scripture.ts`)
 * with its node view. Same name and spec, so a document is the same either
 * way. This one reads verses in the browser and is never loaded on a server
 * (A2.0).
 */
export const ScripturePassageNodeView = ScripturePassageNode.extend({
  /*
   * In the editor a passage is its reference and, when it may be shown, its
   * verses (PS-1B.2B.1: the smallest view that lets Print Layout give a
   * passage its printed height; the chevron and the rest are G.3's). CSS
   * decides what shows: in Regular Layout the verses only when expanded; in
   * Print Layout by `print` (full: the verses; reference: the label; hidden:
   * a marker that takes no space). The verses are read with `loadChapter`,
   * are never part of the document, and are never copied: copying a passage
   * still gives `renderHTML` and `renderText` (`scripture.ts`).
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
