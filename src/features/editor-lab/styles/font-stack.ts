import { fontRegistry, isFontKey, type FontCategory, type FontKey } from "./model";

/*
 * The CSS that draws a registry font (PS-1B.2B.2B): its `next/font` variable
 * (`fonts.ts`, defined on the lab's workspace) and then a fallback for while
 * it loads, offline before it was ever fetched, or wherever the variable is
 * not defined (a paste into another application). A family made to match a
 * common system font's metrics names that font first, so its lines break
 * the same while it loads. Built only from registry keys, never from a
 * stored string.
 */

const fallbacks: Record<FontCategory, string> = {
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  sans: 'ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace',
  display: 'ui-serif, Georgia, "Times New Roman", serif',
};

export function fontStack(key: FontKey): string {
  const family = fontRegistry[key];
  const metric = "metricFor" in family ? `"${family.metricFor}", ` : "";
  return `var(--lab-font-${key}, "${family.name}"), ${metric}${fallbacks[family.category]}`;
}

/* Pasted HTML (another application's markup). */

const byName = new Map<string, FontKey>();
for (const key of Object.keys(fontRegistry) as FontKey[]) {
  const family = fontRegistry[key];
  byName.set(family.name.toLowerCase(), key);
  if ("metricFor" in family) byName.set(family.metricFor.toLowerCase(), key);
}

/**
 * A foreign `font-family` list mapped to a registry key: the first name in it
 * that is a registry family, or a system font a registry family matches
 * (Times New Roman → Tinos, Arial → Arimo, Courier New → Cousine). Anything
 * else (a generic family, an unknown font, a value that is not a list of
 * names) gives null, and the text keeps the document's font.
 */
export function fontFromCss(value: string | null | undefined): FontKey | null {
  if (!value) return null;
  for (const raw of value.split(",")) {
    const name = raw
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim()
      .toLowerCase();
    if (!name) continue;
    const key = byName.get(name);
    if (key) return key;
    if (isFontKey(name)) return name;
  }
  return null;
}

/**
 * A foreign `font-size` in points: `pt` as written, `px` at 96 per inch;
 * rounded to the half point; null for anything else (keywords, `em`, `%`) or
 * outside 4–144.
 */
export function sizeFromCss(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(pt|px)\s*$/i.exec(value);
  if (!match) return null;
  const points = match[2].toLowerCase() === "pt" ? Number(match[1]) : Number(match[1]) * 0.75;
  const rounded = Math.round(points * 2) / 2;
  return rounded >= 4 && rounded <= 144 ? rounded : null;
}
