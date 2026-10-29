import { describe, expect, it } from "vitest";

import { conversionEnabled } from "./rollout";

describe("conversionEnabled", () => {
  it("is on only when set to exactly 'on'", () => {
    expect(conversionEnabled("on", "production")).toBe(true);
    for (const value of ["off", "On", "ON", "true", "1", "yes", " on"]) {
      expect(conversionEnabled(value, "production")).toBe(false);
      expect(conversionEnabled(value, "development")).toBe(false);
    }
  });

  it("is on by itself only in local development", () => {
    expect(conversionEnabled(undefined, "development")).toBe(true);
    expect(conversionEnabled("", "development")).toBe(true);
    expect(conversionEnabled(undefined, "production")).toBe(false);
    expect(conversionEnabled(undefined, "test")).toBe(false);
    expect(conversionEnabled(undefined, undefined)).toBe(false);
  });
});
