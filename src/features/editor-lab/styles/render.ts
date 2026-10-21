import { colorVariants, inkOn, type ColorValue } from "./colors";
import { fontStack } from "./font-stack";
import { componentKinds, type ComponentKind, type DocumentStyles, type NamedStyle } from "./model";
import { paragraphCss } from "./paragraph-css";
import { presets, type Preset } from "./presets";
import {
  resolveComponent,
  resolveNamed,
  type ResolvedBlock,
  type ResolvedComponent,
} from "./resolve";

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
 * theme on screen only, so printing always draws the paper colors. Light
 * paper (`data-paper="light"`, `v4/paper.ts`) is left out of the dark rules:
 * it shows the light variants in either theme. A style
 * whose color is null sets none: its text is the theme's, or what its
 * container gives.
 *
 * Component colors (A1-UI.1), for a preset that draws them (Balanced): a
 * component's fill, border, accent, and its label, notation, and reference
 * colors become custom properties on the editor: `--ps-<component>-<part>`
 * for the light theme and paper, `--ps-<component>-<part>-d` for the dark
 * theme on screen (`componentVariables`). The preset's CSS reads them and
 * falls back to its own tokens. Three cases stay apart:
 *
 *   - unset (no property): the preset's own treatment;
 *   - turned off (`null`): a fill, border, or accent is `transparent`; a text
 *     color is the theme's text;
 *   - a color: drawn in its variant for each theme (`colors.ts`).
 *
 * Text on a component's fill is judged with the fill (`inkOn`), as text on a
 * highlight is, so a note given a fill stays readable in both themes. A
 * title color is its title's text color. A single node's appearance (level 3,
 * A1-UI.2) is to set the same properties inline on the node, where they win
 * by inheritance with no selector to outrank.
 */

type Rule = {
  selector: string;
  block: Omit<ResolvedBlock, "align"> & { align?: string };
  /** Text colors judged on the component's fill, in place of the color's own variants. */
  onFill?: { light: string; dark: string } | null;
};

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
  // The experimental schema v4 (`v4/schema.ts`): a point is one flat heading, its kind read from
  // its depth and role. A v3 document has none, so these match nothing there.
  ["point", `${scope} p.lab-v4-point[data-depth="1"]:not([data-role])`],
  ["subpoint", `${scope} p.lab-v4-point:not([data-depth="1"])`],
  ["introduction", `${scope} p.lab-v4-point[data-role="introduction"]`],
  ["conclusion", `${scope} p.lab-v4-point[data-role="conclusion"]`],
];

/**
 * A v4 point heading given a named style looks like that style, over its
 * component's (it stays a point). As specific as the component rules and later, so it wins.
 */
const pointNamedSelector = (scope: string, name: NamedStyle) =>
  `${scope} p.lab-v4-point[data-depth][data-style-name="${name}"]`;

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

const titled = new Set<ComponentKind>(["introduction", "conclusion", "point", "subpoint"]);

/** A component's text rule: a title in its title color; a note's or script's text judged on its fill. */
function componentRule(
  kind: ComponentKind,
  selector: string,
  resolved: ResolvedComponent,
  preset: Preset,
): Rule {
  if (!preset.componentColors) return { selector, block: resolved };
  const { titleColor, fill, ...rest } = resolved;
  const color = titled.has(kind) && titleColor !== undefined ? titleColor : rest.color;
  const block = { ...rest, color };
  if (titled.has(kind) || !fill) return { selector, block };
  const light = inkOn(color, fill, "light");
  const dark = inkOn(color, fill, "dark");
  return { selector, block, onFill: light && dark ? { light, dark } : null };
}

/** The rules of a sheet: the editor's own text, then named styles, then components. */
function rules(styles: DocumentStyles | null, scope: string, preset: Preset): Rule[] {
  const named = namedSelectors(scope);
  return [
    ...(Object.keys(named) as NamedStyle[]).map((name) => ({
      selector: named[name],
      block: resolveNamed(styles, name, null, preset),
    })),
    ...componentSelectors(scope).map(([kind, selector]) =>
      componentRule(kind, selector, resolveComponent(styles, kind, null, preset), preset),
    ),
    ...(Object.keys(named) as NamedStyle[]).map((name) => ({
      selector: pointNamedSelector(scope, name),
      block: resolveNamed(styles, name, null, preset),
    })),
  ];
}

/** How each component is named in its custom properties. */
export const componentNames: Record<ComponentKind, string> = {
  introduction: "intro",
  conclusion: "concl",
  point: "point",
  subpoint: "subpoint",
  scripture: "scripture",
  preacherNote: "note",
  script: "script",
};

/** The color parts drawn as properties: the style's field, its name, and whether it is a fill. */
const colorParts = [
  ["notationColor", "notation", "ink"],
  ["referenceColor", "reference", "ink"],
  ["labelColor", "label", "ink"],
  ["border", "border", "ink"],
  ["accent", "accent", "ink"],
  ["fill", "fill", "fill"],
] as const;

/**
 * Every component color the styles set, as custom property declarations
 * (`--ps-note-fill: #…`, `--ps-note-fill-d: #…`). A part left unset gives
 * none, so the preset's CSS falls back to its own treatment.
 */
export function componentVariables(styles: DocumentStyles | null, preset: Preset): string[] {
  if (!preset.componentColors) return [];
  const lines: string[] = [];
  const both = (name: string, light: string, dark: string) =>
    lines.push(`${name}: ${light}`, `${name}-d: ${dark}`);
  for (const kind of componentKinds) {
    const resolved = resolveComponent(styles, kind, null, preset);
    const prefix = `--ps-${componentNames[kind]}`;
    for (const [field, part, colorKind] of colorParts) {
      const value = resolved[field] as ColorValue | null | undefined;
      if (value === undefined) continue;
      if (value === null) {
        // Off: no fill, no border, no accent; a text color back to the theme's.
        const drawn =
          colorKind === "fill" || part === "border" || part === "accent"
            ? "transparent"
            : "var(--foreground)";
        both(`${prefix}-${part}`, drawn, drawn);
        continue;
      }
      const variants = colorVariants(value, colorKind);
      if (variants) both(`${prefix}-${part}`, variants.light, variants.dark);
    }
    // Text on the fill, judged with it: what the container's own words (its label) are drawn in.
    if (resolved.fill) {
      const light = inkOn(resolved.color, resolved.fill, "light");
      const dark = inkOn(resolved.color, resolved.fill, "dark");
      if (light && dark) both(`${prefix}-ink`, light, dark);
    }
  }
  return lines;
}

/** The whole sheet for `styles`, scoped to `scope` (one editor), under `preset`. */
export function styleSheet(
  styles: DocumentStyles | null,
  scope: string,
  preset: Preset = presets.baseline,
): string {
  const normal = resolveNamed(styles, "normal", null, preset);
  const own = [
    // The editor's own size and font: what list markers, empty lines, and `em` measure from.
    `font-family: ${fontStack(normal.fontFamily)}`,
    `font-size: ${normal.fontSize}pt`,
    `line-height: ${normal.lineHeight}`,
    ...componentVariables(styles, preset),
  ];
  const css: string[] = [`${scope} { ${own.join("; ")}; }`];
  const dark: string[] = [];
  // The same rules in the same order, scoped to an editor whose paper is not light.
  const darkSelectors = rules(styles, `${scope}:not([data-paper="light"])`, preset).map(
    (rule) => rule.selector,
  );
  for (const [index, { selector, block, onFill }] of rules(styles, scope, preset).entries()) {
    const lines = declarations(block);
    const variants =
      onFill !== undefined
        ? onFill
        : block.color === null
          ? null
          : colorVariants(block.color, "ink");
    if (variants) {
      lines.push(`color: ${variants.light}`);
      dark.push(`.dark ${darkSelectors[index]} { color: ${variants.dark}; }`);
    }
    css.push(`${selector} { ${lines.join("; ")}; }`);
  }
  if (dark.length) css.push(`@media screen { ${dark.join(" ")} }`);
  return css.join("\n");
}
