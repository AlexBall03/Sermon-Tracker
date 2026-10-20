import type { ResolvedBlock } from "./resolve";

/*
 * How paragraph properties are drawn (PS-1B.2B.2B), shared by a node's own
 * `format` (inline) and the named styles (`render.ts`, as variables).
 *
 * Space before and after are padding, not margin: a word processor adds the
 * space after one paragraph to the space before the next, and CSS margins
 * would collapse into the larger of the two, and through the edges of
 * sections, points, lists, and quotations as well. Padding adds up the same
 * way at every depth, and Print Layout flows lines round its page gaps the
 * same whether the space above a line is margin or padding.
 */

type ParagraphProps = Pick<
  ResolvedBlock,
  "lineHeight" | "spaceBefore" | "spaceAfter" | "indentLeft" | "indentFirst"
>;

export const paragraphCss: { [K in keyof ParagraphProps]: (value: number) => string } = {
  lineHeight: (value) => `line-height: ${value}`,
  spaceBefore: (value) => `padding-top: ${value}pt`,
  spaceAfter: (value) => `padding-bottom: ${value}pt`,
  indentLeft: (value) => `margin-left: ${value}pt`,
  indentFirst: (value) => `text-indent: ${value}pt`,
};

/** A node's own paragraph overrides as one inline style; empty when it has none. */
export function formatStyle(format: Partial<ParagraphProps> | null | undefined): string {
  if (!format) return "";
  return (Object.keys(paragraphCss) as (keyof ParagraphProps)[])
    .filter((key) => typeof format[key] === "number")
    .map((key) => paragraphCss[key](format[key]!))
    .join("; ");
}
