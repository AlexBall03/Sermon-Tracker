import { describe, expect, it } from "vitest";

import { preferredLocale } from "./locales";

describe("the language a browser asks for", () => {
  it("is the first it lists that the interface is written in", () => {
    expect(preferredLocale("es")).toBe("es");
    expect(preferredLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(preferredLocale("en-US,en;q=0.9,es;q=0.8")).toBe("en");
    expect(preferredLocale("fr-FR,fr;q=0.9,es;q=0.5,en;q=0.4")).toBe("es");
  });

  it("goes by weight, not by position", () => {
    expect(preferredLocale("en;q=0.3, es;q=0.9")).toBe("es");
    expect(preferredLocale("es;q=0, en")).toBe("en");
  });

  it("is English when it lists none of them, or nothing", () => {
    expect(preferredLocale("fr,de;q=0.8")).toBe("en");
    expect(preferredLocale("*")).toBe("en");
    expect(preferredLocale("")).toBe("en");
    expect(preferredLocale(null)).toBe("en");
    expect(preferredLocale(undefined)).toBe("en");
  });
});
