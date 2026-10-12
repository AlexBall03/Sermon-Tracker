import { describe, expect, it } from "vitest";

import { invert, lockScrolling, mapScroll, verseAnchors } from "./scroll-lock";

describe("matching two panes on one chapter", () => {
  // The second text runs longer: its verses sit further down, and it scrolls further.
  const anchors = verseAnchors(
    new Map([
      [1, 100],
      [2, 200],
      [3, 300],
    ]),
    new Map([
      [1, 100],
      [2, 300],
      [3, 500],
    ]),
    400,
    700,
  );

  it("puts the same verse at the head of both, and their tops and feet together", () => {
    expect(mapScroll(anchors, 0)).toBe(0);
    expect(mapScroll(anchors, 200)).toBe(300);
    expect(mapScroll(anchors, 400)).toBe(700);
    expect(mapScroll(anchors, 9999)).toBe(700);
  });

  it("is as far between two verses in one as in the other, and reads back the same", () => {
    expect(mapScroll(anchors, 250)).toBe(400);
    expect(mapScroll(invert(anchors), 400)).toBe(250);
  });

  it("leaves out a verse the other lacks, one out of order, and one past the foot", () => {
    const tops = new Map([
      [1, 100],
      [2, 50],
      [3, 300],
      [4, 900],
    ]);
    const others = new Map([
      [1, 100],
      [2, 200],
      [4, 400],
    ]);
    expect(verseAnchors(tops, others, 500, 500)).toEqual([
      [0, 0],
      [100, 100],
      [500, 500],
    ]);
  });
});

describe("locking two panes on different chapters", () => {
  function pane(top: number) {
    const element = document.createElement("div");
    Object.defineProperty(element, "scrollHeight", { value: 2000 });
    Object.defineProperty(element, "clientHeight", { value: 500 });
    element.scrollTop = top;
    document.body.append(element);
    return element;
  }
  const scroll = (element: HTMLElement, top: number) => {
    element.scrollTop = top;
    element.dispatchEvent(new Event("scroll"));
  };

  it("moves the other by the same amount, and not at all once it is let go", () => {
    const [first, second] = [pane(100), pane(300)];
    const stop = lockScrolling(first, second, { sameChapter: false });
    scroll(first, 250);
    expect(second.scrollTop).toBe(450);
    // The other pane's own report of having been moved is not answered.
    second.dispatchEvent(new Event("scroll"));
    expect(first.scrollTop).toBe(250);

    stop();
    scroll(first, 600);
    expect(second.scrollTop).toBe(450);
  });
});
