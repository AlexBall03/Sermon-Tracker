import { colorVariants } from "./colors";
import { fontStack } from "./font-stack";
import { type ComponentKind, type DocumentStyles, type NamedStyle } from "./model";
import { paragraphCss } from "./paragraph-css";
import { resolveComponent, resolveNamed, type ResolvedBlock } from "./resolve";

/*
 * The document's styles drawn (PS-1B.2B.2B): one style sheet per editor,
 * built from the resolver (`resolve.ts`) and scoped to that editor, that sets
 * how every named style and every component's text looks. A node's own
 * `format`, `textAlign`, and marks are inline in its HTML and so come after
 * it, as the resolver orders them.
 *
 * The sheet is rebuilt only when the styles change (a new `styles` object,
 * or a preview), never per keystroke, and is replaced as a whole. Colors:
 * the light variant is the rule, the dark variant a second rule for the dark
 * theme on screen only, so printing always draws the paper colors. A style
 * whose color is null sets none: its text is the theme's, or what its
 * container gives (a note's muted text).
 *
 * Component colors other than text (fill, border, accent, labels) and the
 * appearance overrides of single nodes are drawn in B.2C.
 */

type Rule = { selector: string; block: Omit<ResolvedBlock, "align"> & { align?: string } };

/** Ordinary paragraphs, not titles and not a passage's verses (drawn by its node view). */
const prose = (scope: string) => `${scope} p:not(.lab-title):not(.lab-passage-text p)`;

const namedSelectors = (scope: string): Record<NamedStyle, string> => ({
  normal: prose(scope),
  title: `${prose(scope)}[data-style-name="title"]`,
  subtitle: `${prose(scope)}[data-style-name="subtitle"]`,
  heading1: `${scope} h1`,
  heading2: `${scope} h2`,
  heading3: `${scope} h3`,
  heading4: `${scope} h4`,
});

/**
 * Component text. A point's and a section's title; a note's and a script's
 * paragraphs (they hold no headings, and their look is their component's).
 * Later rules win at equal specificity, so these come after the named ones.
 */
const componentSelectors = (scope: string): [ComponentKind, string][] => [
  ["point", `${scope} > .lab-point > p.lab-title`],
  ["subpoint", `${scope} .lab-point .lab-point > p.lab-title`],
  ["introduction", `${scope} .lab-section[data-role="introduction"] > p.lab-title`],
  ["conclusion", `${scope} .lab-section[data-role="conclusion"] > p.lab-title`],
  ["preacherNote", `${scope} .lab-note ${prose("").trim()}`],
  ["script", `${scope} .lab-script ${prose("").trim()}`],
];

function declarations(block: Rule["block"]): string[] {
  const lines = [
    `font-family: ${fontStack(block.fontFamily)}`,
    `font-size: ${block.fontSize}pt`,
    `font-weight: ${block.bold ? 700 : 400}`,
    `font-style: ${block.italic ? "italic" : "normal"}`,
    `text-decoration-line: ${block.underline ? "underline" : "none"}`,
    paragraphCss.lineHeight(block.lineHeight),
    paragraphCss.spaceBefore(block.spaceBefore),
    paragraphCss.spaceAfter(block.spaceAfter),
    paragraphCss.indentLeft(block.indentLeft),
    paragraphCss.indentFirst(block.indentFirst),
  ];
  if (block.align) lines.push(`text-align: ${block.align}`);
  return lines;
}

/** The rules of a sheet: the editor's own text, then named styles, then components. */
function rules(styles: DocumentStyles | null, scope: string): Rule[] {
  const named = namedSelectors(scope);
  return [
    ...(Object.keys(named) as NamedStyle[]).map((name) => ({
      selector: named[name],
      block: resolveNamed(styles, name),
    })),
    ...componentSelectors(scope).map(([kind, selector]) => ({
      selector,
      block: resolveComponent(styles, kind),
    })),
  ];
}

/** The whole sheet for `styles`, scoped to `scope` (one editor). */
export function styleSheet(styles: DocumentStyles | null, scope: string): string {
  const normal = resolveNamed(styles, "normal");
  const css: string[] = [
    // The editor's own size and font: what list markers, empty lines, and `em` measure from.
    `${scope} { font-family: ${fontStack(normal.fontFamily)}; font-size: ${normal.fontSize}pt; line-height: ${normal.lineHeight}; }`,
  ];
  const dark: string[] = [];
  for (const { selector, block } of rules(styles, scope)) {
    const lines = declarations(block);
    const variants = block.color === null ? null : colorVariants(block.color, "ink");
    if (variants) {
      lines.push(`color: ${variants.light}`);
      dark.push(`.dark ${selector} { color: ${variants.dark}; }`);
    }
    css.push(`${selector} { ${lines.join("; ")}; }`);
  }
  if (dark.length) css.push(`@media screen { ${dark.join(" ")} }`);
  return css.join("\n");
}
