import type { ResolvedPos } from "@tiptap/pm/model";

import type { DocumentStyles } from "./model";
import {
  componentOf,
  namedStyleOf,
  resolveComponent,
  resolveNamed,
  type ResolvedBlock,
} from "./resolve";

/*
 * What a position's text looks like before its own marks (PS-1B.2B.2B), as
 * the style sheet draws it (`render.ts`): a point's or a section's title
 * takes its component's style; a note's or a script's paragraphs take
 * theirs; any other paragraph or heading its named style, with its own
 * `format` last. The toolbar shows these as the values text inherits, and the
 * highlight pairs (`plugin.ts`) read the color.
 */

export function resolveAt(styles: DocumentStyles | null, $pos: ResolvedPos): ResolvedBlock {
  const block = $pos.parent;
  const depth = $pos.depth;
  if (block.type.name === "pointTitle" || block.type.name === "sectionTitle") {
    let insidePoint = false;
    for (let level = depth - 2; level > 0; level -= 1) {
      if ($pos.node(level).type.name === "outlinePoint") insidePoint = true;
    }
    const owner = $pos.node(depth - 1);
    const kind = componentOf(owner.type.name, owner.attrs, insidePoint);
    if (kind) return { ...resolveComponent(styles, kind), align: "left" };
  }
  const format = (block.attrs.format ?? null) as Partial<ResolvedBlock> | null;
  for (let level = depth - 1; level > 0; level -= 1) {
    const name = $pos.node(level).type.name;
    if (name === "preacherNote" || name === "script") {
      return { ...resolveComponent(styles, name), ...format, align: "left" };
    }
  }
  return resolveNamed(styles, namedStyleOf(block.type.name, block.attrs) ?? "normal", format);
}

/** Whether a position is where component styles govern the text (a title, a note, a script). */
export function componentGoverned($pos: ResolvedPos): boolean {
  if ($pos.parent.type.name === "pointTitle" || $pos.parent.type.name === "sectionTitle")
    return true;
  for (let level = $pos.depth - 1; level > 0; level -= 1) {
    const name = $pos.node(level).type.name;
    if (name === "preacherNote" || name === "script") return true;
  }
  return false;
}
