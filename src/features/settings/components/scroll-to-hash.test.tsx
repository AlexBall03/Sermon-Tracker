import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScrollToHash } from "./scroll-to-hash";

let resized: () => void = () => {};
class Observer {
  constructor(callback: () => void) {
    resized = callback;
  }
  observe() {}
  disconnect() {
    resized = () => {};
  }
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  document.body.replaceChildren();
});

describe("ScrollToHash", () => {
  it("brings the part named in the address into view, and keeps it there while the page settles", () => {
    vi.stubGlobal("ResizeObserver", Observer);
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/settings#offline");
    const target = document.createElement("section");
    target.id = "offline";
    target.scrollIntoView = vi.fn();
    document.body.append(target);

    render(<ScrollToHash />);
    act(() => void vi.advanceTimersByTime(20));
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start" });

    // Something above it filled in: it is brought back.
    resized();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);

    // Once the person scrolls, it is left alone.
    window.dispatchEvent(new Event("wheel"));
    resized();
    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
