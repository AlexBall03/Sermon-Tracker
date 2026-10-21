import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { isTextOnly } from "../changes";
import { noteKinds, type NoteKind } from "../schema/model";

/*
 * What a preacher note or a script is, said by the editor (A1-UI.1): a small
 * label drawn above it (the note's kind, or "Script") and the same words for
 * assistive technology (`role` with `aria-roledescription`, which names the
 * kind of container without replacing what it holds, as an `aria-label`
 * would). Both are decorations, never the document's: the words are not
 * stored, selected, or copied, and they follow the interface's language.
 * The look of the label is the preset's CSS (`lab-v4.css`).
 */

export type ComponentLabels = { script: string; notes: Record<NoteKind, string> };

const labelsKey = new PluginKey<DecorationSet>("labV4ComponentLabels");

function build(doc: ProseMirrorNode, labels: ComponentLabels): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((node, pos) => {
    let label: string | null = null;
    let role: string | null = null;
    if (node.type.name === "preacherNote") {
      const kind = node.attrs.kind as NoteKind;
      label = labels.notes[(noteKinds as readonly string[]).includes(kind) ? kind : "note"];
      role = "note";
    } else if (node.type.name === "script") {
      label = labels.script;
      role = "group";
    }
    if (!label || !role) return;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        "data-component-label": label,
        role,
        "aria-roledescription": label,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export const ComponentLabelsV4 = Extension.create<{ labels: ComponentLabels | null }>({
  name: "v4ComponentLabels",
  addOptions() {
    return { labels: null };
  },
  addProseMirrorPlugins() {
    const labels = this.options.labels;
    if (!labels) return [];
    return [
      new Plugin<DecorationSet>({
        key: labelsKey,
        state: {
          init: (_, state) => build(state.doc, labels),
          apply(tr, previous, _old, state) {
            if (!tr.docChanged) return previous;
            if (isTextOnly([tr])) return previous.map(tr.mapping, tr.doc);
            return build(state.doc, labels);
          },
        },
        props: { decorations: (state) => labelsKey.getState(state) },
      }),
    ];
  },
});
