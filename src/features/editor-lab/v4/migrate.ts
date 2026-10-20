import type { JSONContent } from "@tiptap/core";

import { v4SchemaVersion } from "./model";

/*
 * v3 ⇄ v4 (prototype). Pure functions on JSON; the input is never changed.
 *
 * v3 → v4 flattens the nesting and writes it down as depths:
 * - a point nested n deep becomes a `point` at depth n, its title's words
 *   and marks as its heading, its own attributes as they were;
 * - a section becomes a main point (depth 1) with the section's role;
 * - everything a point or section held besides its title follows it, in
 *   order, at its depth (lists, quotations, notes, scripts, passages);
 * - top-level writing and page breaks stay at depth 0.
 * Because a block belongs to the nearest open point at its depth
 * (`ownership.ts`), writing after a point's subpoints still belongs to the
 * point, exactly as it was nested. Nothing is dropped.
 *
 * v4 → v3 (`toV3`) is the inverse, for documents v3 can hold; it exists to
 * prove the flattening loses nothing (the round trip is exact), and says
 * where a document cannot go back.
 */

type Attrs = Record<string, unknown>;

const entryProvenance = ["id", "legacyEntryId", "legacyRevision", "derivedFrom"] as const;

function pointFrom(node: JSONContent, depth: number, role: unknown): JSONContent {
  const source = node.attrs ?? {};
  const attrs: Attrs = { depth };
  for (const field of entryProvenance) attrs[field] = source[field] ?? null;
  attrs.role = role ?? null;
  attrs.sourcePointId = source.sourcePointId ?? null;
  attrs.presentation = source.presentation ?? null;
  attrs.legacyParentId = source.legacyParentId ?? null;
  attrs.appearance = source.appearance ?? null;
  const title = node.content?.[0];
  const heading: JSONContent = { type: "point", attrs };
  if (title?.content?.length) heading.content = structuredClone(title.content);
  return heading;
}

const withDepth = (node: JSONContent, depth: number): JSONContent => ({
  ...structuredClone(node),
  attrs: { ...(node.attrs ?? {}), depth },
});

function flatten(node: JSONContent, depth: number, out: JSONContent[]) {
  if (node.type === "outlinePoint" || node.type === "sermonSection") {
    const own = node.type === "sermonSection" ? 1 : depth + 1;
    out.push(pointFrom(node, own, node.type === "sermonSection" ? node.attrs?.role : null));
    for (const child of (node.content ?? []).slice(1)) flatten(child, own, out);
    return;
  }
  out.push(withDepth(node, depth));
}

export function v3ToV4(doc: JSONContent): JSONContent {
  const content: JSONContent[] = [];
  for (const node of doc.content ?? []) flatten(node, 0, content);
  return { type: "doc", attrs: { ...(doc.attrs ?? {}), schemaVersion: v4SchemaVersion }, content };
}

export type BackToV3 =
  | { ok: true; doc: JSONContent }
  | {
      ok: false;
      reason: "irregular" | "section_holds_points" | "section_below_main" | "heading_look";
    };

/** A block and everything in it without v4's `depth`, which v3 does not have. */
function withoutDepth(node: JSONContent): JSONContent {
  const copy: JSONContent = { ...node };
  if (node.attrs) {
    const { depth: _depth, ...rest } = node.attrs;
    void _depth;
    copy.attrs = rest;
  }
  if (node.content) copy.content = node.content.map(withoutDepth);
  return structuredClone(copy);
}

/** v4 → v3, for documents v3 can hold. */
export function toV3(doc: JSONContent): BackToV3 {
  const top: JSONContent[] = [];
  // The open containers, outermost first, with the depth each holds its writing at.
  const stack: { node: JSONContent; depth: number }[] = [];
  const holder = () => (stack.length ? stack[stack.length - 1].node.content! : top);

  for (const block of doc.content ?? []) {
    const attrs = block.attrs ?? {};
    const depth = typeof attrs.depth === "number" ? attrs.depth : 0;
    if (block.type === "point") {
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      const parentDepth = stack.length ? stack[stack.length - 1].depth : 0;
      if (depth !== parentDepth + 1) return { ok: false, reason: "irregular" };
      const role = attrs.role ?? null;
      if (role && depth !== 1) return { ok: false, reason: "section_below_main" };
      // A v3 title takes its look from its component only.
      if (attrs.styleName || attrs.format || attrs.textAlign) {
        return { ok: false, reason: "heading_look" };
      }
      if (stack.length && stack[stack.length - 1].node.type === "sermonSection") {
        return { ok: false, reason: "section_holds_points" };
      }
      const titleType = role ? "sectionTitle" : "pointTitle";
      const title: JSONContent = { type: titleType };
      if (block.content?.length) title.content = structuredClone(block.content);
      const kept: Attrs = {};
      for (const field of entryProvenance) kept[field] = attrs[field] ?? null;
      kept.appearance = attrs.appearance ?? null;
      const node: JSONContent = role
        ? { type: "sermonSection", attrs: { ...kept, role }, content: [title] }
        : {
            type: "outlinePoint",
            attrs: {
              ...kept,
              sourcePointId: attrs.sourcePointId ?? null,
              legacyParentId: attrs.legacyParentId ?? null,
              presentation: attrs.presentation ?? null,
            },
            content: [title],
          };
      holder().push(node);
      stack.push({ node, depth });
      continue;
    }
    while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
    const holdsAt = stack.length ? stack[stack.length - 1].depth : 0;
    if (holdsAt !== depth) return { ok: false, reason: "irregular" };
    holder().push(withoutDepth(block));
  }
  const attrs = { ...(doc.attrs ?? {}), schemaVersion: 3 };
  return { ok: true, doc: { type: "doc", attrs, content: top } };
}
