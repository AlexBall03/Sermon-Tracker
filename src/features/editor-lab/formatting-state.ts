import type { EditorState } from "@tiptap/pm/state";

import {
  clearFormatting,
  setNamedStyle,
  setParagraphFormat,
  type Alignment,
} from "./formatting-commands";
import type { ColorValue } from "./styles/colors";
import { resolveAt } from "./styles/context";
import { namedStyles, type FontKey, type NamedStyle } from "./styles/model";
import { stylesInForce } from "./styles/plugin";
import { namedStyleOf } from "./styles/resolve";

/*
 * What the formatting controls show (PS-1B.2B.2B), read from the editor's
 * state alone. Each value is what the selected text is drawn with: its own
 * mark if it has one, else what it inherits from its paragraph's style
 * (`inherited` says which). Where the selection holds more than one value,
 * the value is "mixed", and a control shows no single choice.
 *
 * These are read on every selection change by the toolbar's narrow
 * selectors, so they look at no more than `textLimit` runs of text.
 */

export const mixed = "mixed" as const;
type Maybe<T> = T | typeof mixed;

export type TextState = {
  fontFamily: Maybe<FontKey>;
  fontSize: Maybe<number>;
  /** null: the theme's text color. */
  color: Maybe<ColorValue | null>;
  /** null: no highlight. */
  highlight: Maybe<ColorValue | null>;
  /** Whether the font, size, and color shown come from the style rather than a mark. */
  inherited: { fontFamily: boolean; fontSize: boolean; color: boolean };
};

const textLimit = 2000;

const key = (value: unknown) => JSON.stringify(value ?? null);

/** One value from many: the value when they are all the same, else "mixed". */
function agree<T>(values: T[]): Maybe<T> {
  if (values.length === 0) return mixed;
  const first = key(values[0]);
  return values.every((value) => key(value) === first) ? values[0] : mixed;
}

export function textState(state: EditorState): TextState {
  const styles = stylesInForce(state);
  const runs: {
    fontFamily: FontKey;
    fontSize: number;
    color: ColorValue | null;
    highlight: ColorValue | null;
    own: { fontFamily: boolean; fontSize: boolean; color: boolean };
  }[] = [];
  const read = (
    marks: readonly { type: { name: string }; attrs: Record<string, unknown> }[],
    $pos: Parameters<typeof resolveAt>[1],
  ) => {
    const block = resolveAt(styles, $pos);
    const style = marks.find((mark) => mark.type.name === "textStyle")?.attrs;
    const highlight = marks.find((mark) => mark.type.name === "highlight")?.attrs.color;
    runs.push({
      fontFamily: (style?.fontFamily as FontKey | null) ?? block.fontFamily,
      fontSize: (style?.fontSize as number | null) ?? block.fontSize,
      color: (style?.color as ColorValue | null) ?? block.color,
      highlight: (highlight as ColorValue | undefined) ?? null,
      own: {
        fontFamily: Boolean(style?.fontFamily),
        fontSize: Boolean(style?.fontSize),
        color: Boolean(style?.color),
      },
    });
  };

  const { selection } = state;
  if (selection.empty) {
    read(state.storedMarks ?? selection.$from.marks(), selection.$from);
  } else {
    for (const range of selection.ranges) {
      state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
        if (runs.length >= textLimit) return false;
        if (!node.isText) return true;
        read(node.marks, state.doc.resolve(Math.max(pos, range.$from.pos)));
        return false;
      });
    }
    // A selection of no text (a passage block, a page break) reads like its start.
    if (runs.length === 0) read(selection.$from.marks(), selection.$from);
  }

  return {
    fontFamily: agree(runs.map((run) => run.fontFamily)),
    fontSize: agree(runs.map((run) => run.fontSize)),
    color: agree(runs.map((run) => run.color)),
    highlight: agree(runs.map((run) => run.highlight)),
    inherited: {
      fontFamily: runs.every((run) => !run.own.fontFamily),
      fontSize: runs.every((run) => !run.own.fontSize),
      color: runs.every((run) => !run.own.color),
    },
  };
}

/** A schema v4 point heading that keeps its component's own look (no named style). */
export const componentLook = "component" as const;

export type BlockState = {
  /**
   * The named style of the selected paragraphs; null where none can be chosen
   * (a title, a note). A schema v4 point heading shows its look: a named
   * style, or `componentLook`.
   */
  style: Maybe<NamedStyle | typeof componentLook> | null;
  /** The named styles that can be chosen here. */
  styles: NamedStyle[];
  /** Whether the selection holds a schema v4 point heading, which can return to its component's look. */
  component: boolean;
  align: Maybe<Alignment> | null;
  lineHeight: Maybe<number> | null;
  spaceBefore: Maybe<number> | null;
  spaceAfter: Maybe<number> | null;
  indentLeft: Maybe<number> | null;
  indentFirst: Maybe<number> | null;
  /** Whether paragraph formatting applies here at all. */
  paragraph: boolean;
  /** Whether anything here has direct formatting to clear. */
  clearable: boolean;
};

export function blockState(state: EditorState): BlockState {
  const styles = stylesInForce(state);
  const blocks: {
    name: NamedStyle | typeof componentLook | null;
    resolved: ReturnType<typeof resolveAt>;
  }[] = [];
  let points = false;
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (blocks.length >= textLimit) return false;
      if (!node.isTextblock) return true;
      const point = node.type.name === "point";
      if (point || node.type.name === "paragraph" || node.type.name === "heading") {
        const resolved = resolveAt(styles, state.doc.resolve(pos + 1));
        if (point) points = true;
        blocks.push({
          name: point
            ? ((node.attrs.styleName as NamedStyle | null) ?? componentLook)
            : namedStyleOf(node.type.name, node.attrs),
          // The block's own alignment comes after its style's, as it is drawn.
          resolved: {
            ...resolved,
            align: (node.attrs.textAlign as Alignment | null) ?? resolved.align,
          },
        });
      }
      return false;
    });
  }
  const choices = namedStyles.filter((name) => setNamedStyle(name)(state));
  const paragraph = blocks.length > 0 && setParagraphFormat({})(state);
  const property = <
    K extends "lineHeight" | "spaceBefore" | "spaceAfter" | "indentLeft" | "indentFirst" | "align",
  >(
    name: K,
  ) => (paragraph ? agree(blocks.map((block) => block.resolved[name])) : null);
  return {
    style: choices.length ? agree(blocks.map((block) => block.name ?? "normal")) : null,
    styles: choices,
    component: points,
    align: property("align"),
    lineHeight: property("lineHeight"),
    spaceBefore: property("spaceBefore"),
    spaceAfter: property("spaceAfter"),
    indentLeft: property("indentLeft"),
    indentFirst: property("indentFirst"),
    paragraph,
    clearable: clearFormatting(state),
  };
}
