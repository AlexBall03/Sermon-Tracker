import { getStyleProperty, mergeAttributes } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";

import { colorVariants, isHex, type ColorKind, type ColorValue } from "../styles/colors";
import { fontFromCss, fontStack, sizeFromCss } from "../styles/font-stack";
import { fillColorSchema, inkColorSchema, isFontKey, isFontSize } from "../styles/model";
import { defaultHighlight, highlightPresets, textAlignments, textColorPresets } from "./model";

/*
 * Text color, highlight, alignment, font, and size (PS-1B.1 §B.7; drawn in
 * PS-1B.2B.2B). The extensions are the approved open-source Tiptap ones,
 * extended so that what is stored is only ever a closed value: a color is a
 * preset key, a lowercase `#rrggbb`, or one of the two color objects
 * (`styles/model.ts`); a font is a registry key; a size is points. Nothing
 * stored is a CSS string: the CSS is built from these values when drawn.
 *
 * Drawing. A color is drawn as its light variant inline (`color` or
 * `background-color`), which is also what printing and another application
 * receive, with the dark variant in a variable the dark theme reads
 * (`lab.css`), so changing the theme changes no document and runs no
 * transaction (`styles/colors.ts`). A font is its stack, a size its points.
 *
 * Reading HTML back. Our own markup is read from its `data-` attributes and
 * checked against the same schemas as the validator. Another application's
 * markup (pasted) is mapped only where it can be: a color to an adaptive
 * `#rrggbb`, a font family to a registry key (`fontFromCss`), a size in pt or
 * px to half points (`sizeFromCss`); anything else gives no mark.
 */

const hex6 = /^#[0-9a-f]{6}$/;
const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/;
const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(1|1\.0+|100%)\s*)?\)$/;

/** A custom color as stored: lowercase `#rrggbb`. */
export const isCustomColor = (value: unknown): value is string =>
  typeof value === "string" && hex6.test(value);

/**
 * A color as the document stores it (adaptive), or null when it is not one: a
 * preset key from `presets`, `#rgb`/`#rrggbb` in any case, or an opaque `rgb()`.
 */
export function normalizeColor(value: unknown, presets: readonly string[]): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (presets.includes(trimmed)) return trimmed;
  if (hex6.test(trimmed)) return trimmed;
  const short = hex3.exec(trimmed);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const channels = rgb.exec(trimmed);
  if (channels) {
    const parts = channels.slice(1, 4).map(Number);
    if (parts.some((part) => part > 255)) return null;
    return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

/** Whether a stored color is valid for its kind of mark, exactly as stored. */
export const validTextColor = (value: unknown) => inkColorSchema.safeParse(value).success;
export const validHighlight = (value: unknown) => fillColorSchema.safeParse(value).success;

/** A color value from our own `data-color*` attributes, or null. */
function ownColor(element: HTMLElement, presets: readonly string[]): ColorValue | null | undefined {
  const raw = element.getAttribute("data-color");
  if (raw === null) return undefined;
  const mode = element.getAttribute("data-color-mode");
  if (mode === "exact") return isHex(raw) ? { mode: "exact", color: raw } : null;
  if (mode === "themed") {
    const dark = element.getAttribute("data-color-dark");
    return isHex(raw) && isHex(dark) ? { mode: "themed", light: raw, dark } : null;
  }
  return normalizeColor(raw, presets);
}

const textColorOf = (element: HTMLElement): ColorValue | null => {
  const own = ownColor(element, textColorPresets);
  if (own !== undefined) return own;
  return normalizeColor(
    getStyleProperty(element, "color") ?? element.style.color,
    textColorPresets,
  );
};

const highlightOf = (element: HTMLElement): ColorValue | null => {
  const own = ownColor(element, highlightPresets);
  if (own !== undefined) return own;
  const raw =
    getStyleProperty(element, "background-color") ?? (element.style.backgroundColor || null);
  // A plain <mark> is a highlight in the default color.
  return raw === null || raw === "" ? defaultHighlight : normalizeColor(raw, highlightPresets);
};

/** The HTML attributes that draw a color, and carry it through copy and paste. */
export function colorHTML(color: unknown, kind: ColorKind): Record<string, string> {
  const schema = kind === "ink" ? inkColorSchema : fillColorSchema;
  if (color === null || color === undefined || !schema.safeParse(color).success) return {};
  const value = color as ColorValue;
  const variants = colorVariants(value, kind);
  if (!variants) return {};
  const data: Record<string, string> =
    typeof value === "string"
      ? { "data-color": value }
      : value.mode === "exact"
        ? { "data-color": value.color, "data-color-mode": "exact" }
        : { "data-color": value.light, "data-color-dark": value.dark, "data-color-mode": "themed" };
  const property = kind === "ink" ? "color" : "background-color";
  const variable = kind === "ink" ? "--ink-d" : "--fill-d";
  return {
    ...data,
    class: kind === "ink" ? "lab-ink" : "lab-fill",
    style: `${property}: ${variants.light}; ${variable}: ${variants.dark}`,
  };
}

/** A font family as stored: a registry key, from our markup or mapped from a foreign one. */
const fontFamilyOf = (element: HTMLElement) => {
  const own = element.getAttribute("data-font-family");
  if (own !== null) return isFontKey(own) ? own : null;
  return fontFromCss(element.style.fontFamily);
};

/** A font size as stored: points, from our markup or mapped from a foreign pt or px size. */
const fontSizeOf = (element: HTMLElement) => {
  const raw = element.getAttribute("data-font-size");
  if (raw !== null) {
    const value = raw === "" ? Number.NaN : Number(raw);
    return isFontSize(value) ? value : null;
  }
  return sizeFromCss(element.style.fontSize);
};

/**
 * `textStyle` carries a color, a font family, a font size, or several
 * (schema v3): a span with none of them is not a mark.
 */
export const LabTextStyle = TextStyle.extend({
  parseHTML() {
    return [
      {
        tag: "span",
        consuming: false,
        getAttrs: (node) => {
          const element = node as HTMLElement;
          return textColorOf(element) !== null ||
            fontFamilyOf(element) !== null ||
            fontSizeOf(element) !== null
            ? {}
            : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

export const LabColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          color: {
            default: null,
            parseHTML: (element: HTMLElement) => textColorOf(element),
            renderHTML: (attributes: Record<string, unknown>) => colorHTML(attributes.color, "ink"),
          },
        },
      },
    ];
  },
});

export const LabHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: defaultHighlight,
        parseHTML: (element: HTMLElement) => highlightOf(element),
        renderHTML: (attributes: Record<string, unknown>) => colorHTML(attributes.color, "fill"),
      },
    };
  },
  parseHTML() {
    // A foreign highlight color that cannot be read gives no mark.
    return [
      {
        tag: "mark",
        getAttrs: (element) => (highlightOf(element as HTMLElement) !== null ? {} : false),
      },
    ];
  },
}).configure({ multicolor: true });

export const LabTextAlign = TextAlign.configure({
  types: ["heading", "paragraph"],
  alignments: [...textAlignments],
  defaultAlignment: null,
});

/** The font family of a run of text: a registry key, drawn as its stack. */
export const LabFontFamily = FontFamily.extend({
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: fontFamilyOf,
            renderHTML: (attributes: Record<string, unknown>) =>
              isFontKey(attributes.fontFamily)
                ? {
                    "data-font-family": attributes.fontFamily,
                    style: `font-family: ${fontStack(attributes.fontFamily)}`,
                  }
                : {},
          },
        },
      },
    ];
  },
});

/** The font size of a run of text, in points. */
export const LabFontSize = FontSize.extend({
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: fontSizeOf,
            renderHTML: (attributes: Record<string, unknown>) =>
              isFontSize(attributes.fontSize)
                ? {
                    "data-font-size": String(attributes.fontSize),
                    style: `font-size: ${attributes.fontSize}pt`,
                  }
                : {},
          },
        },
      },
    ];
  },
});

export const formattingExtensions = [
  LabTextStyle,
  LabColor,
  LabFontFamily,
  LabFontSize,
  LabHighlight,
  LabTextAlign,
];
