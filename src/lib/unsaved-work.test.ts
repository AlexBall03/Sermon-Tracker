import { describe, expect, it } from "vitest";

import { hasUnsavedWork, holdUnsavedWork, releaseUnsavedWork } from "./unsaved-work";

describe("unsaved work", () => {
  it("is held until every holder lets go", () => {
    const a = {};
    const b = {};
    expect(hasUnsavedWork()).toBe(false);
    holdUnsavedWork(a);
    holdUnsavedWork(a);
    holdUnsavedWork(b);
    releaseUnsavedWork(a);
    expect(hasUnsavedWork()).toBe(true);
    releaseUnsavedWork(b);
    releaseUnsavedWork(b);
    expect(hasUnsavedWork()).toBe(false);
  });
});
