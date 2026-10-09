import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Logo } from "./logo";
import { LogoMark } from "./logo-mark";

describe("LogoMark", () => {
  it("is decorative unless given a title", () => {
    const { container } = render(<LogoMark />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("exposes an accessible name when titled", () => {
    render(<LogoMark title="Sermon Tracker" variant="mono" />);
    const mark = screen.getByRole("img", { name: "Sermon Tracker" });
    expect(mark).toHaveAttribute("data-variant", "mono");
  });
});

describe("Logo", () => {
  it("renders the wordmark as text beside a decorative mark", () => {
    render(<Logo />);
    expect(screen.getByText("Sermon Tracker")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
