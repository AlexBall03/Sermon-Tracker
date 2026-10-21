import { colorVariants, inkOn, type ColorValue } from "./colors";
import { fontStack } from "./font-stack";
import {
  componentKinds,
  type ComponentKind,
  type ComponentStyle,
  type DocumentStyles,
  type NamedStyle,
} from "./model";
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
 * A1-UI.2B.1, `appearanceStyle`) sets the same properties inline on its node,
 * where they win by inheritance with no selector to outrank; its text properties
 * reach its rule through `--ps-<component>-i-*`, which every component rule
 * reads first in a preset that draws components.
 */

type Rule = {
  selector: string;
  block: Omit<ResolvedBlock, "align"> & { align?: string };
  /** Text colors judged on the component's fill, in place of the color's own variants. */
  onFill?: { light: string; dark: string } | null;
  /** A point heading whose number hangs (`Preset.hangingNumbers`): its first line starts a number's width back. */
  hang?: boolean;
  /** The component whose single node's own appearance this rule reads first (`--ps-<name>-i-*`). */
  instance?: string;
  /** Only the text: a container's spacing and indent stay the presentation's. */
  typographyOnly?: boolean;
  /** An introduction's or a conclusion's heading, whose space before is under the section's rule. */
  section?: boolean;
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

/**
 * A single component's own text properties (A1-UI.2B.1), as the custom
 * properties its rule reads first: `--ps-<component>-i-<key>`. Set inline on
 * the component's node (`appearanceStyle`), they reach its own text by
 * inheritance (a note's paragraphs, a passage's verses) with no selector to
 * outrank, and a property left unset falls back to the style's value here.
 */
const instanceKeys = {
  fontFamily: "font",
  fontSize: "size",
  bold: "weight",
  italic: "style",
  underline: "underline",
  lineHeight: "line",
  spaceBefore: "before",
  spaceAfter: "after",
} as const;

/** `name: value` read through an instance property when the rule has one (`prefix`). */
const through = (line: string, prefix: string | undefined, key: string) =>
  prefix ? line.replace(/^([^:]+): (.*)$/, `$1: var(--ps-${prefix}-i-${key}, $2)`) : line;

function declarations(
  block: Rule["block"],
  hang = false,
  prefix?: string,
  typographyOnly = false,
  section = false,
): string[] {
  const lines = [
    through(`font-family: ${fontStack(block.fontFamily)}`, prefix, instanceKeys.fontFamily),
    through(`font-size: ${block.fontSize}pt`, prefix, instanceKeys.fontSize),
    through(`font-weight: ${block.bold ? 700 : 400}`, prefix, instanceKeys.bold),
    through(`font-style: ${block.italic ? "italic" : "normal"}`, prefix, instanceKeys.italic),
    through(
      `text-decoration-line: ${block.underline ? "underline" : "none"}`,
      prefix,
      instanceKeys.underline,
    ),
    through(paragraphCss.lineHeight(block.lineHeight), prefix, instanceKeys.lineHeight),
  ];
  // A container's own place and indent are the presentation's (`lab-v4.css`): only its text is drawn here.
  if (typographyOnly) return lines;
  lines.push(
    through(paragraphCss.spaceBefore(block.spaceBefore), prefix, instanceKeys.spaceBefore),
    through(paragraphCss.spaceAfter(block.spaceAfter), prefix, instanceKeys.spaceAfter),
    // A section's rule stands at the top of its heading's box, lifted by this (`lab-v4.css`).
    ...(section
      ? [through(`--x-space-before: ${block.spaceBefore}pt`, prefix, instanceKeys.spaceBefore)]
      : []),
    paragraphCss.indentLeft(block.indentLeft),
    // A hanging number (`lab-v4.css`, `--x-hang`, set only on a numbered point) takes its column back from the first line.
    hang
      ? `text-indent: calc(${block.indentFirst}pt - var(--x-hang, 0px))`
      : paragraphCss.indentFirst(block.indentFirst),
  );
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
  const hang = preset.hangingNumbers && titled.has(kind);
  if (!preset.componentColors) return { selector, block: resolved, hang };
  const instance = componentNames[kind];
  const typographyOnly = kind === "scripture";
  const section = kind === "introduction" || kind === "conclusion";
  const block = { ...resolved, color: textColorOf(kind, resolved) };
  if (titled.has(kind) || !resolved.fill)
    return { selector, block, hang, instance, typographyOnly, section };
  return {
    selector,
    block,
    onFill: onFill(block.color, resolved.fill),
    instance,
    typographyOnly,
    section,
  };
}

/** A component's text color: a title's is its title color when it has one. */
function textColorOf(kind: ComponentKind, resolved: ResolvedComponent): ColorValue | null {
  return titled.has(kind) && resolved.titleColor !== undefined
    ? resolved.titleColor
    : resolved.color;
}

/** Text judged on a fill, in each theme; null when it cannot be. */
function onFill(color: ColorValue | null, fill: ColorValue) {
  const light = inkOn(color, fill, "light");
  const dark = inkOn(color, fill, "dark");
  return light && dark ? { light, dark } : null;
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
    // A passage's text (A1-UI.2B.1), in a preset that draws components: the baseline never drew one.
    ...(preset.componentColors
      ? [
          componentRule(
            "scripture",
            `${scope} .lab-passage`,
            resolveComponent(styles, "scripture", null, preset),
            preset,
          ),
        ]
      : []),
    ...(Object.keys(named) as NamedStyle[]).map((name) => ({
      selector: pointNamedSelector(scope, name),
      block: resolveNamed(styles, name, null, preset),
      hang: preset.hangingNumbers,
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

/** The treatment parts drawn as properties (A1-UI.2B.1): no dark variant, a line looks the same in either theme. */
const treatmentParts = [
  ["borderStyle", "border-style", ""],
  ["borderWidth", "border-w", "pt"],
  ["accentWidth", "accent-w", "pt"],
  ["radius", "radius", "pt"],
  // A container's space inside and outside it (A1-UI.2B.2).
  ["paddingBlock", "pad-block", "pt"],
  ["paddingInline", "pad-inline", "pt"],
  ["outsideBefore", "out-before", "pt"],
  ["outsideAfter", "out-after", "pt"],
] as const;

/**
 * The declarations of a component's color and treatment parts, for the
 * fields in `only` (every field when left out): `--ps-note-fill: #…`,
 * `--ps-note-fill-d: #…`, `--ps-note-radius: 4pt`. A part left unset gives
 * none, so whatever is drawn beneath (the outline's, the preset's) stays.
 */
export function partDeclarations(
  kind: ComponentKind,
  resolved: ResolvedComponent,
  only?: ReadonlySet<string>,
): string[] {
  const lines: string[] = [];
  const both = (name: string, light: string, dark: string) =>
    lines.push(`${name}: ${light}`, `${name}-d: ${dark}`);
  const prefix = `--ps-${componentNames[kind]}`;
  for (const [field, part, colorKind] of colorParts) {
    if (only && !only.has(field)) continue;
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
  for (const [field, part, unit] of treatmentParts) {
    if (only && !only.has(field)) continue;
    const value = resolved[field];
    if (value !== undefined) lines.push(`${prefix}-${part}: ${value}${unit}`);
  }
  // A container's label in its own face (A1-UI.2B.2): a registry key, drawn as its stack.
  if (resolved.labelFont !== undefined && (!only || only.has("labelFont"))) {
    lines.push(`${prefix}-label-font: ${fontStack(resolved.labelFont)}`);
  }
  // Text on the fill, judged with it: what the container's own words (its label) are drawn in.
  if (resolved.fill && (!only || only.has("fill") || only.has("color"))) {
    const ink = onFill(resolved.color ?? null, resolved.fill);
    if (ink) both(`${prefix}-ink`, ink.light, ink.dark);
  }
  return lines;
}

/**
 * Every component color and treatment the styles set, as custom property
 * declarations on the editor. A part left unset gives none, so the preset's
 * CSS falls back to its own treatment.
 */
export function componentVariables(styles: DocumentStyles | null, preset: Preset): string[] {
  if (!preset.componentColors) return [];
  return componentKinds.flatMap((kind) =>
    partDeclarations(kind, resolveComponent(styles, kind, null, preset)),
  );
}

/**
 * One component's own appearance (level 3, A1-UI.2B.1), as an inline style
 * for its node: the parts it sets (`partDeclarations`) and its own text
 * properties (`--ps-<component>-i-*`, which its rule reads first). `resolved`
 * is the whole cascade with the appearance last, so text on a fill the node
 * chose is judged with the colors it really has. Only what the appearance
 * sets is written: everything else stays inherited, so a later change to
 * the outline's style still reaches the rest of this node.
 */
export function appearanceStyle(
  kind: ComponentKind,
  resolved: ResolvedComponent,
  appearance: ComponentStyle,
): string {
  const set = new Set(Object.keys(appearance));
  const lines = partDeclarations(kind, resolved, set);
  const prefix = `--ps-${componentNames[kind]}-i`;
  const text: Record<keyof typeof instanceKeys, () => string> = {
    fontFamily: () => fontStack(resolved.fontFamily),
    fontSize: () => `${resolved.fontSize}pt`,
    bold: () => (resolved.bold ? "700" : "400"),
    italic: () => (resolved.italic ? "italic" : "normal"),
    underline: () => (resolved.underline ? "underline" : "none"),
    lineHeight: () => String(resolved.lineHeight),
    spaceBefore: () => `${resolved.spaceBefore}pt`,
    spaceAfter: () => `${resolved.spaceAfter}pt`,
  };
  for (const field of Object.keys(instanceKeys) as (keyof typeof instanceKeys)[]) {
    if (set.has(field)) lines.push(`${prefix}-${instanceKeys[field]}: ${text[field]()}`);
  }
  // The text color: a title's own, or the words on the fill this node has.
  if (set.has("color") || set.has("titleColor") || (set.has("fill") && !titled.has(kind))) {
    const color = textColorOf(kind, resolved);
    const variants =
      !titled.has(kind) && resolved.fill
        ? onFill(color, resolved.fill)
        : color === null
          ? { light: "var(--foreground)", dark: "var(--foreground)" }
          : colorVariants(color, "ink");
    if (variants)
      lines.push(`${prefix}-color: ${variants.light}`, `${prefix}-color-d: ${variants.dark}`);
  }
  return lines.join("; ");
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
    // The shared structural face (`Preset.structureFont`); each label reads its own property first.
    ...(preset.structureFont ? [`--ps-structure-font: ${fontStack(preset.structureFont)}`] : []),
    ...componentVariables(styles, preset),
  ];
  const css: string[] = [`${scope} { ${own.join("; ")}; }`];
  const dark: string[] = [];
  // The same rules in the same order, scoped to an editor whose paper is not light.
  const darkSelectors = rules(styles, `${scope}:not([data-paper="light"])`, preset).map(
    (rule) => rule.selector,
  );
  for (const [index, rule] of rules(styles, scope, preset).entries()) {
    const { selector, block, onFill: judged, hang, instance, typographyOnly, section } = rule;
    const lines = declarations(block, hang, instance, typographyOnly, section);
    const variants =
      judged !== undefined
        ? judged
        : block.color === null
          ? null
          : colorVariants(block.color, "ink");
    /*
     * A single node's own color comes first (`appearanceStyle`); then the
     * style's; with neither, the preset's own text color for the component
     * (`--k-<component>-text`, `lab-v4.css`), else the inherited text
     * (`currentColor` on `color` is the parent's).
     */
    const own = (suffix: string, value?: string) =>
      instance
        ? `var(--ps-${instance}-i-color${suffix}, ${value ?? `var(--k-${instance}-text, currentColor)`})`
        : value;
    if (variants || instance) {
      const light = own("", variants?.light);
      const darkColor = own("-d", variants?.dark);
      lines.push(`color: ${light}`);
      dark.push(`.dark ${darkSelectors[index]} { color: ${darkColor}; }`);
    }
    css.push(`${selector} { ${lines.join("; ")}; }`);
  }
  if (dark.length) css.push(`@media screen { ${dark.join(" ")} }`);
  return css.join("\n");
}
