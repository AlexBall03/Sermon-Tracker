import { Extension, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";

import { identifiedTypes } from "./schema/nodes";

/*
 * Document-node identity (PS-1A prototype; migration document §6.3, Proposed).
 *
 * Every point, section, and passage has an `id`, unique in its document. After
 * every change that touches the document, one step makes it so again:
 *
 * - a node with no ID is given one;
 * - where two nodes share an ID (a paste, a duplicate), the node that was
 *   there before keeps it, found by mapping its old position through the
 *   change; the other is the copy and is given a new ID, remembers the ID it
 *   came from in `derivedFrom`, and loses `legacyEntryId`/`legacyRevision`.
 *   It keeps `sourcePointId`. (Whether a copy keeps the legacy ID is an Open
 *   Decision; clearing it is this prototype's choice, explained in the handoff.)
 *
 * A move takes the node out and puts the same node back in one change, so it
 * keeps its ID and everything under it keeps theirs. A split gives the second
 * part a new ID (the command leaves it without one); a merge keeps the first
 * part's node, so its ID wins and the absorbed one is retired.
 */

export type IdFactory = () => string;

const identified = new Set<string>(identifiedTypes);

export const isIdentified = (typeName: string) => identified.has(typeName);

/** What a copy of a node keeps of its provenance. */
export function copyAttributes(
  attrs: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...attrs, id };
  if ("derivedFrom" in attrs) next.derivedFrom = attrs.id ?? null;
  if ("legacyEntryId" in attrs) next.legacyEntryId = null;
  if ("legacyRevision" in attrs) next.legacyRevision = null;
  return next;
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
 * The same rules on document JSON, before it is loaded: a node with no ID is
 * given one, and of nodes sharing an ID the first keeps it. Returns a copy;
 * the input is not changed.
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
        if (node.type !== "scriptureReference") attrs.derivedFrom = id;
      }
      seen.add(attrs.id as string);
      node.attrs = attrs;
    }
    const children = node.content ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  return copy;
}
