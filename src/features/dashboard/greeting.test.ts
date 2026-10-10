import { describe, expect, it } from "vitest";

import { welcomeTitle } from "./greeting";

describe("welcomeTitle", () => {
  it("greets by first name", () => {
    expect(welcomeTitle("Ada")).toBe("Welcome back, Ada");
    expect(welcomeTitle("  Ada ")).toBe("Welcome back, Ada");
  });

  it("is still a greeting without a name", () => {
    for (const missing of [null, undefined, "", "   "]) {
      expect(welcomeTitle(missing)).toBe("Welcome back");
    }
  });
});
