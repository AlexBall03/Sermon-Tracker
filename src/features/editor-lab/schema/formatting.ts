import { getStyleProperty, mergeAttributes } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";

import { isFontKey, isFontSize } from "../styles/model";
import { defaultHighlight, highlightPresets, textAlignments, textColorPresets } from "./model";

/*
 * Text color, highlight, and alignment (PS-1B.1 §B.7, Proposed). The three
 * extensions are the approved open-source Tiptap ones, extended so a color is
 * stored only as a preset key or as lowercase `#rrggbb`, never as an arbitrary
 * CSS string. Pasted HTML is the only path that brings foreign values: they
 * are mapped to `#rrggbb` when they can be, and otherwise give no mark.
 *
 * A preset is written to HTML as `data-color` alone; the theme tokens that
 * show it in either theme come with the color controls (PS-1B.2B). A custom
 * color is written as a style and shown exactly as chosen.
 */

const hex6 = /^#[0-9a-f]{6}$/;
const hex3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/;
const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(1|1\.0+|100%)\s*)?\)$/;

/** A custom color as stored: lowercase `#rrggbb`. */
export const isCustomColor = (value: unknown): value is string =>
  typeof value === "string" && hex6.test(value);

/**
 * A color as the document stores it, or null when it is not one: a preset key
 * from `presets`, `#rgb`/`#rrggbb` in any case, or an opaque `rgb()`.
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

/** Whether a stored color is valid for its kind of mark. */
export const validTextColor = (value: unknown) =>
  typeof value === "string" && normalizeColor(value, textColorPresets) === value;
export const validHighlight = (value: unknown) =>
  typeof value === "string" && normalizeColor(value, highlightPresets) === value;

const textColorOf = (element: HTMLElement) =>
  normalizeColor(
    element.getAttribute("data-color") ?? getStyleProperty(element, "color") ?? element.style.color,
    textColorPresets,
  );

const highlightOf = (element: HTMLElement) => {
  const raw =
    element.getAttribute("data-color") ??
    getStyleProperty(element, "background-color") ??
    (element.style.backgroundColor || null);
  // A plain <mark> is a highlight in the default color.
  return raw === null || raw === "" ? defaultHighlight : normalizeColor(raw, highlightPresets);
};

function colorHTML(color: unknown, property: "color" | "background-color") {
  if (typeof color !== "string") return {};
  return isCustomColor(color)
    ? { "data-color": color, style: `${property}: ${color}` }
    : { "data-color": color };
}

/** A font family as stored: a registry key (`styles/model.ts`), read from our own markup only. */
const fontFamilyOf = (element: HTMLElement) => {
  const value = element.getAttribute("data-font-family");
  return isFontKey(value) ? value : null;
};

/** A font size as stored: points, a number, read from our own markup only. */
const fontSizeOf = (element: HTMLElement) => {
  const raw = element.getAttribute("data-font-size");
  const value = raw === null || raw === "" ? Number.NaN : Number(raw);
  return isFontSize(value) ? value : null;
};

/**
 * `textStyle` carries a color, a font family, a font size, or several
 * (schema v3): a span with none of them is not a mark. Foreign fonts and
 * sizes in pasted HTML are mapped in B.2B; until then only our own
 * `data-font-*` attributes are read, and anything else gives no font.
 */
export const LabTextStyle = TextStyle.extend({
  parseHTML() {
    return [
      {
        tag: "span",
        consuming: false,
        getAttrs: (node) => {
          const element = node as HTMLElement;
          return textColorOf(element) || fontFamilyOf(element) || fontSizeOf(element) !== null
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
            renderHTML: (attributes: Record<string, unknown>) =>
              colorHTML(attributes.color, "color"),
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
        renderHTML: (attributes: Record<string, unknown>) =>
          colorHTML(attributes.color, "background-color"),
      },
    };
  },
  parseHTML() {
    // A foreign highlight color that cannot be read gives no mark.
    return [
      { tag: "mark", getAttrs: (element) => (highlightOf(element as HTMLElement) ? {} : false) },
    ];
  },
}).configure({ multicolor: true });

export const LabTextAlign = TextAlign.configure({
  types: ["heading", "paragraph"],
  alignments: [...textAlignments],
  defaultAlignment: null,
});

/**
 * The font family and size of a run of text (schema v3). Kept as `data-`
 * attributes only: nothing is drawn from them until B.2B loads the fonts and
 * styles them, and the stored value is never a CSS string.
 */
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
              isFontKey(attributes.fontFamily) ? { "data-font-family": attributes.fontFamily } : {},
          },
        },
      },
    ];
  },
});

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
                ? { "data-font-size": String(attributes.fontSize) }
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
