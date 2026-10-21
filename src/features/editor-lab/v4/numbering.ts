import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { entryLabel, type NumberingConfig } from "@/features/outlines/numbering";
import { isTextOnly } from "../changes";
import { layoutNumbering } from "../layout";
import { analyze, type Structure } from "./ownership";

/*
 * Point labels in a v4 document (prototype), from the outline's own engine:
 * each point's path (its place among its parent's points, at every level)
 * is read from the flat structure (`ownership.ts`) and labelled with
 * `entryLabel` under the document's numbering, exactly as v3 does with its
 * nested rows. Labels are decorations, never document text.
 *
 * A point with a role (introduction, conclusion) has no label and is not
 * counted among the main points. How the points under it are numbered is a
 * policy (`RoleNumbering`), not a rule of the schema: by default they are
 * counted from 1 in the second level's style, apart from the main points;
 * "none" leaves them unnumbered. A future custom option is another policy.
 *
 * An irregular block (`ownership.ts`) is marked with `data-irregular`, so it
 * can be seen and fixed; it is numbered by where it actually stands.
 */

export type RoleNumbering = "subpoints" | "none";

/** Each point's path among its siblings, by block index. */
export function pointPaths(structure: Structure, roles: RoleNumbering = "subpoints") {
  const paths = new Map<number, number[] | null>();
  const counts = new Map<number | null, number>();
  structure.blocks.forEach((block, index) => {
    if (!block.isPoint) return;
    if (block.node.attrs.role) {
      paths.set(index, null);
      return;
    }
    const parent = structure.owner[index];
    const count = (counts.get(parent) ?? 0) + 1;
    counts.set(parent, count);
    if (parent === null) {
      paths.set(index, [count]);
      return;
    }
    if (structure.blocks[parent].node.attrs.role) {
      // Under a point with a role: its own count, or none.
      paths.set(index, roles === "none" ? null : [0, count]);
      return;
    }
    const above = paths.get(parent);
    paths.set(index, above ? [...above, count] : null);
  });
  return paths;
}

/**
 * Under a role, a path starts at 0: `entryLabel` leaves a counter of 0 out,
 * so `[0, 2]` reads as the second level's "B." with no main point before it.
 * Deeper under such a point the same holds level by level.
 */
export function labelsByIndex(
  structure: Structure,
  numbering: NumberingConfig,
  roles: RoleNumbering = "subpoints",
): Map<number, string> {
  const labels = new Map<number, string>();
  for (const [index, path] of pointPaths(structure, roles)) {
    labels.set(index, path ? entryLabel(numbering, path) : "");
  }
  return labels;
}

/** The label of every point by its ID, as v3's `documentLabels` gives them. */
export function documentLabelsV4(
  doc: ProseMirrorNode,
  numbering?: NumberingConfig,
  roles: RoleNumbering = "subpoints",
): Map<string, string> {
  const structure = analyze(doc);
  const config = numbering ?? layoutNumbering(doc.attrs.layout);
  const byId = new Map<string, string>();
  for (const [index, label] of labelsByIndex(structure, config, roles)) {
    const id = structure.blocks[index].node.attrs.id;
    if (typeof id === "string") byId.set(id, label);
  }
  return byId;
}

/*
 * How wide a label is, in em of its heading, estimated from its characters
 * and on the generous side (A1-UI.2A). A preset that hangs its numbers
 * (`lab-v4.css`) widens a heading's number column to it, so a long or custom
 * label (`VIII.`, `2.1.1.`, `POINT I:`) keeps every line of the heading
 * aligned after it. Never measured: nothing waits on fonts or layout. Too wide
 * leaves a little more space before the words; too narrow, the first line's
 * words start a little after the others, and they never overlap the number.
 */
const narrow = /[\s.,:;'’()[\]|!Iijl1]/;
const wide = /[MWmw]/;
const capital = /\p{Lu}/u;

export function labelEm(label: string): number {
  let em = 0;
  for (const character of label) {
    em += narrow.test(character)
      ? 0.32
      : wide.test(character)
        ? 0.9
        : capital.test(character)
          ? 0.64
          : 0.62;
  }
  return Math.round(em * 100) / 100;
}

type NumberingState = { decorations: DecorationSet };

export const numberingV4Key = new PluginKey<NumberingState>("labV4Numbering");

function build(doc: ProseMirrorNode, roles: RoleNumbering): NumberingState {
  const structure = analyze(doc);
  const labels = labelsByIndex(structure, layoutNumbering(doc.attrs.layout), roles);
  const decorations: Decoration[] = [];
  structure.blocks.forEach((block, index) => {
    const attrs: Record<string, string> = {};
    const label = labels.get(index);
    if (label) {
      attrs["data-label"] = label;
      attrs.class = "lab-numbered";
      attrs.style = `--x-label: ${labelEm(label)}em`;
    }
    const irregular = structure.irregular[index];
    if (irregular) attrs["data-irregular"] = irregular;
    if (Object.keys(attrs).length > 0) {
      decorations.push(Decoration.node(block.pos, block.pos + block.node.nodeSize, attrs));
    }
  });
  return { decorations: DecorationSet.create(doc, decorations) };
}

export const NumberingV4 = Extension.create<{ roles: RoleNumbering }>({
  name: "v4Numbering",
  addOptions() {
    return { roles: "subpoints" };
  },
  addProseMirrorPlugins() {
    const roles = this.options.roles;
    return [
      new Plugin<NumberingState>({
        key: numberingV4Key,
        state: {
          init: (_, state) => build(state.doc, roles),
          apply(tr, previous, _old, state) {
            if (!tr.docChanged) return previous;
            if (isTextOnly([tr])) {
              return { decorations: previous.decorations.map(tr.mapping, tr.doc) };
            }
            return build(state.doc, roles);
          },
        },
        props: { decorations: (state) => numberingV4Key.getState(state)?.decorations },
      }),
    ];
  },
});
