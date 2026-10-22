import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";

import type { ComponentKind, ComponentStyle, DocumentStyles, NamedStyle } from "./model";
import {
  componentOf,
  namedStyleOf,
  resolveComponent,
  resolveNamed,
  type ResolvedBlock,
} from "./resolve";
import { presets, type Preset } from "./presets";

/*
 * What a position's text looks like before its own marks (PS-1B.2B.2B), as
 * the style sheet draws it (`render.ts`): a point's or a section's title
 * takes its component's style; a note's or a script's paragraphs take
 * theirs; any other paragraph or heading its named style, with its own
 * `format` last. The toolbar shows these as the values text inherits, and the
 * highlight pairs (`plugin.ts`) read the color.
 */

/** A component node's own appearance as drawn now: the committed one, or a preview's (`appearanceInForce`). */
export type AppearanceOf = (node: ProseMirrorNode) => ComponentStyle | null;

const committedAppearance: AppearanceOf = (node) =>
  (node.attrs.appearance ?? null) as ComponentStyle | null;

export function resolveAt(
  styles: DocumentStyles | null,
  $pos: ResolvedPos,
  preset: Preset = presets.baseline,
  appearanceOf: AppearanceOf = committedAppearance,
): ResolvedBlock {
  const block = $pos.parent;
  const depth = $pos.depth;
  // The experimental schema v4's point heading: its named style if it has one, else its component's.
  if (block.type.name === "point") {
    const own = (block.attrs.format ?? null) as Partial<ResolvedBlock> | null;
    const named = block.attrs.styleName as NamedStyle | null;
    if (named) return resolveNamed(styles, named, own, preset);
    const kind: ComponentKind =
      block.attrs.role === "introduction" || block.attrs.role === "conclusion"
        ? block.attrs.role
        : block.attrs.depth === 1
          ? "point"
          : "subpoint";
    // Its own appearance comes before its own format, as they are drawn (`render.ts`).
    const resolved = resolveComponent(
      styles,
      kind,
      ownAppearance(block, preset, appearanceOf),
      preset,
    );
    // Where components are drawn, a heading's words are in its title color when it has one.
    const color =
      preset.componentColors && resolved.titleColor !== undefined
        ? resolved.titleColor
        : resolved.color;
    return { ...resolved, color, ...own, align: "left" };
  }
  if (block.type.name === "pointTitle" || block.type.name === "sectionTitle") {
    let insidePoint = false;
    for (let level = depth - 2; level > 0; level -= 1) {
      if ($pos.node(level).type.name === "outlinePoint") insidePoint = true;
    }
    const owner = $pos.node(depth - 1);
    const kind = componentOf(owner.type.name, owner.attrs, insidePoint);
    if (kind) return { ...resolveComponent(styles, kind, null, preset), align: "left" };
  }
  const format = (block.attrs.format ?? null) as Partial<ResolvedBlock> | null;
  for (let level = depth - 1; level > 0; level -= 1) {
    const container = $pos.node(level);
    const name = container.type.name;
    if (name === "preacherNote" || name === "script") {
      return {
        ...resolveComponent(styles, name, ownAppearance(container, preset, appearanceOf), preset),
        ...format,
        align: "left",
      };
    }
  }
  return resolveNamed(
    styles,
    namedStyleOf(block.type.name, block.attrs) ?? "normal",
    format,
    preset,
  );
}

/**
 * A component's own appearance, where it is drawn: in a preset that draws
 * components (A1-UI.2B.1). The baseline never drew one, so it is not
 * reported there either.
 */
function ownAppearance(
  node: ProseMirrorNode,
  preset: Preset,
  appearanceOf: AppearanceOf,
): ComponentStyle | null {
  return preset.componentColors ? appearanceOf(node) : null;
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
