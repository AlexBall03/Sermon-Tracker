import { render, screen } from "@testing-library/react";
import { TriangleAlert } from "lucide-react";
import { describe, expect, it } from "vitest";

import { StatusPage } from "./status-page";

describe("StatusPage", () => {
  it("shows what happened, the ways on, and a reference to quote", () => {
    render(
      <StatusPage
        role="alert"
        icon={TriangleAlert}
        eyebrow="404"
        title="Something went wrong"
        body="Nothing was changed."
        note="Reference: 3f9a21c7"
      >
        <button>Try again</button>
        <a href="/dashboard">Go to Dashboard</a>
      </StatusPage>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    );
    expect(alert).toHaveTextContent("404");
    expect(alert).toHaveTextContent("Nothing was changed.");
    expect(alert).toHaveTextContent("Reference: 3f9a21c7");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("leaves out the code, the reference, and the alert role when given none", () => {
    const { container } = render(
      <StatusPage icon={TriangleAlert} title="Page not found" body="Nothing lives here.">
        <button>Go to home page</button>
      </StatusPage>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    // The body is the only paragraph: no code above the title, no reference below.
    expect(container.querySelectorAll("p")).toHaveLength(1);
  });
});
