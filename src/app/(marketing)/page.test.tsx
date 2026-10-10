import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("landing page", () => {
  it("presents the product name and tagline", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Capture. Develop. Preach." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sermon Tracker")).toBeInTheDocument();
  });

  it("covers the three core capabilities", () => {
    render(<HomePage />);
    for (const name of [
      "Save the idea in seconds",
      "Organise and build over time",
      "Preserve your preaching history",
    ]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
  });

  it("states the beta is invitation-only and labels the preview as illustrative", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "Currently available by invitation" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Illustrative preview of a planned feature/)).toBeInTheDocument();
    expect(screen.queryByText(/sign up|register|get started/i)).not.toBeInTheDocument();
  });

  it("links sign-in actions to /sign-in", () => {
    render(<HomePage />);
    const links = screen.getAllByRole("link", { name: /sign in/i });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/sign-in");
  });
});
