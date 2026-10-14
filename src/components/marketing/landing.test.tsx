import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { activeStatuses, revisitAfterDays, unfinishedStatuses } from "@/features/ideas/model";
import { dictionary } from "@/i18n";
import { locales } from "@/i18n/locales";
import { demoToday, demoWorkspace } from "./demo";
import { Landing } from "./landing";

describe("the demonstration workspace", () => {
  it.each(locales)("agrees with itself in %s", (locale) => {
    const workspace = demoWorkspace(locale);
    const sermons = workspace.ideas.filter((idea) => idea.kind === "sermon");
    const active: readonly string[] = activeStatuses;
    const unfinished: readonly string[] = unfinishedStatuses;

    // Continue Working: sermons at Idea or Developing that have been worked on, latest first.
    expect(workspace.continueWorking.length).toBeGreaterThan(0);
    expect(workspace.continueWorking.length).toBeLessThanOrEqual(4);
    for (const { sermon } of workspace.continueWorking) {
      expect(sermon.kind).toBe("sermon");
      expect(active).toContain(sermon.status);
      expect(sermon.lastDevelopedAt).not.toBeNull();
    }
    const worked = workspace.continueWorking.map(({ sermon }) => sermon.lastDevelopedAt!.getTime());
    expect(worked).toEqual([...worked].sort((a, b) => b - a));
    // Every sermon that qualifies is there: none was left out to tidy the picture.
    expect(workspace.continueWorking).toHaveLength(
      sermons.filter((idea) => active.includes(idea.status) && idea.lastDevelopedAt).length,
    );

    // Revisit an Idea: unfinished sermons left alone for the application's own number of days.
    const quiet = demoToday.getTime() - revisitAfterDays * 24 * 60 * 60 * 1000;
    expect(workspace.revisit.length).toBeGreaterThan(0);
    for (const idea of workspace.revisit) {
      expect(idea.kind).toBe("sermon");
      expect(unfinished).toContain(idea.status);
      expect((idea.lastDevelopedAt ?? idea.createdAt).getTime()).toBeLessThanOrEqual(quiet);
    }
    // The two lists are different rules and, here, different sermons.
    const continuing = new Set(workspace.continueWorking.map(({ sermon }) => sermon.id));
    expect(workspace.revisit.some((idea) => continuing.has(idea.id))).toBe(false);

    // The figures are the lists, counted.
    expect(workspace.counts.sermons).toBe(sermons.length);
    expect(workspace.counts.points).toBe(
      workspace.ideas.filter((idea) => idea.kind === "point").length,
    );
    expect(workspace.counts.developing).toBe(
      sermons.filter((idea) => idea.status === "developing").length,
    );
    expect(workspace.timesPreached).toBe(workspace.occasions.length);

    // Only a sermon is preached or outlined, and nothing happens after "today" or before it existed.
    for (const occasion of workspace.occasions) {
      expect(occasion.sermon.kind).toBe("sermon");
      expect(workspace.ideas).toContain(occasion.sermon);
      const preached = new Date(`${occasion.preachedOn}T00:00:00Z`).getTime();
      expect(preached).toBeLessThanOrEqual(demoToday.getTime());
      expect(preached).toBeGreaterThanOrEqual(occasion.sermon.createdAt.getTime());
    }
    expect(workspace.outline.sermon.kind).toBe("sermon");
    for (const idea of workspace.ideas) {
      expect(idea.title).not.toBe("");
      expect(idea.createdAt.getTime()).toBeLessThanOrEqual(idea.updatedAt.getTime());
      expect(idea.updatedAt.getTime()).toBeLessThanOrEqual(demoToday.getTime());
      if (idea.lastDevelopedAt) {
        expect(idea.lastDevelopedAt.getTime()).toBeLessThanOrEqual(idea.updatedAt.getTime());
      }
    }

    // The outline: one introduction, one conclusion, and an entry copied from a point that exists.
    const { entries } = workspace.outline;
    expect(entries.filter((entry) => entry.type === "introduction")).toHaveLength(1);
    expect(entries.filter((entry) => entry.type === "conclusion")).toHaveLength(1);
    const copied = entries.filter((entry) => entry.sourcePointId);
    expect(copied).toHaveLength(1);
    const source = workspace.ideas.find((idea) => idea.id === copied[0].sourcePointId);
    expect(source?.kind).toBe("point");
    expect(copied[0].title).toBe(source?.title);
    expect(workspace.continueWorking[0].entryCount).toBe(entries.length);
  });
});

describe("the landing page", () => {
  it.each(locales)("is written in %s, with one main heading and the way in", (locale) => {
    const t = dictionary(locale, "marketing");
    render(<Landing locale={locale} />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: t.hero.title })).toBeInTheDocument();
    for (const title of [t.how.title, t.features.title, t.mobile.title, t.closing.title]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
    for (const id of ["how-it-works", "features", "mobile-app"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    // Sign in, from the hero and from the closing band, and nothing that asks for an account.
    const signIn = screen.getAllByRole("link", { name: t.hero.signIn });
    expect(signIn).toHaveLength(2);
    for (const link of signIn) expect(link).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: t.hero.how })).toHaveAttribute("href", "#how-it-works");
  });

  it("says something different in Spanish", () => {
    const { container } = render(<Landing locale="es" />);
    expect(container).toHaveTextContent("Del primer pensamiento al sermón terminado.");
    expect(container).toHaveTextContent("Bástate mi gracia");
    expect(container).not.toHaveTextContent("From First Thought to Finished Sermon.");
  });

  it("draws each screen as a picture: hidden, described, and with nothing to focus", () => {
    const t = dictionary("en", "marketing");
    const { container } = render(<Landing locale="en" />);
    const figures = Array.from(container.querySelectorAll("figure"));
    // Two in the hero, five features, and the installed application.
    expect(figures).toHaveLength(8);
    for (const figure of figures) {
      const drawing = figure.querySelector(":scope > [aria-hidden]");
      expect(drawing).not.toBeNull();
      expect(
        drawing!.querySelectorAll("a, button, input, select, textarea, [tabindex], h1, h2, h3"),
      ).toHaveLength(0);
      expect(within(figure).getByText(/\S/, { selector: "figcaption" })).toBeInTheDocument();
    }
    expect(screen.getByText(t.hero.desktopAlt)).toBeInTheDocument();
    expect(screen.getByText(t.hero.mobileAlt)).toBeInTheDocument();
    // The only links on the page are the two ways in and the one way down it.
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
