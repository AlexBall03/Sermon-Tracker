import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Only an archived idea's Restore button reaches these.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../../actions", () => ({ restoreIdea: vi.fn() }));

import type { IdeaWithReferences } from "../../ideas";
import { defaultLibraryQuery, type LibraryQuery } from "../../library-query";
import { IdeaResults } from "./idea-results";
import { Pagination, pageWindow } from "./pagination";

const query = (fields: Partial<LibraryQuery> = {}): LibraryQuery => ({
  ...defaultLibraryQuery,
  ...fields,
});

const id = "11111111-1111-4111-8111-111111111111";
const idea = (fields: Partial<IdeaWithReferences> = {}): IdeaWithReferences => ({
  id,
  ownerId: "owner-1",
  kind: "sermon",
  title: "His Grace is Sufficient",
  notes: "Paul's thorn.",
  status: "developing",
  intendedFormat: "unspecified",
  sermonType: "expository",
  archivedAt: null,
  lastDevelopedAt: null,
  subject: "Grace",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  references: [
    {
      book: 19,
      chapterStart: 23,
      verseStart: null,
      chapterEnd: null,
      verseEnd: null,
      isPrimary: false,
    },
    { book: 47, chapterStart: 12, verseStart: 7, chapterEnd: null, verseEnd: 10, isPrimary: true },
  ],
  tags: [
    { id: "t1", name: "Faith" },
    { id: "t2", name: "Prayer" },
  ],
  ...fields,
});

describe("IdeaResults", () => {
  it("says when an idea was last worked on while a revisiting filter is in force", () => {
    const ideas = [
      idea(),
      idea({
        id: "22222222-2222-4222-8222-222222222222",
        title: "Developed once",
        lastDevelopedAt: new Date("2026-08-03T10:00:00Z"),
      }),
    ];
    const { unmount } = render(
      <IdeaResults ideas={ideas} label="Your ideas" query={query({ revisit: "attention" })} />,
    );
    const [never, developed] = screen
      .getAllByRole("listitem")
      .filter((item) => item.querySelector("h3"));
    expect(never).toHaveTextContent(/Never developed.*created Oct 1, 2026/);
    expect(never).not.toHaveTextContent("Updated");
    expect(developed).toHaveTextContent("Last developed Aug 3, 2026");
    unmount();

    // In Spanish, and with no such filter the date is the last change, as before.
    render(
      <IdeaResults
        ideas={ideas}
        label="Tus ideas"
        query={query({ revisit: "never" })}
        locale="es"
      />,
    );
    expect(screen.getByText(/Nunca desarrollada/)).toBeVisible();
    expect(screen.getByText(/Último desarrollo el/)).toBeVisible();
  });

  it("shows what a sermon has: kind, type, status, subject, notes, references, tags, date", () => {
    render(<IdeaResults ideas={[idea()]} label="Your ideas" query={query()} />);
    const [card] = within(screen.getByRole("list", { name: "Your ideas" })).getAllByRole(
      "listitem",
    );
    expect(within(card).getByRole("heading", { name: "His Grace is Sufficient" })).toBeVisible();
    expect(card).toHaveTextContent("Sermon idea");
    expect(card).toHaveTextContent("Sermon type: Expository");
    expect(card).toHaveTextContent("Status: Developing");
    expect(card).toHaveTextContent("Grace");
    expect(card).toHaveTextContent("Paul's thorn.");
    expect(card).toHaveTextContent("Updated Oct 2, 2026");
    // The main text leads.
    expect(
      within(card)
        .getAllByRole("button", { name: /preview the passage/ })
        .map((chip) => chip.textContent),
    ).toEqual(["2 Corinthians 12:7–10", "Psalm 23"]);
    expect(
      within(within(card).getByRole("list", { name: "Tags" }))
        .getAllByRole("listitem")
        .map((tag) => tag.textContent),
    ).toEqual(["Faith", "Prayer"]);
  });

  it("names a sermon's format beside its type, and marks an archived idea apart from its status", () => {
    render(
      <IdeaResults
        ideas={[
          idea({ intendedFormat: "mini", status: "ready", archivedAt: new Date(0) }),
          idea({ id: "22222222-2222-4222-8222-222222222222", title: "Still active" }),
        ]}
        label="Your ideas"
        query={query({ archive: "all" })}
      />,
    );
    const [archived, active] = within(
      screen.getByRole("list", { name: "Your ideas" }),
    ).getAllByRole("listitem");
    expect(archived).toHaveTextContent("Sermon type: Expository");
    expect(archived).toHaveTextContent("Intended format: Mini");
    expect(archived).toHaveTextContent("Archived");
    // Archived, and Ready still.
    expect(archived).toHaveTextContent("Status: Ready");
    expect(
      within(archived).getByRole("button", { name: "Restore His Grace is Sufficient" }),
    ).toBeVisible();

    expect(active).not.toHaveTextContent("Archived");
    expect(active).not.toHaveTextContent("Intended format");
    expect(within(active).queryByRole("button", { name: /^Restore/ })).not.toBeInTheDocument();
  });

  it("shows nothing of a sermon's on a point, even where the record kept it", () => {
    render(
      <IdeaResults
        ideas={[idea({ kind: "point", notes: null, references: [], tags: [] })]}
        label="Your ideas"
        query={query()}
      />,
    );
    const card = screen.getByRole("listitem");
    expect(card).toHaveTextContent("Point idea");
    expect(card).not.toHaveTextContent("Expository");
    expect(card).not.toHaveTextContent("Sermon type");
    expect(within(card).queryByText("Grace")).not.toBeInTheDocument();
    // No empty rows for what it does not have.
    expect(within(card).queryByRole("list", { name: "Tags" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the first few references and tags and counts the rest", () => {
    const reference = (chapterStart: number) => ({
      book: 19,
      chapterStart,
      verseStart: null,
      chapterEnd: null,
      verseEnd: null,
      isPrimary: false,
    });
    render(
      <IdeaResults
        ideas={[
          idea({
            references: [1, 2, 3, 4, 5].map(reference),
            tags: ["A", "B", "C", "D", "E", "F"].map((name) => ({ id: name, name })),
          }),
        ]}
        label="Your ideas"
        query={query()}
      />,
    );
    expect(screen.getAllByRole("button", { name: /preview the passage/ })).toHaveLength(3);
    expect(screen.getByText("and 2 more")).toBeVisible();
    const tags = within(screen.getByRole("list", { name: "Tags" })).getAllByRole("listitem");
    expect(tags.map((tag) => tag.textContent)).toEqual(["A", "B", "C", "D", "+2 more"]);
  });

  it("links each idea with the way back to this library", () => {
    const from = query({ q: "grace", kinds: ["sermon"], page: 2 });
    const { unmount } = render(<IdeaResults ideas={[idea()]} label="Your ideas" query={from} />);
    const href = screen.getByRole("link", { name: "His Grace is Sufficient" }).getAttribute("href");
    const url = new URL(href ?? "", "https://example.test");
    expect(url.pathname).toBe(`/library/${id}`);
    expect(url.searchParams.get("from")).toBe("q=grace&kind=sermon&page=2");
    unmount();

    // From the plain library there is nothing to remember.
    render(<IdeaResults ideas={[idea()]} label="Your ideas" query={query()} />);
    expect(screen.getByRole("link", { name: "His Grace is Sufficient" })).toHaveAttribute(
      "href",
      `/library/${id}`,
    );
  });
});

describe("pageWindow", () => {
  it("lists every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the ends and the neighbours, and marks what it leaves out", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, "gap", 20]);
    expect(pageWindow(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 19, 20]);
  });

  it("shows a single missing page instead of a gap", () => {
    expect(pageWindow(3, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
    expect(pageWindow(4, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(pageWindow(17, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });

  it("stays short however many pages there are", () => {
    for (const total of [50, 500, 100000]) {
      for (const page of [1, 2, Math.ceil(total / 2), total - 1, total]) {
        expect(pageWindow(page, total).length).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe("Pagination", () => {
  const pages = () => screen.getByRole("navigation", { name: "Library pages" });

  it("is absent when everything fits on one page", () => {
    const { container } = render(<Pagination query={query()} page={1} totalPages={1} />);
    expect(container).toBeEmptyDOMElement();
    render(<Pagination query={query()} page={1} totalPages={0} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("links every page to the same query with only the page changed", () => {
    const at = query({ q: "grace", kinds: ["sermon"], sort: "title-asc", page: 2 });
    render(<Pagination query={at} page={2} totalPages={5} />);
    const base = "/library/sermon-ideas?q=grace&kind=sermon&sort=title-asc";
    // Page 1 is the address without a page.
    expect(within(pages()).getByRole("link", { name: "Previous" })).toHaveAttribute("href", base);
    expect(within(pages()).getByRole("link", { name: "Page 1" })).toHaveAttribute("href", base);
    expect(within(pages()).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      `${base}&page=3`,
    );
    expect(within(pages()).getByRole("link", { name: "Page 5" })).toHaveAttribute(
      "href",
      `${base}&page=5`,
    );
    // The current page is marked, and is not a link to itself.
    expect(pages().querySelector('[aria-current="page"]')).toHaveTextContent(/2$/);
    expect(within(pages()).queryByRole("link", { name: "Page 2" })).not.toBeInTheDocument();
    expect(pages()).toHaveTextContent("Page 2 of 5");
  });

  it("has nowhere to go before the first page or after the last", () => {
    const { unmount } = render(<Pagination query={query()} page={1} totalPages={3} />);
    expect(within(pages()).queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
    expect(within(pages()).getByText("Previous")).toHaveAttribute("aria-disabled", "true");
    expect(within(pages()).getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?page=2",
    );
    unmount();

    // The page shown is the one the query returned: here the last, whatever was asked for.
    render(<Pagination query={query({ page: 99 })} page={3} totalPages={3} />);
    expect(within(pages()).getByRole("link", { name: "Previous" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas?page=2",
    );
    expect(within(pages()).queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
    expect(within(pages()).getByText("Next")).toHaveAttribute("aria-disabled", "true");
  });

  it("does not list hundreds of pages", () => {
    render(<Pagination query={query({ page: 150 })} page={150} totalPages={400} />);
    expect(
      within(pages())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Previous", "1", "149", "151", "400", "Next"]);
  });
});
