import { mergeAttributes } from "@tiptap/core";

import {
  formatReference,
  referenceSpans,
  type ScriptureReference,
} from "@/features/scripture/reference";
import {
  fallbackTranslation,
  isTranslationId,
  type TranslationId,
} from "@/features/scripture/translations";
import { loadChapter } from "@/features/scripture/use-chapter";
import { referenceFrom, ScripturePassageNode, type PassageLink } from "./scripture";

/**
 * The passage as an editor draws it: the schema-only node (`scripture.ts`)
 * with its node view. Same name and spec, so a document is the same either
 * way. This one reads verses in the browser and is never loaded on a server
 * (A2.0).
 */
const svg = "http://www.w3.org/2000/svg";

/** The external-link mark (lucide's `ExternalLink`), drawn without React. */
function linkIcon(doc: Document) {
  const icon = doc.createElementNS(svg, "svg");
  for (const [name, value] of Object.entries({
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })) {
    icon.setAttribute(name, value);
  }
  for (const d of [
    "M15 3h6v6",
    "M10 14 21 3",
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  ]) {
    const path = doc.createElementNS(svg, "path");
    path.setAttribute("d", d);
    icon.append(path);
  }
  return icon;
}

/**
 * "Open in the Bible" for one passage (A3.1): a real link to the reader, in
 * this tab. It is a link so the leave guard sees it like any other: while
 * words are not yet kept, the guard stops the click first and asks, and this
 * handler never runs. Otherwise a plain click goes through the page's own
 * navigation (`navigate`); a click with a modifier is the browser's.
 */
function openLink(link: PassageLink, reference: ScriptureReference, name: string) {
  const doc = document;
  const href = link.href(reference);
  const anchor = doc.createElement("a");
  anchor.className = "lab-passage-open";
  anchor.href = href;
  anchor.setAttribute("contenteditable", "false");
  anchor.draggable = false;
  anchor.title = link.title;
  anchor.setAttribute("aria-label", link.label(name));
  anchor.append(linkIcon(doc));
  anchor.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    link.navigate(href);
  });
  return anchor;
}

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
    const link = this.options.openInBible ?? null;
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
      const name = reference ? formatReference(reference, locale) : "?";
      label.textContent = name;
      const open = link && reference ? openLink(link, reference, name) : null;
      if (open) label.append(open);
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
          // Read when expanded; a passage is also decorated when folded away or collapsed in Print Layout (A3.1).
          if (decorations.some((decoration) => decoration.spec?.expanded === true)) load();
          return true;
        },
        // The verses are drawn here, not by ProseMirror; changing them changes nothing in the document.
        ignoreMutation: () => true,
        // The way to the Bible is the link's own: ProseMirror neither selects the passage nor moves the caret for it.
        stopEvent: (event) =>
          Boolean(open && event.target instanceof Node && open.contains(event.target)),
      };
    };
  },
});
