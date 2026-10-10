import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BackToTop } from "./back-to-top";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  act(() => void window.dispatchEvent(new Event("scroll")));
}

afterEach(() => scrollTo(0));

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
