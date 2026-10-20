import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { touchedBlocks } from "../pagination/plugin";
import { inkOn, type ColorValue } from "./colors";
import { documentStylesSchema, type DocumentStyles } from "./model";
import { styleSheet } from "./render";
import { resolveAt } from "./context";
import { readStyles } from "./resolve";

/*
 * The document's styles in the editor (PS-1B.2B.2B):
 *
 * - the style sheet (`render.ts`) for the styles in force, kept in one
 *   `<style>` element per editor and replaced only when they change;
 * - a preview: styles shown in place of the document's while the Document
 *   Styles panel is open. It is view state, set by a transaction that carries
 *   only a meta and stays out of history, so it never changes the document,
 *   and Cancel leaves nothing behind;
 * - `applyDocumentStyles`: the one transaction that writes `doc.attrs.styles`
 *   (undone in one step), which also ends the preview;
 * - text on a highlight, judged together (`colors.ts`, `inkOn`): an inline
 *   decoration on each highlighted run gives its text the color that reads on
 *   that fill, in each theme. An exact or per-theme text color is drawn as
 *   chosen. Only the blocks a change touched are looked at again.
 */

/** The styles previewed (null inside: every default), or null for no preview. */
export type Preview = { styles: DocumentStyles | null } | null;
type StylesState = { preview: Preview };

export const documentStylesKey = new PluginKey<StylesState>("labDocumentStyles");
const pairsKey = new PluginKey<DecorationSet>("labColorPairs");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    documentStyles: {
      /** Shows the previewed styles in place of the document's; null ends the preview. View state only. */
      setStylesPreview: (preview: Preview) => ReturnType;
      /** Writes the document's styles (null: every default) in one undoable transaction. */
      applyDocumentStyles: (styles: DocumentStyles | null) => ReturnType;
    };
  }
}

/** The styles the editor shows: the preview while there is one, else the document's. */
export function stylesInForce(state: EditorState): DocumentStyles | null {
  const preview = documentStylesKey.getState(state)?.preview;
  return preview ? preview.styles : readStyles(state.doc.attrs.styles);
}

let sheets = 0;

export const DocumentStylesExtension = Extension.create({
  name: "documentStyles",

  addCommands() {
    return {
      setStylesPreview:
        (preview) =>
        ({ tr, dispatch }) => {
          if (preview?.styles && !documentStylesSchema.safeParse(preview.styles).success) {
            return false;
          }
          if (dispatch) tr.setMeta(documentStylesKey, preview).setMeta("addToHistory", false);
          return true;
        },
      applyDocumentStyles:
        (styles) =>
        ({ tr, dispatch }) => {
          if (styles !== null && !documentStylesSchema.safeParse(styles).success) return false;
          if (dispatch) tr.setDocAttribute("styles", styles).setMeta(documentStylesKey, null);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const id = String((sheets += 1));
    const scope = `.lab-editor[data-sheet="${id}"]`;
    return [
      new Plugin<StylesState>({
        key: documentStylesKey,
        state: {
          init: () => ({ preview: null }),
          apply(tr, previous) {
            const meta = tr.getMeta(documentStylesKey) as Preview | undefined;
            return meta === undefined ? previous : { preview: meta };
          },
        },
        props: { attributes: { "data-sheet": id } },
        view(view) {
          const element = view.dom.ownerDocument.createElement("style");
          element.dataset.labSheet = id;
          view.dom.ownerDocument.head.append(element);
          let shown: DocumentStyles | null | undefined;
          const draw = (state: EditorState) => {
            const styles = stylesInForce(state);
            if (styles === shown) return;
            shown = styles;
            element.textContent = styleSheet(styles, scope);
          };
          draw(view.state);
          return { update: (next) => draw(next.state), destroy: () => element.remove() };
        },
      }),
      new Plugin<DecorationSet>({
        key: pairsKey,
        state: {
          init: (_, state) => pairs(state, 0, state.doc.content.size, DecorationSet.empty),
          apply(tr, previous, before, after) {
            // New styles can change a block's text color: look at the whole document again.
            if (stylesInForce(before) !== stylesInForce(after)) {
              return pairs(after, 0, after.doc.content.size, DecorationSet.empty);
            }
            if (!tr.docChanged) return previous;
            const set = previous.map(tr.mapping, tr.doc);
            const touched = touchedBlocks(tr);
            if (!touched) return set;
            return pairs(
              after,
              touched.start,
              touched.end,
              set.remove(set.find(touched.start, touched.end)),
            );
          },
        },
        props: { decorations: (state) => pairsKey.getState(state) },
      }),
    ];
  },
});

/** Decorations for every highlighted run between `from` and `to`, added to `set`. */
function pairs(state: EditorState, from: number, to: number, set: DecorationSet): DecorationSet {
  const styles = stylesInForce(state);
  const added: Decoration[] = [];
  state.doc.nodesBetween(from, to, (node: ProseMirrorNode, pos: number) => {
    if (!node.isText) return true;
    const highlight = node.marks.find((mark) => mark.type.name === "highlight");
    if (!highlight) return false;
    const fill = highlight.attrs.color as ColorValue;
    const marked = node.marks.find((mark) => mark.type.name === "textStyle")?.attrs.color as
      ColorValue | null | undefined;
    // A color the person fixed is theirs: drawn as chosen by its own mark, never adapted.
    if (marked && typeof marked !== "string") return false;
    const ink = marked ?? resolveAt(styles, state.doc.resolve(pos)).color;
    if (ink && typeof ink !== "string") return false;
    const light = inkOn(ink, fill, "light");
    const dark = inkOn(ink, fill, "dark");
    if (!light || !dark) return false;
    added.push(
      Decoration.inline(pos, pos + node.nodeSize, {
        class: "lab-ink",
        style: `color: ${light}; --ink-d: ${dark}`,
      }),
    );
    return false;
  });
  return added.length ? set.add(state.doc, added) : set;
}
