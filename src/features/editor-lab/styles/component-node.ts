import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ComponentKind } from "./model";

/** The component a node stands for in the v4 schema, or null. */
export function componentOfNode(node: ProseMirrorNode): ComponentKind | null {
  switch (node.type.name) {
    case "point":
      return node.attrs.role === "introduction" || node.attrs.role === "conclusion"
        ? node.attrs.role
        : node.attrs.depth === 1
          ? "point"
          : "subpoint";
    case "scripturePassage":
      return "scripture";
    case "preacherNote":
      return "preacherNote";
    case "script":
      return "script";
    default:
      return null;
  }
}

export type FoundComponent = { node: ProseMirrorNode; pos: number; kind: ComponentKind };

/**
 * The component with this ID, wherever it now stands, or null when there is
 * none. Found by identity, never by position (A1-UI.2B.2): a component that
 * moved is still found, and one that was removed is not replaced by another.
 * The walk stops at text, so it looks at each block once.
 */
export function findComponent(doc: ProseMirrorNode, id: string): FoundComponent | null {
  let found: FoundComponent | null = null;
  doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs.id === id) {
      const kind = componentOfNode(node);
      if (kind) found = { node, pos, kind };
      return false;
    }
    return !node.isTextblock;
  });
  return found;
}
