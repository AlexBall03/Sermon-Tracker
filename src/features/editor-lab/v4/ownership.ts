import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/*
 * Who owns what in a v4 document, worked out from order and depth alone
 * (prototype; `model.ts`). Nothing here is stored, and nothing stores a parent.
 *
 * One pass over the top-level blocks with a stack of the points still open:
 *
 * - A point at depth L closes every open point at depth L or deeper. Its
 *   parent is the point left on top (none: a main point).
 * - Any other block at depth d closes every open point deeper than d. At
 *   depth 0 it belongs to the document; otherwise to the point left on top.
 *   So prose after several subpoints, at the parent's depth, belongs to the
 *   parent, however many subpoints came before it.
 * - A point's group is the point and every block up to the one that closes
 *   it: always one contiguous run, so moving a point moves one range.
 *
 * Every sequence of depths has a meaning; none is invalid. Two are irregular
 * and are reported, never repaired (`irregular`): a point more than one level
 * below its parent (`skipped_level`), and a block deeper than the point it
 * belongs to (`deeper_than_owner`). They arise only from deleting across
 * structure or pasting; the commands never make one.
 */

export type Irregularity = "skipped_level" | "deeper_than_owner";

/** What the analysis needs of a block. */
export type Shape = { isPoint: boolean; depth: number };

export type Analysis = {
  /** For a point, its parent point's index; for any other block, its owner's; null: the document. */
  owner: (number | null)[];
  /** For a point, the index just after its group; for any other block, its own index + 1. */
  groupEnd: number[];
  irregular: (Irregularity | null)[];
  /** The open points (indices, outermost first) just before each block. */
  openBefore: number[][];
};

export function analyzeShapes(shapes: readonly Shape[]): Analysis {
  const owner: (number | null)[] = [];
  const groupEnd: number[] = shapes.map((_, index) => index + 1);
  const irregular: (Irregularity | null)[] = [];
  const openBefore: number[][] = [];
  const stack: number[] = [];
  const close = (until: number, at: number) => {
    while (stack.length > 0 && shapes[stack[stack.length - 1]].depth >= until) {
      groupEnd[stack.pop()!] = at;
    }
  };

  shapes.forEach((shape, index) => {
    openBefore.push([...stack]);
    if (shape.isPoint) {
      close(shape.depth, index);
      const parent = stack.length ? stack[stack.length - 1] : null;
      owner.push(parent);
      const parentDepth = parent === null ? 0 : shapes[parent].depth;
      irregular.push(shape.depth > parentDepth + 1 ? "skipped_level" : null);
      stack.push(index);
    } else {
      close(shape.depth + 1, index);
      const top = stack.length ? stack[stack.length - 1] : null;
      const own = shape.depth === 0 ? null : top;
      owner.push(own);
      const ownDepth = own === null ? 0 : shapes[own].depth;
      irregular.push(shape.depth > ownDepth ? "deeper_than_owner" : null);
    }
  });
  close(0, shapes.length);
  return { owner, groupEnd, irregular, openBefore };
}

/** A top-level block of a document, where it starts, and its shape. */
export type TopBlock = { node: ProseMirrorNode; pos: number; index: number } & Shape;

export type Structure = Analysis & { blocks: TopBlock[] };

export function topBlocks(doc: ProseMirrorNode): TopBlock[] {
  const blocks: TopBlock[] = [];
  doc.forEach((node, pos, index) => {
    const isPoint = node.type.name === "point";
    const depth = typeof node.attrs.depth === "number" ? node.attrs.depth : 0;
    blocks.push({ node, pos, index, isPoint, depth });
  });
  return blocks;
}

const cache = new WeakMap<ProseMirrorNode, Structure>();

/** The structure of a document, worked out once per document node. */
export function analyze(doc: ProseMirrorNode): Structure {
  const known = cache.get(doc);
  if (known) return known;
  const blocks = topBlocks(doc);
  const structure = { blocks, ...analyzeShapes(blocks) };
  cache.set(doc, structure);
  return structure;
}

/** Where a block's group starts and ends in the document. */
export function groupRange(structure: Structure, index: number) {
  const end = structure.groupEnd[index];
  const last = structure.blocks[end - 1];
  return { from: structure.blocks[index].pos, to: last.pos + last.node.nodeSize, end };
}

/** The point whose group a block is in most closely: itself if a point, else its owner. */
export const nearestPoint = (structure: Structure, index: number): number | null =>
  structure.blocks[index].isPoint ? index : structure.owner[index];

/** The previous point under the same parent, at the same depth (null: the first). */
export function previousSibling(structure: Structure, index: number): number | null {
  const { blocks, owner } = structure;
  for (let other = index - 1; other >= 0; other -= 1) {
    const block = blocks[other];
    if (block.isPoint && owner[other] === owner[index] && block.depth === blocks[index].depth) {
      return other;
    }
    // Past the parent there is no sibling.
    if (other === owner[index]) return null;
  }
  return null;
}

/** The next point under the same parent, at the same depth (null: the last). */
export function nextSibling(structure: Structure, index: number): number | null {
  const { blocks, owner, groupEnd } = structure;
  const parent = owner[index];
  const limit = parent === null ? blocks.length : groupEnd[parent];
  for (let other = groupEnd[index]; other < limit; other += 1) {
    const block = blocks[other];
    if (block.isPoint && owner[other] === parent && block.depth === blocks[index].depth) {
      return other;
    }
  }
  return null;
}

/**
 * Who owns every block, by a key that survives moves: a point's ID (or its
 * index while it has none). For comparing ownership before and after a change.
 */
export function ownerKeys(structure: Structure): (string | null)[] {
  return structure.owner.map((owner) => {
    if (owner === null) return null;
    const id = structure.blocks[owner].node.attrs.id;
    return typeof id === "string" && id ? id : `@${owner}`;
  });
}
