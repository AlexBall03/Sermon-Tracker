import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import type { EntryType } from "@/features/outlines/model";
import { numberOutline, readNumbering, type NumberingConfig } from "@/features/outlines/numbering";
import { orderEntries, type TreeRow } from "@/features/outlines/tree";

/*
 * Point numbers in the document, from the outline's own engine. The nested
 * points are read back as the rows `tree.ts` knows (a parent and a place
 * among siblings), put in order with `orderEntries`, and labelled with
 * `numberOutline` under the document's numbering configuration. The label is
 * drawn as a decoration attribute on the point's title and shown by CSS, as
 * text only. It is never part of the document, its JSON, or what is copied.
 */

const sectionTypes: Record<string, EntryType> = {
  sermonIntroduction: "introduction",
  sermonConclusion: "conclusion",
};

/** A point or section of the document, as a tree row, with where its node starts. */
export type DocumentRow = TreeRow & { pos: number };

/** The key of a node: its ID, or where it is while it has none yet. */
const keyOf = (node: ProseMirrorNode, pos: number) =>
  typeof node.attrs.id === "string" && node.attrs.id ? node.attrs.id : `@${pos}`;

/**
 * The outline's rows as the document holds them: each point's parent is the
 * point it sits in (null at the top), and its position is its place among
 * the points there. Prose between points is not counted.
 */
export function documentRows(doc: ProseMirrorNode): DocumentRow[] {
  const rows: DocumentRow[] = [];
  const counts = new Map<string | null, number>();
  // The key each point was given, so its children name it the same way.
  const keys = new Map<ProseMirrorNode, string>();
  doc.descendants((node, pos, parent) => {
    const name = node.type.name;
    if (name === "outlinePoint") {
      const parentId = parent ? (keys.get(parent) ?? null) : null;
      const position = counts.get(parentId) ?? 0;
      counts.set(parentId, position + 1);
      const id = keyOf(node, pos);
      keys.set(node, id);
      rows.push({ id, parentId, type: "point", position, pos });
      return true;
    }
    if (name in sectionTypes) {
      rows.push({
        id: keyOf(node, pos),
        parentId: null,
        type: sectionTypes[name],
        position: 0,
        pos,
      });
    }
    // Points are found only at the top and inside points.
    return false;
  });
  return rows;
}

/** The label of every point by its key, and the order the engine gives them. */
export function documentLabels(doc: ProseMirrorNode, numbering?: NumberingConfig) {
  const rows = documentRows(doc);
  const config = numbering ?? readNumbering(doc.attrs.numbering);
  const placed = orderEntries(rows);
  return { rows, placed, labels: numberOutline(placed, config) };
}

type NumberingState = { labels: Map<string, string>; decorations: DecorationSet };

export const numberingKey = new PluginKey<NumberingState>("labNumbering");

function build(doc: ProseMirrorNode): NumberingState {
  const { rows, labels } = documentLabels(doc);
  const decorations: Decoration[] = [];
  for (const row of rows) {
    if (row.type !== "point") continue;
    const label = labels.get(row.id) ?? "";
    const point = doc.nodeAt(row.pos);
    const title = point?.firstChild;
    if (!title || title.type.name !== "entryTitle") continue;
    // The title starts just inside the point.
    decorations.push(
      Decoration.node(
        row.pos + 1,
        row.pos + 1 + title.nodeSize,
        label ? { "data-label": label, class: "lab-numbered" } : {},
      ),
    );
  }
  return { labels, decorations: DecorationSet.create(doc, decorations) };
}

/** Counts how often the labels were worked out again, for the lab's measurements. */
export const numberingStats = { builds: 0, lastMs: 0 };

export const OutlineNumbering = Extension.create({
  name: "outlineNumbering",
  addProseMirrorPlugins() {
    return [
      new Plugin<NumberingState>({
        key: numberingKey,
        state: {
          init: (_, state) => build(state.doc),
          apply(tr, previous, _old, state) {
            if (!tr.docChanged) return previous;
            const started = performance.now();
            const next = build(state.doc);
            numberingStats.builds += 1;
            numberingStats.lastMs = performance.now() - started;
            return next;
          },
        },
        props: {
          decorations: (state) => numberingKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
