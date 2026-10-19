import { Extension, type JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";

import { identifiedTypes } from "./schema/nodes";
import { isTextOnly } from "./changes";

/*
 * Document-node identity (PS-1B.1 §B.6, Proposed; validated in PS-1B.2A).
 *
 * Every section, point, passage, inline reference, and note has an `id`,
 * unique in its document. After every change that could add or copy such a
 * node, one step makes it so again:
 *
 * - a node with no ID is given one;
 * - where two nodes share an ID (a paste or a duplicate within the
 *   document), the node that was there before keeps it, found by mapping its
 *   old position through the change; the other is the copy: it gets a new ID,
 *   remembers the original in `derivedFrom`, and loses its legacy provenance
 *   (`legacyEntryId`, `legacyRevision`, `legacyParentId`), so a legacy entry
 *   stands for exactly one node. It keeps `sourcePointId`.
 *
 * A move takes the node out and puts the same node back in one change, so it
 * keeps its ID and everything under it keeps theirs; so do cut and paste,
 * undo, and redo. A split gives the second part a new ID (the command leaves
 * it without one); a merge keeps the first part's node, so its ID wins and the
 * absorbed one is retired. Content pasted from another document is re-keyed
 * before it arrives (`rekeyForeign`, used by `clipboard.ts`).
 *
 * A change that only touched text (`isTextOnly`) adds no identified node, so
 * the step is skipped without walking the document.
 */

export type IdFactory = () => string;

const identified = new Set<string>(identifiedTypes);

export const isIdentified = (typeName: string) => identified.has(typeName);

const legacyFields = ["legacyEntryId", "legacyRevision", "legacyParentId"] as const;

/** What a copy of a node keeps of its provenance, within the same document. */
export function copyAttributes(
  attrs: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attrs, id };
  if ("derivedFrom" in attrs) next.derivedFrom = attrs.id ?? null;
  for (const field of legacyFields) if (field in attrs) next[field] = null;
  return next;
}

/** What a node pasted from another document keeps: none of its lineage, only its source point. */
export function foreignAttributes(
  attrs: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attrs, id };
  if ("derivedFrom" in attrs) next.derivedFrom = null;
  for (const field of legacyFields) if (field in attrs) next[field] = null;
  return next;
}

/** A node and everything in it with fresh identities, as content from another document. */
function rekeyNode(node: ProseMirrorNode, newId: IdFactory): ProseMirrorNode {
  if (node.isText) return node;
  // The node before what is in it, so new IDs follow document order.
  const attrs = isIdentified(node.type.name) ? foreignAttributes(node.attrs, newId()) : node.attrs;
  return node.type.create(attrs, rekeyFragment(node.content, newId), node.marks);
}

function rekeyFragment(fragment: Fragment, newId: IdFactory): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((child) => nodes.push(rekeyNode(child, newId)));
  return Fragment.fromArray(nodes);
}

/** A slice pasted from another document: new IDs throughout (§B.6). */
export function rekeyForeign(slice: Slice, newId: IdFactory): Slice {
  return new Slice(rekeyFragment(slice.content, newId), slice.openStart, slice.openEnd);
}

/** IDs that appear on more than one node of a document. */
export function duplicateIds(doc: ProseMirrorNode): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  doc.descendants((node) => {
    const id = node.attrs.id;
    if (isIdentified(node.type.name) && typeof id === "string" && id) {
      if (seen.has(id)) twice.add(id);
      seen.add(id);
    }
    return true;
  });
  return [...twice];
}

export const identityKey = new PluginKey("labIdentity");

/** How many full identity passes ran, for the lab's measurements and tests. */
export const identityStats = { passes: 0 };

export const NodeIdentity = Extension.create<{ newId: IdFactory }>({
  name: "nodeIdentity",

  addOptions() {
    return { newId: () => crypto.randomUUID() };
  },

  addProseMirrorPlugins() {
    const newId = () => this.options.newId();
    return [
      new Plugin({
        key: identityKey,
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          if (isTextOnly(transactions)) return null;
          identityStats.passes += 1;

          // Where each node that had an ID before the change is now.
          const mapping = new Mapping();
          for (const tr of transactions) mapping.appendMapping(tr.mapping);
          const holders = new Map<string, number>();
          oldState.doc.descendants((node, pos) => {
            const id = node.attrs.id;
            if (isIdentified(node.type.name) && typeof id === "string" && id) {
              const mapped = mapping.mapResult(pos, 1);
              if (!mapped.deleted) holders.set(id, mapped.pos);
            }
            return true;
          });

          const fixes: { pos: number; attrs: Record<string, unknown> }[] = [];
          const occurrences = new Map<string, { pos: number; node: ProseMirrorNode }[]>();
          newState.doc.descendants((node, pos) => {
            if (!isIdentified(node.type.name)) return true;
            const id = node.attrs.id;
            if (typeof id !== "string" || !id) {
              fixes.push({ pos, attrs: { ...node.attrs, id: newId() } });
              return true;
            }
            const list = occurrences.get(id);
            if (list) list.push({ pos, node });
            else occurrences.set(id, [{ pos, node }]);
            return true;
          });

          for (const [id, list] of occurrences) {
            if (list.length < 2) continue;
            const holder = holders.get(id);
            const keeper = list.find((entry) => entry.pos === holder) ?? list[0];
            for (const entry of list) {
              if (entry === keeper) continue;
              fixes.push({ pos: entry.pos, attrs: copyAttributes(entry.node.attrs, newId()) });
            }
          }
          if (fixes.length === 0) return null;

          // Changing attributes moves nothing, so every position still holds.
          const tr = newState.tr;
          for (const fix of fixes) tr.setNodeMarkup(fix.pos, undefined, fix.attrs);
          return tr.setMeta(identityKey, fixes.length);
        },
      }),
    ];
  },
});

/**
 * The same rules on document JSON: a node with no ID is given one, and of
 * nodes sharing an ID the first keeps it. An explicit, opt-in repair for
 * fixtures and tools; loading never calls it (the validator refuses missing
 * and duplicate IDs instead). Returns a copy; the input is not changed.
 */
export function assignIds(doc: JSONContent, newId: IdFactory): JSONContent {
  const copy = structuredClone(doc);
  const seen = new Set<string>();
  const pending: JSONContent[] = [copy];
  // Depth first, in document order.
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.type && isIdentified(node.type)) {
      const attrs = { ...(node.attrs ?? {}) };
      const id = attrs.id;
      if (typeof id !== "string" || !id) {
        attrs.id = newId();
      } else if (seen.has(id)) {
        Object.assign(attrs, copyAttributes(attrs, newId()));
        if (node.type === "outlinePoint" || node.type === "sermonSection") attrs.derivedFrom = id;
      }
      seen.add(attrs.id as string);
      node.attrs = attrs;
    }
    const children = node.content ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  return copy;
}
