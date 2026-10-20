import { highlightPresets, textColorPresets } from "../schema/model";

/*
 * How a document color is drawn (PS-1B.2B.2B). What the document stores is
 * the person's intent, and it never changes when the theme does; what is
 * drawn is worked out from it here, for each place it can appear:
 *
 *   - `light`: the light theme on screen;
 *   - `dark`: the dark theme on screen;
 *   - `paper`: printing, always on white paper, whatever the screen's theme.
 *
 * A stored color is one of three intents (`styles/model.ts`):
 *
 *   - Adaptive (a preset key or `#rrggbb`, the default): its hue is kept and
 *     its lightness moved only as far as it must go to be read on the
 *     background it is drawn on (WCAG contrast 4.5 for text). A color that
 *     already reads well is drawn exactly as chosen.
 *   - Exact (`{ mode: "exact", color }`): drawn as chosen, everywhere. Never
 *     changed; `contrastWarnings` tells the person when it reads poorly.
 *   - Per theme (`{ mode: "themed", light, dark }`): the person's own color
 *     for each theme, also never changed and also warned about. Paper takes
 *     the light one.
 *
 * Text and its highlight are judged together: `inkOn` adapts a text color
 * to the fill actually behind it (the pair decorations in `pairs.ts`).
 *
 * Everything here is pure and deterministic: the same value gives the same
 * colors, with no DOM and no randomness, so it runs in tests, in the editor,
 * and later for every component color (B.2C) and the print color modes
 * (B.2F: grayscale and black and white derive from `paper`).
 */

export type ExactColor = { mode: "exact"; color: string };
export type ThemedColor = { mode: "themed"; light: string; dark: string };
/** A color as the document stores it. */
export type ColorValue = string | ExactColor | ThemedColor;
export type ColorKind = "ink" | "fill";
export type ColorTarget = "light" | "dark" | "paper";
export type ColorMode = "adaptive" | "exact" | "themed";

/** Where each target draws: the background text sits on, and the theme's own text color. */
export const surfaces: Record<ColorTarget, { background: string; text: string }> = {
  light: { background: "#ffffff", text: "#17181b" },
  dark: { background: "#17191c", text: "#efebe2" },
  paper: { background: "#ffffff", text: "#17181b" },
};

/** The color each preset stands for: its hue and character. Document content, not brand tokens. */
export const inkPresetBase: Record<(typeof textColorPresets)[number], string> = {
  gray: "#6b7280",
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#d97706",
  green: "#16a34a",
  teal: "#0d9488",
  blue: "#2563eb",
  purple: "#9333ea",
  pink: "#db2777",
};

export const fillPresetBase: Record<(typeof highlightPresets)[number], string> = {
  yellow: "#fde047",
  green: "#86efac",
  blue: "#93c5fd",
  pink: "#f9a8d4",
  orange: "#fdba74",
  purple: "#d8b4fe",
  gray: "#d1d5db",
};

/** Text must reach this contrast with what is behind it (WCAG AA, normal text). */
export const minContrast = 4.5;

/**
 * Where an adaptive fill's lightness (OKLCH L) is kept in each theme, and how
 * colorful it may be: pale on white, deep on the dark surface, so the theme's
 * text, and text adapted to it, read on any of them.
 */
const fillBands = {
  light: { min: 0.86, max: 0.96, chroma: 0.14 },
  dark: { min: 0.28, max: 0.36, chroma: 0.09 },
} as const;

const hex6 = /^#[0-9a-f]{6}$/;

/* Conversions: sRGB ↔ linear ↔ OKLab ↔ OKLCH. */

type Rgb = [number, number, number];
type Lch = { l: number; c: number; h: number };

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

function parseHex(hex: string): Rgb {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255) as Rgb;
}

function toHex([r, g, b]: Rgb): string {
  const part = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function toLch(hex: string): Lch {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

/** OKLCH to linear sRGB, unclamped (a channel outside 0–1 is out of gamut). */
function lchToLinear({ l: L, c, h }: Lch): Rgb {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((value) => value >= -1e-4 && value <= 1 + 1e-4);

/** A color at this lightness and hue, its chroma lowered until sRGB can show it. */
function fromLch(lch: Lch): string {
  let { c } = lch;
  let linear = lchToLinear({ ...lch, c });
  if (!inGamut(linear)) {
    let low = 0;
    let high = c;
    for (let step = 0; step < 20; step += 1) {
      const mid = (low + high) / 2;
      if (inGamut(lchToLinear({ ...lch, c: mid }))) low = mid;
      else high = mid;
    }
    c = low;
    linear = lchToLinear({ ...lch, c });
  }
  return toHex(linear.map((value) => fromLinear(Math.min(1, Math.max(0, value)))) as Rgb);
}

/** WCAG 2 relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/* Reading stored values. */

export const isHex = (value: unknown): value is string =>
  typeof value === "string" && hex6.test(value);

export function modeOf(value: ColorValue): ColorMode {
  return typeof value === "string" ? "adaptive" : value.mode;
}

/** The hex an adaptive value stands for: a preset's base, or the custom color itself. */
function baseOf(value: string, kind: ColorKind): string | null {
  if (isHex(value)) return value;
  const table: Record<string, string> = kind === "ink" ? inkPresetBase : fillPresetBase;
  return Object.hasOwn(table, value) ? table[value] : null;
}

/* Adapting. */

/**
 * `ink` moved in lightness, its hue kept, until it reaches `min` contrast
 * with `background`; unchanged if it already does. Darkened on a light
 * background, lightened on a dark one; the nearest lightness that reads is
 * taken, so the color changes as little as it can.
 */
export function readableOn(ink: string, background: string, min = minContrast): string {
  if (contrast(ink, background) >= min) return ink;
  const start = toLch(ink);
  const darken = luminance(background) > 0.18;
  // Search between the color's own lightness and the extreme in that direction.
  let near = start.l;
  let far = darken ? 0 : 1;
  const at = (l: number) => fromLch({ ...start, l });
  if (contrast(at(far), background) < min) return darken ? "#000000" : "#ffffff";
  for (let step = 0; step < 24; step += 1) {
    const mid = (near + far) / 2;
    if (contrast(at(mid), background) >= min) far = mid;
    else near = mid;
  }
  return at(far);
}

/** An adaptive fill kept in the theme's band, with its hue. */
function adaptFill(fill: string, theme: "light" | "dark"): string {
  const band = fillBands[theme];
  const lch = toLch(fill);
  return fromLch({
    l: Math.min(band.max, Math.max(band.min, lch.l)),
    c: Math.min(band.chroma, lch.c),
    h: lch.h,
  });
}

const themeOf = (target: ColorTarget) => (target === "dark" ? "dark" : "light");

/**
 * What a stored color is drawn as on `target`, on that target's own surface.
 * null when the value cannot be read (never for a valid document).
 */
export function renderColor(
  value: ColorValue,
  kind: ColorKind,
  target: ColorTarget,
): string | null {
  if (typeof value !== "string") {
    if (value.mode === "exact") return isHex(value.color) ? value.color : null;
    const chosen = target === "dark" ? value.dark : value.light;
    return isHex(chosen) ? chosen : null;
  }
  const base = baseOf(value, kind);
  if (!base) return null;
  return kind === "ink"
    ? readableOn(base, surfaces[target].background)
    : adaptFill(base, themeOf(target));
}

/** Both screen variants at once; paper is `light`. */
export function colorVariants(value: ColorValue, kind: ColorKind) {
  const light = renderColor(value, kind, "light");
  const dark = renderColor(value, kind, "dark");
  return light && dark ? { light, dark } : null;
}

/**
 * The text color drawn on a fill, both judged together: the text's stored
 * color (null: the theme's text) over the fill as it is drawn on `target`.
 * An adaptive or theme text color is moved until it reads on that fill; an
 * exact or per-theme one is the person's and is drawn as chosen.
 */
export function inkOn(
  ink: ColorValue | null,
  fill: ColorValue,
  target: ColorTarget,
): string | null {
  const behind = renderColor(fill, "fill", target);
  if (!behind) return null;
  if (ink === null) return readableOn(surfaces[target].text, behind);
  if (typeof ink !== "string") return renderColor(ink, "ink", target);
  const base = baseOf(ink, "ink");
  return base ? readableOn(base, behind) : null;
}

/**
 * Where a color the person fixed (exact or per theme) reads poorly: the
 * targets on which, as text, it falls short of `minContrast` on its surface.
 * Nothing is changed; the color controls show it. Adaptive colors never
 * appear here, since they are adapted instead.
 */
export function contrastWarnings(value: ColorValue, kind: ColorKind): ColorTarget[] {
  if (typeof value === "string") return [];
  return (["light", "dark"] as const).filter((target) => {
    const drawn = renderColor(value, kind, target);
    if (!drawn) return false;
    const { background, text } = surfaces[target];
    return kind === "ink"
      ? contrast(drawn, background) < minContrast
      : contrast(text, drawn) < minContrast &&
          contrast(readableOn(text, drawn), drawn) < minContrast;
  });
}
