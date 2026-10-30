import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { isTextOnly } from "../changes";
import { isPrinting, viewOnly } from "./printing";

/*
 * Which passages are expanded in Regular Layout: editor view state, never the
 * document (PS-1B.1 §B.8.1, §J). This is the smallest stand-in that lets
 * PS-1B.2B.1 prove P7 (a passage prints at its full height whatever its
 * expansion); the chevron, remembered expansion, and the rest of the node
 * view are G.3's. An expanded passage carries `data-expanded` as a node
 * decoration; CSS shows its text in Regular Layout, and Print Layout ignores it.
 *
 * A3.1 adds the other layout's own control: Scripture collapsed in Print
 * Layout, on screen only. A passage there shows by its `print` setting, as
 * before; one collapsed (`data-collapsed`) shows its reference alone on the
 * screen. Printing never sees it (`printing.ts`: the decoration is not drawn
 * while printing, and the CSS is screen-only), so `print` alone decides
 * what is printed. The two layouts' states are independent, and neither is
 * a document change.
 */

type ExpansionState = {
  /** Expanded in Regular Layout. */
  ids: ReadonlySet<string>;
  /** Collapsed on screen in Print Layout (A3.1). */
  collapsed: ReadonlySet<string>;
  decorations: DecorationSet;
};

type ExpansionMeta = { expanded: boolean } | { collapsedInPrint: boolean };

export const expansionKey = new PluginKey<ExpansionState>("labPassageExpansion");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    passageExpansion: {
      /** Expands (or collapses) every passage block in Regular Layout. No document change, no history. */
      setPassagesExpanded: (expanded: boolean) => ReturnType;
      /**
       * Collapses (or shows again) every passage on screen in Print Layout,
       * whatever its `print` setting would show; printing is unchanged. No
       * document change, no history (A3.1).
       */
      setPassagesCollapsedInPrint: (collapsed: boolean) => ReturnType;
    };
  }
}

const passageIds = (doc: ProseMirrorNode) => {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === "scripturePassage" && typeof node.attrs.id === "string") {
      ids.add(node.attrs.id);
    }
    return true;
  });
  return ids;
};

function decorate(doc: ProseMirrorNode, ids: ReadonlySet<string>, collapsed: ReadonlySet<string>) {
  if (ids.size === 0 && collapsed.size === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "scripturePassage") return true;
    const attrs: Record<string, string> = {};
    if (ids.has(node.attrs.id)) attrs["data-expanded"] = "true";
    if (collapsed.has(node.attrs.id)) attrs["data-collapsed"] = "true";
    if (Object.keys(attrs).length > 0) {
      // The node view reads its verses only for an expansion (`scripture-view.ts`).
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, attrs, { expanded: ids.has(node.attrs.id) }),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

/** What a view's controls need: whether any passage is there, expanded, or collapsed in Print Layout. */
export function expansionOf(state: Parameters<typeof isPrinting>[0]) {
  const current = expansionKey.getState(state);
  const all = passageIds(state.doc);
  let expanded = 0;
  let collapsed = 0;
  for (const id of all) {
    if (current?.ids.has(id)) expanded += 1;
    if (current?.collapsed.has(id)) collapsed += 1;
  }
  return { passages: all.size, expanded, collapsed };
}

export const PassageExpansion = Extension.create({
  name: "passageExpansion",

  addCommands() {
    return {
      setPassagesExpanded:
        (expanded) =>
        ({ tr, dispatch }) => {
          if (dispatch) viewOnly(tr.setMeta(expansionKey, { expanded }));
          return true;
        },
      setPassagesCollapsedInPrint:
        (collapsed) =>
        ({ tr, dispatch }) => {
          if (dispatch) viewOnly(tr.setMeta(expansionKey, { collapsedInPrint: collapsed }));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<ExpansionState>({
        key: expansionKey,
        state: {
          init: () => ({ ids: new Set(), collapsed: new Set(), decorations: DecorationSet.empty }),
          apply(tr, previous, _old, state) {
            const meta = tr.getMeta(expansionKey) as ExpansionMeta | undefined;
            if (meta) {
              let { ids, collapsed } = previous;
              if ("expanded" in meta) ids = meta.expanded ? passageIds(state.doc) : new Set();
              else collapsed = meta.collapsedInPrint ? passageIds(state.doc) : new Set();
              return { ids, collapsed, decorations: decorate(state.doc, ids, collapsed) };
            }
            if (!tr.docChanged || (previous.ids.size === 0 && previous.collapsed.size === 0)) {
              return previous;
            }
            if (isTextOnly([tr])) {
              return { ...previous, decorations: previous.decorations.map(tr.mapping, tr.doc) };
            }
            return {
              ...previous,
              decorations: decorate(state.doc, previous.ids, previous.collapsed),
            };
          },
        },
        props: {
          // While printing, nothing collapsed on screen stays collapsed: `print` alone decides.
          decorations: (state) => {
            const current = expansionKey.getState(state);
            if (!current) return null;
            if (!isPrinting(state) || current.collapsed.size === 0) return current.decorations;
            return decorate(state.doc, current.ids, new Set());
          },
        },
      }),
    ];
  },
});
