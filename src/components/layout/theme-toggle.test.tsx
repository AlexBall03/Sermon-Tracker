import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("offers Light, Dark, and System as a labelled radio group", () => {
    render(<ThemeToggle />);
    const group = screen.getByRole("radiogroup", { name: "Colour theme" });
    expect(group).toBeInTheDocument();
    for (const name of ["Light", "Dark", "System"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
  });
});
