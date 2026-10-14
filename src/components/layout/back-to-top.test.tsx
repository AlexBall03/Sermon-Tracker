import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackToTop, backToTopVisible } from "./back-to-top";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  act(() => void window.dispatchEvent(new Event("scroll")));
}

beforeEach(() => {
  // A long page: ten screens.
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: window.innerHeight * 10,
    configurable: true,
  });
});
afterEach(() => scrollTo(0));

describe("backToTopVisible", () => {
  it("waits for a full screen on a long page", () => {
    expect(backToTopVisible(799, 800, 8000)).toBe(false);
    expect(backToTopVisible(800, 800, 8000)).toBe(true);
  });

  it("shows at the foot of a page too short to scroll a full screen", () => {
    // 1,500 tall in an 800 window: at most 700 to scroll.
    expect(backToTopVisible(500, 800, 1500)).toBe(false);
    expect(backToTopVisible(700, 800, 1500)).toBe(true);
  });

  it("is not changed by overscrolling past either end", () => {
    expect(backToTopVisible(760, 800, 1500)).toBe(true);
    expect(backToTopVisible(-40, 800, 8000)).toBe(false);
  });

  it("never shows on a page with less than half a screen to scroll", () => {
    expect(backToTopVisible(300, 800, 1100)).toBe(false);
    expect(backToTopVisible(900, 800, 1100)).toBe(false);
  });
});

describe("BackToTop", () => {
  it("stays out of the way until the page has scrolled a full screen", () => {
    render(<BackToTop />);
    const button = screen.getByRole("button", { name: "Back to top", hidden: true });
    expect(button).toHaveAttribute("inert");

    scrollTo(window.innerHeight - 1);
    expect(button).toHaveAttribute("inert");

    scrollTo(window.innerHeight + 1);
    expect(button).not.toHaveAttribute("inert");

    scrollTo(0);
    expect(button).toHaveAttribute("inert");
  });

  it("returns to the top of the page", () => {
    const scroll = vi.fn();
    window.scrollTo = scroll;
    render(<BackToTop />);
    scrollTo(window.innerHeight * 2);

    fireEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(scroll).toHaveBeenCalledWith({ top: 0 });
  });
});
