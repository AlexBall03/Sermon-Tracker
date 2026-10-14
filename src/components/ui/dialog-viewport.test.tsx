import { describe, expect, it } from "vitest";

import { canScrollWithin } from "./dialog-viewport";

/** A box that scrolls vertically, 300 of content in 100, scrolled to `top`. */
function scroller(top: number) {
  const box = document.createElement("div");
  box.style.overflowY = "auto";
  Object.defineProperties(box, {
    scrollHeight: { value: 300 },
    clientHeight: { value: 100 },
    scrollTop: { value: top, writable: true },
  });
  const inner = document.createElement("p");
  box.append(inner);
  document.body.append(box);
  return inner;
}

describe("canScrollWithin", () => {
  it("lets a drag through where it scrolls something that can still scroll that way", () => {
    // Finger moving up scrolls the content down.
    expect(canScrollWithin(scroller(0), 0, -30)).toBe(true);
    expect(canScrollWithin(scroller(100), 0, 30)).toBe(true);
  });

  it("stops a drag at the end of what scrolls, so it never reaches the page behind", () => {
    expect(canScrollWithin(scroller(0), 0, 30)).toBe(false);
    expect(canScrollWithin(scroller(200), 0, -30)).toBe(false);
  });

  it("stops a drag on something that does not scroll at all", () => {
    const plain = document.createElement("button");
    document.body.append(plain);
    expect(canScrollWithin(plain, 0, -30)).toBe(false);
    expect(canScrollWithin(plain, 40, 0)).toBe(false);
  });
});
