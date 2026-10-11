import type { HighlightColor } from "./model";

/**
 * Each highlight color as the utility that paints it. The tokens are in
 * globals.css, for both themes; nothing else names these hues. Written out in
 * full so the stylesheet is built with all four.
 */
export const highlightBackground: Record<HighlightColor, string> = {
  yellow: "bg-highlight-yellow",
  green: "bg-highlight-green",
  blue: "bg-highlight-blue",
  red: "bg-highlight-red",
};
