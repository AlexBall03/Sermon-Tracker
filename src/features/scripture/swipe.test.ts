import { describe, expect, it } from "vitest";

import { swipeDirection } from "./swipe";

const at = (x: number, y: number, time = 0) => ({ x, y, time });

describe("swipeDirection", () => {
  it("is the next chapter towards the left and the one before towards the right", () => {
    expect(swipeDirection(at(300, 400), at(120, 410, 200))).toBe(1);
    expect(swipeDirection(at(80, 400), at(260, 395, 200))).toBe(-1);
  });

  it("is nothing for a touch that does not travel far enough", () => {
    expect(swipeDirection(at(300, 400), at(250, 400, 100))).toBeNull();
    expect(swipeDirection(at(300, 400), at(300, 400, 100))).toBeNull();
  });

  it("is nothing for a scroll, however far it drifts sideways", () => {
    expect(swipeDirection(at(300, 600), at(220, 200, 200))).toBeNull();
    expect(swipeDirection(at(300, 400), at(200, 340, 200))).toBeNull();
  });

  it("is nothing for a slow drag", () => {
    expect(swipeDirection(at(300, 400), at(100, 400, 900))).toBeNull();
  });
});
