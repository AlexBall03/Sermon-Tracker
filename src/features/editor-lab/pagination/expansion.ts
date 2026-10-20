import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { isTextOnly } from "../changes";

/*
 * Which passages are expanded in Regular Layout: editor view state, never the
 * document (PS-1B.1 §B.8.1, §J). This is the smallest stand-in that lets
 * PS-1B.2B.1 prove P7 (a passage prints at its full height whatever its
 * expansion); the chevron, remembered expansion, and the rest of the node
 * view are G.3's. An expanded passage carries `data-expanded` as a node
 * decoration; CSS shows its text in Regular Layout, and Print Layout ignores it.
 */

type ExpansionState = { ids: ReadonlySet<string>; decorations: DecorationSet };

export const expansionKey = new PluginKey<ExpansionState>("labPassageExpansion");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    passageExpansion: {
      /** Expands (or collapses) every passage block in Regular Layout. No document change, no history. */
      setPassagesExpanded: (expanded: boolean) => ReturnType;
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

function decorate(doc: ProseMirrorNode, ids: ReadonlySet<string>) {
  if (ids.size === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "scripturePassage" && ids.has(node.attrs.id)) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-expanded": "true" }));
    }
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

export const PassageExpansion = Extension.create({
  name: "passageExpansion",

  addCommands() {
    return {
      setPassagesExpanded:
        (expanded) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(expansionKey, { expanded }).setMeta("addToHistory", false);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<ExpansionState>({
        key: expansionKey,
        state: {
          init: () => ({ ids: new Set(), decorations: DecorationSet.empty }),
          apply(tr, previous, _old, state) {
            const meta = tr.getMeta(expansionKey) as { expanded: boolean } | undefined;
            if (meta) {
              const ids = meta.expanded ? passageIds(state.doc) : new Set<string>();
              return { ids, decorations: decorate(state.doc, ids) };
            }
            if (!tr.docChanged || previous.ids.size === 0) return previous;
            if (isTextOnly([tr])) {
              return { ...previous, decorations: previous.decorations.map(tr.mapping, tr.doc) };
            }
            return { ...previous, decorations: decorate(state.doc, previous.ids) };
          },
        },
        props: { decorations: (state) => expansionKey.getState(state)?.decorations },
      }),
    ];
  },
});
