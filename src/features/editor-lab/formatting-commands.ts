import type { MarkType, Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import type { Command } from "./outline-commands";
import type { textAlignments } from "./schema/model";
import type { ColorValue } from "./styles/colors";
import { componentGoverned } from "./styles/context";
import {
  fontSizeLimits,
  isFontSize,
  namedStyles,
  paragraphFormatSchema,
  type FontKey,
  type NamedStyle,
} from "./styles/model";

/*
 * Formatting (PS-1B.2B.2B): every change of how text looks, as ProseMirror
 * commands the toolbar, the keyboard, a future context menu, the phone's
 * controls, and the tests all call. Like the outline's commands, each checks
 * before it changes anything, returns false where it cannot apply (so a
 * control can show itself unavailable), and makes one transaction.
 *
 * Three kinds, kept apart:
 *
 *   - inline: marks on the selected text (`setTextStyle`, `setHighlight`);
 *     at a collapsed cursor they become the stored marks, so what is typed
 *     next takes them;
 *   - paragraph: `styleName`, heading level, `textAlign`, and `format` on the
 *     selected paragraphs and headings (`setNamedStyle`, `setAlignment`,
 *     `setParagraphFormat`);
 *   - semantic components (points, sections, notes, scripts, passages) are
 *     never changed here: no command alters a node's type other than a
 *     paragraph's or heading's, an ID, an attribute of a point or a section,
 *     numbering, or `doc.attrs` (the sermon's title is not in the document,
 *     so a Title-styled paragraph renames nothing). Titles take their
 *     component's style, so named styles and paragraph format are refused in
 *     them; inline formatting works there as anywhere.
 */

type TextAttribute = "fontFamily" | "fontSize" | "color";
type TextAttributes = {
  color: ColorValue | null;
  fontFamily: FontKey | null;
  fontSize: number | null;
};
export type Alignment = (typeof textAlignments)[number];
export type ParagraphFormat = {
  lineHeight?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  indentLeft?: number;
  indentFirst?: number;
};

const blankTextStyle: TextAttributes = { color: null, fontFamily: null, fontSize: null };
const hasAny = (attrs: TextAttributes) =>
  attrs.color !== null || attrs.fontFamily !== null || attrs.fontSize !== null;

/** Every text node in the selection, with the part of it selected. */
function forEachSelectedText(
  state: EditorState,
  visit: (node: ProseMirrorNode, from: number, to: number, parent: ProseMirrorNode) => void,
) {
  for (const range of state.selection.ranges) {
    const from = range.$from.pos;
    const to = range.$to.pos;
    state.doc.nodesBetween(from, to, (node, pos, parent) => {
      if (!node.isText || !parent) return true;
      visit(node, Math.max(pos, from), Math.min(pos + node.nodeSize, to), parent);
      return false;
    });
  }
}

/** The marks typing at the cursor would take. */
const cursorMarks = (state: EditorState) => state.storedMarks ?? state.selection.$from.marks();

/** Replaces the stored marks of one type at a collapsed cursor. */
function storeMark(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  type: MarkType,
  attrs: Record<string, unknown> | null,
) {
  if (!state.selection.$from.parent.type.allowsMarkType(type)) return false;
  if (dispatch) {
    // The cursor's other marks stay; this type's is replaced.
    const tr = state.tr.setStoredMarks(cursorMarks(state).filter((mark) => mark.type !== type));
    if (attrs) tr.addStoredMark(type.create(attrs));
    dispatch(tr);
  }
  return true;
}

/**
 * Sets one `textStyle` attribute on the selected text, keeping each run's
 * other attributes (a size change keeps a run's color). null clears it; a
 * `textStyle` left with nothing is removed.
 */
export const setTextStyle =
  <K extends TextAttribute>(attribute: K, value: TextAttributes[K] | null): Command =>
  (state, dispatch) => {
    const type = state.schema.marks.textStyle;
    if (state.selection.empty) {
      const current = type.isInSet(cursorMarks(state))?.attrs as TextAttributes | undefined;
      const attrs = { ...blankTextStyle, ...current, [attribute]: value };
      return storeMark(state, dispatch, type, hasAny(attrs) ? attrs : null);
    }
    const tr = state.tr;
    let applies = false;
    forEachSelectedText(state, (node, from, to, parent) => {
      if (!parent.type.allowsMarkType(type)) return;
      applies = true;
      const current = type.isInSet(node.marks)?.attrs as TextAttributes | undefined;
      const attrs = { ...blankTextStyle, ...current, [attribute]: value };
      tr.removeMark(from, to, type);
      if (hasAny(attrs)) tr.addMark(from, to, type.create(attrs));
    });
    if (!applies) return false;
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };

export const setFontFamily = (key: FontKey | null) => setTextStyle("fontFamily", key);
export const setFontSize = (points: number | null) =>
  points !== null && !isFontSize(points) ? () => false : setTextStyle("fontSize", points);
export const setTextColor = (color: ColorValue | null) => setTextStyle("color", color);

/** The sizes a word processor's size list offers, and that stepping moves between. */
export const fontSizeSteps = [
  8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 60, 72, 96, 144,
] as const;

/** The next size up or down the list from `current` (any size), within 4–144. */
export function steppedSize(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    return fontSizeSteps.find((size) => size > current) ?? fontSizeLimits.max;
  }
  return [...fontSizeSteps].reverse().find((size) => size < current) ?? fontSizeLimits.min;
}

/** A typed size made valid: rounded to the half point; null when it is not a size at all or is out of range. */
export function parseFontSize(text: string): number | null {
  const value = Number(text.replace(",", ".").trim());
  if (!Number.isFinite(value) || text.trim() === "") return null;
  const rounded = Math.round(value * 2) / 2;
  return isFontSize(rounded) ? rounded : null;
}

/** Highlights the selected text with `color`, or removes the highlight (null). */
export const setHighlight =
  (color: ColorValue | null): Command =>
  (state, dispatch) => {
    const type = state.schema.marks.highlight;
    if (state.selection.empty) {
      return storeMark(state, dispatch, type, color === null ? null : { color });
    }
    const tr = state.tr;
    let applies = false;
    forEachSelectedText(state, (_node, from, to, parent) => {
      if (!parent.type.allowsMarkType(type)) return;
      applies = true;
      tr.removeMark(from, to, type);
      if (color !== null) tr.addMark(from, to, type.create({ color }));
    });
    if (!applies) return false;
    if (dispatch) dispatch(tr.scrollIntoView());
    return true;
  };

/* Paragraph formatting */

type Block = { node: ProseMirrorNode; pos: number; $inside: ResolvedPos };

/** The paragraphs and headings the selection is in or across (at a cursor, the one it is in). */
function selectedBlocks(state: EditorState): Block[] {
  const blocks: Block[] = [];
  const seen = new Set<number>();
  for (const range of state.selection.ranges) {
    state.doc.nodesBetween(range.$from.pos, range.$to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      if ((node.type.name === "paragraph" || node.type.name === "heading") && !seen.has(pos)) {
        seen.add(pos);
        blocks.push({ node, pos, $inside: state.doc.resolve(pos + 1) });
      }
      return false;
    });
  }
  return blocks;
}

/** Changes each selected paragraph or heading `change` accepts; false when it accepted none. */
function changeBlocks(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  change: (block: Block, tr: Transaction) => boolean,
): boolean {
  const tr = state.tr;
  let applied = false;
  for (const block of selectedBlocks(state)) {
    if (change(block, tr)) applied = true;
  }
  if (!applied) return false;
  if (dispatch && tr.docChanged) dispatch(tr);
  return true;
}

/** Where a named style can be: not a title, and not inside a note or a script (their component governs). */
const takesNamedStyle = (block: Block) => !componentGoverned(block.$inside);

/**
 * Puts the selected paragraphs and headings in a named style. Normal, Title,
 * and Subtitle are paragraphs (`styleName`); Heading 1–4 are headings. The
 * block's alignment and format go with it. Nothing else changes: the block
 * stays where it is, inside whatever point or section holds it.
 */
export const setNamedStyle =
  (name: NamedStyle): Command =>
  (state, dispatch) =>
    namedStyles.includes(name) &&
    changeBlocks(state, dispatch, (block, tr) => {
      if (!takesNamedStyle(block)) return false;
      const { schema } = state;
      const heading = name.startsWith("heading");
      const type = heading ? schema.nodes.heading : schema.nodes.paragraph;
      const $pos = state.doc.resolve(block.pos);
      if (!$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, type)) return false;
      const carried = { textAlign: block.node.attrs.textAlign, format: block.node.attrs.format };
      const attrs = heading
        ? { ...carried, level: Number(name.slice("heading".length)) }
        : { ...carried, styleName: name === "normal" ? null : name };
      tr.setNodeMarkup(block.pos, type, attrs);
      return true;
    });

/** Aligns the selected paragraphs and headings; null returns them to their style's alignment. */
export const setAlignment =
  (align: Alignment | null): Command =>
  (state, dispatch) =>
    changeBlocks(state, dispatch, (block, tr) => {
      tr.setNodeAttribute(block.pos, "textAlign", align);
      return true;
    });

/** A format with nothing in it is stored as null, never as `{}`. */
export function sparseFormat(format: ParagraphFormat): ParagraphFormat | null {
  const entries = Object.entries(format).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as ParagraphFormat) : null;
}

/**
 * Merges `patch` into each selected paragraph's or heading's own format; a
 * property given as undefined returns to the style's value. A value the
 * format schema refuses changes nothing.
 */
export const setParagraphFormat =
  (patch: { [K in keyof ParagraphFormat]: ParagraphFormat[K] | undefined }): Command =>
  (state, dispatch) =>
    changeBlocks(state, dispatch, (block, tr) => {
      const next = sparseFormat({ ...(block.node.attrs.format ?? {}), ...patch });
      if (next && !paragraphFormatSchema.safeParse(next).success) return false;
      tr.setNodeAttribute(block.pos, "format", next);
      return true;
    });

const directMarks = ["bold", "italic", "underline", "textStyle", "highlight"] as const;

/**
 * Removes direct formatting: the selected text's marks and the selected
 * paragraphs' own alignment and format. What a block is stays: its named
 * style or heading level, and every point, section, note, script, passage,
 * and reference with its ID. At a cursor, the marks typing would take and
 * the paragraph it is in.
 */
export const clearFormatting: Command = (state, dispatch) => {
  const types = directMarks.map((name) => state.schema.marks[name]).filter(Boolean);
  const tr = state.tr;
  if (state.selection.empty) {
    tr.setStoredMarks([]);
  } else {
    for (const range of state.selection.ranges) {
      for (const type of types) tr.removeMark(range.$from.pos, range.$to.pos, type);
    }
  }
  for (const block of selectedBlocks(state)) {
    if (block.node.attrs.textAlign !== null) tr.setNodeAttribute(block.pos, "textAlign", null);
    if (block.node.attrs.format !== null) tr.setNodeAttribute(block.pos, "format", null);
  }
  const changed = tr.docChanged || (state.selection.empty && cursorMarks(state).length > 0);
  if (!changed) return false;
  if (dispatch) dispatch(tr);
  return true;
};
