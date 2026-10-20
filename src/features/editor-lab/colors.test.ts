import { describe, expect, it } from "vitest";

import { highlightPresets, textColorPresets } from "./schema/model";
import {
  colorVariants,
  contrast,
  contrastWarnings,
  fillPresetBase,
  inkOn,
  inkPresetBase,
  minContrast,
  readableOn,
  renderColor,
  surfaces,
  type ColorValue,
} from "./styles/colors";
import { fillColorSchema, inkColorSchema } from "./styles/model";

/*
 * Adaptive colors (PS-1B.2B.2B): what a stored color is drawn as in the
 * light theme, the dark theme, and print, and the widened color contract.
 */

const hue = (hex: string) => {
  // Hue angle in degrees from sRGB, enough to tell whether a color kept its character.
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("adaptive colors", () => {
  it("draws every text preset readably in each theme and in print, keeping its hue", () => {
    for (const preset of textColorPresets) {
      for (const target of ["light", "dark", "paper"] as const) {
        const drawn = renderColor(preset, "ink", target)!;
        expect(
          contrast(drawn, surfaces[target].background),
          `${preset} ${target}`,
        ).toBeGreaterThanOrEqual(minContrast);
        const base = hue(inkPresetBase[preset]);
        const shown = hue(drawn);
        if (base !== null && shown !== null && preset !== "gray") {
          expect(hueDistance(base, shown), `${preset} ${target} hue`).toBeLessThan(25);
        }
      }
    }
  });

  it("leaves a color that already reads well exactly as chosen", () => {
    expect(renderColor("#1e3a8a", "ink", "light")).toBe("#1e3a8a");
    expect(renderColor("#fde68a", "ink", "dark")).toBe("#fde68a");
    // And only moves it as far as it must: just past the minimum.
    const lightened = renderColor("#1e3a8a", "ink", "dark")!;
    expect(contrast(lightened, surfaces.dark.background)).toBeGreaterThanOrEqual(minContrast);
    expect(contrast(lightened, surfaces.dark.background)).toBeLessThan(minContrast + 0.3);
  });

  it("prints on paper with the light variants, whatever the screen's theme", () => {
    for (const value of [
      "red",
      "#1e3a8a",
      { mode: "themed", light: "#7c2d12", dark: "#fdba74" },
    ] as ColorValue[]) {
      expect(renderColor(value, "ink", "paper")).toBe(renderColor(value, "ink", "light"));
    }
    expect(renderColor("yellow", "fill", "paper")).toBe(renderColor("yellow", "fill", "light"));
  });

  it("keeps fills pale on white and deep on the dark surface", () => {
    for (const preset of highlightPresets) {
      const light = renderColor(preset, "fill", "light")!;
      const dark = renderColor(preset, "fill", "dark")!;
      expect(contrast(surfaces.light.text, light), preset).toBeGreaterThanOrEqual(minContrast);
      expect(contrast(surfaces.dark.text, dark), preset).toBeGreaterThanOrEqual(minContrast);
      const base = hue(fillPresetBase[preset]);
      if (base !== null && preset !== "gray")
        expect(hueDistance(base, hue(dark)!)).toBeLessThan(30);
    }
  });

  it("judges text and its highlight together: every text preset on every highlight, in both themes", () => {
    for (const ink of [null, ...textColorPresets]) {
      for (const fill of highlightPresets) {
        for (const target of ["light", "dark"] as const) {
          const behind = renderColor(fill, "fill", target)!;
          const drawn = inkOn(ink, fill, target)!;
          expect(contrast(drawn, behind), `${ink} on ${fill} (${target})`).toBeGreaterThanOrEqual(
            minContrast,
          );
        }
      }
    }
  });

  it("adapts text to a custom highlight, even a dark exact one", () => {
    const fill: ColorValue = { mode: "exact", color: "#1e3a8a" };
    for (const target of ["light", "dark"] as const) {
      expect(contrast(inkOn(null, fill, target)!, "#1e3a8a")).toBeGreaterThanOrEqual(minContrast);
      expect(contrast(inkOn("red", fill, target)!, "#1e3a8a")).toBeGreaterThanOrEqual(minContrast);
    }
  });

  it("never changes an exact or per-theme color, and warns where it reads poorly", () => {
    const exact: ColorValue = { mode: "exact", color: "#1e3a8a" };
    expect(colorVariants(exact, "ink")).toEqual({ light: "#1e3a8a", dark: "#1e3a8a" });
    expect(inkOn(exact, "yellow", "dark")).toBe("#1e3a8a");
    expect(contrastWarnings(exact, "ink")).toEqual(["dark"]);
    const themed: ColorValue = { mode: "themed", light: "#7c2d12", dark: "#fdba74" };
    expect(colorVariants(themed, "ink")).toEqual({ light: "#7c2d12", dark: "#fdba74" });
    expect(contrastWarnings(themed, "ink")).toEqual([]);
    expect(contrastWarnings({ mode: "themed", light: "#ffff00", dark: "#000000" }, "ink")).toEqual([
      "light",
      "dark",
    ]);
    // Adaptive colors are adapted, never warned about.
    expect(contrastWarnings("#ffff00", "ink")).toEqual([]);
  });

  it("is deterministic and stays in sRGB", () => {
    for (const value of ["#00ff00", "#ff00ff", "#0000ff", "#ffffff", "#000000", "#808080"]) {
      const once = colorVariants(value, "ink");
      expect(colorVariants(value, "ink")).toEqual(once);
      expect(once!.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(once!.dark).toMatch(/^#[0-9a-f]{6}$/);
      expect(colorVariants(value, "fill")!.dark).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(readableOn("#ffffff", "#ffffff")).not.toBe("#ffffff");
  });
});

describe("the widened color contract (schema v3)", () => {
  it("accepts the three intents and nothing else", () => {
    const ok = (schema: typeof inkColorSchema, value: unknown) => schema.safeParse(value).success;
    expect(ok(inkColorSchema, "red")).toBe(true);
    expect(ok(inkColorSchema, "#1e3a8a")).toBe(true);
    expect(ok(inkColorSchema, { mode: "exact", color: "#1e3a8a" })).toBe(true);
    expect(ok(inkColorSchema, { mode: "themed", light: "#1e3a8a", dark: "#93c5fd" })).toBe(true);
    expect(ok(fillColorSchema, { mode: "exact", color: "#fde047" })).toBe(true);

    expect(ok(inkColorSchema, "yellow")).toBe(false);
    expect(ok(inkColorSchema, "#1E3A8A")).toBe(false);
    expect(ok(inkColorSchema, { mode: "exact", color: "red" })).toBe(false);
    expect(ok(inkColorSchema, { mode: "exact", color: "#1e3a8a", extra: 1 })).toBe(false);
    expect(ok(inkColorSchema, { mode: "themed", light: "#1e3a8a" })).toBe(false);
    expect(ok(inkColorSchema, { mode: "adaptive", color: "#1e3a8a" })).toBe(false);
    expect(ok(inkColorSchema, "var(--x)")).toBe(false);
  });
});
