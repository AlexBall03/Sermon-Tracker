import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { testPreferences } from "@/features/preferences/testing";
import { I18nProvider } from "@/i18n/client";

// The access helper and the query are mocked: this covers what the overview
// does with their answers. The query itself is tested on a database.
const state = vi.hoisted(() => ({
  signedIn: true,
  items: [] as unknown[],
  paging: {} as { total?: number; page?: number; totalPages?: number },
  /** How many outlines there are in all, whatever the search finds. */
  overall: 0,
  listOutlines: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    if (!state.signedIn) throw new Error("redirect:/sign-in");
    return { id: "owner-1", role: "user", status: "active" };
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
}));
vi.mock("@/db", () => ({ getDb: () => "database" }));
vi.mock("@/features/outlines/actions", () => ({ createOutline: vi.fn() }));
vi.mock("@/features/ideas/actions", () => ({ createIdea: vi.fn() }));
vi.mock("@/features/outlines/outlines", () => ({
  listOutlines: async (...args: unknown[]) => {
    state.listOutlines(...args);
    // The second question the page may ask: is there any outline at all?
    if ((args[2] as { pageSize?: number }).pageSize === 1) {
      return { items: [], total: state.overall, page: 1, pageSize: 1, totalPages: state.overall };
    }
    return {
      items: state.items,
      total: state.items.length,
      page: 1,
      pageSize: 24,
      totalPages: state.items.length ? 1 : 0,
      ...state.paging,
    };
  },
}));

import OutlinesPage from "./page";

const outline = (id: string, title: string, fields: Record<string, unknown> = {}) => ({
  id,
  sermonId: `sermon-${id}`,
  numbering: { version: 1, preset: "traditional" },
  revision: 3,
  createdAt: new Date("2026-09-01T10:00:00Z"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  sermon: { id: `sermon-${id}`, title, kind: "sermon", archivedAt: null, status: "developing" },
  entryCount: 5,
  ...fields,
});

async function open(searchParams: Record<string, string | string[]> = {}) {
  const page = await OutlinesPage({ searchParams: Promise.resolve(searchParams) });
  return render(
    <I18nProvider locale={testPreferences.locale}>
      <ToastProvider>{page}</ToastProvider>
    </I18nProvider>,
  );
}

/** What the page says of its results. The toast region is a status too, and says nothing here. */
const said = () =>
  screen
    .getAllByRole("status")
    .map((region) => region.textContent)
    .join(" ");

beforeEach(() => {
  vi.clearAllMocks();
  testPreferences.reset();
  Object.assign(state, { signedIn: true, items: [], paging: {}, overall: 0 });
});

describe("the overview of outlines", () => {
  it("refuses to render without an active account, before anything is read", async () => {
    state.signedIn = false;
    await expect(open()).rejects.toThrow("redirect:/sign-in");
    expect(state.listOutlines).not.toHaveBeenCalled();
  });

  it("lists the signed-in owner's outlines, each with its sermon and what is known of it", async () => {
    state.items = [
      outline("a", "Amazing Grace"),
      outline("b", "Peace", {
        entryCount: 0,
        sermon: { ...outline("b", "Peace").sermon, status: "ready" },
      }),
    ];
    state.overall = 2;
    await open();
    expect(screen.getByRole("heading", { level: 1, name: "Outlines" })).toBeVisible();
    // Asked for the owner from the session, with the default query.
    expect(state.listOutlines).toHaveBeenCalledWith("database", "owner-1", {
      q: "",
      sort: "updated-desc",
      page: 1,
    });

    const list = screen.getByRole("list", { name: "Outlines" });
    const [first, second] = within(list).getAllByRole("listitem");
    // The card opens the outline, to carry on with it.
    expect(
      within(first).getByRole("link", { name: "Open the outline of Amazing Grace" }),
    ).toHaveAttribute("href", "/outlines/a");
    expect(
      within(first).getByRole("link", { name: "Open the sermon Amazing Grace" }),
    ).toHaveAttribute("href", "/library/sermon-a");
    expect(first).toHaveTextContent("5 entries");
    // The sermon's own status: an outline has none.
    expect(first).toHaveTextContent("Developing");
    expect(first).toHaveTextContent("Worked on Oct 2, 2026");
    expect(second).toHaveTextContent("Nothing in it yet");
    expect(second).toHaveTextContent("Ready");
    expect(said()).toContain("2 outlines");
  });

  it("has a search box and an order, and one action", async () => {
    state.items = [outline("a", "Amazing Grace")];
    state.overall = 1;
    await open();
    expect(screen.getByRole("searchbox", { name: "Search outlines" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Sort outlines" })).toHaveTextContent(
      "Recently worked on",
    );
    expect(screen.getAllByRole("button", { name: "Create Outline" })).toHaveLength(1);
    // No status filter, no archive view: an outline has neither.
    expect(screen.queryByRole("button", { name: /Filters/ })).not.toBeInTheDocument();
  });

  it("reads the search, the order, and the page from the address", async () => {
    state.items = [outline("a", "Amazing Grace")];
    await open({ q: "grace", sort: "title-asc", page: "2", archived: "all", status: "ready" });
    expect(state.listOutlines).toHaveBeenCalledWith("database", "owner-1", {
      q: "grace",
      sort: "title-asc",
      page: 2,
    });
    expect(screen.getByRole("searchbox", { name: "Search outlines" })).toHaveValue("grace");
    expect(said()).toContain("1 matching outline");
  });

  it("searches after a pause in the typing, through the address", async () => {
    state.items = [outline("a", "Amazing Grace")];
    state.overall = 1;
    await open();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search outlines" }), {
      target: { value: "peace" },
    });
    await waitFor(() =>
      expect(state.push).toHaveBeenCalledWith("/outlines?q=peace", { scroll: false }),
    );
  });

  it("invites a first outline when there are none, with nothing to search yet", async () => {
    await open();
    expect(screen.getByRole("heading", { name: "No outlines yet" })).toBeVisible();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    // The header's action and the invitation open the same dialog.
    const buttons = screen.getAllByRole("button", { name: "Create Outline" });
    expect(buttons).toHaveLength(2);
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [], total: 0 }),
    }));
    fireEvent.click(buttons[1]);
    expect(await screen.findByRole("dialog", { name: "Create an outline" })).toBeVisible();
  });

  it("says so when a search finds nothing, without calling the account empty, and offers to clear it", async () => {
    state.overall = 3;
    await open({ q: "nothing", sort: "title-asc" });
    expect(screen.getByRole("heading", { name: "No outlines match your search" })).toBeVisible();
    expect(said()).toContain("“nothing”");
    // The order is kept; only the search is lifted.
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      "/outlines?sort=title-asc",
    );
    expect(screen.getByRole("searchbox", { name: "Search outlines" })).toBeVisible();
  });

  it("says which outlines are showing when there is more than one page, and links to the others", async () => {
    state.items = [outline("a", "Amazing Grace")];
    state.paging = { total: 60, page: 2, totalPages: 3 };
    await open({ q: "grace", page: "2" });
    expect(said()).toContain("Showing 25–48 of 60 matching outlines");
    const pages = within(screen.getByRole("navigation", { name: "Outline pages" }));
    expect(pages.getByRole("link", { name: /Previous/ })).toHaveAttribute(
      "href",
      "/outlines?q=grace",
    );
    expect(pages.getByRole("link", { name: /Next/ })).toHaveAttribute(
      "href",
      "/outlines?q=grace&page=3",
    );
  });

  it("is in Spanish for an account that reads Spanish", async () => {
    testPreferences.locale = "es";
    state.items = [outline("a", "Sublime gracia", { entryCount: 1 })];
    state.overall = 1;
    await open();
    expect(screen.getByRole("heading", { level: 1, name: "Bosquejos" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Crear bosquejo" })).toBeVisible();
    const card = screen.getByRole("listitem");
    expect(card).toHaveTextContent("1 entrada");
    expect(card).toHaveTextContent("En desarrollo");
    expect(said()).toContain("1 bosquejo");
  });
});
