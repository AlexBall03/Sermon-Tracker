import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import type { HistoryItem } from "@/features/preaching/occurrences";
import { defaultHistoryQuery } from "@/features/preaching/schemas";
import { testPreferences } from "@/features/preferences/testing";
import { I18nProvider } from "@/i18n/client";

// The access helper, the queries, and the actions are mocked: this covers what
// the page does with their answers. The queries themselves are tested on a database.
const state = vi.hoisted(() => ({
  signedIn: true,
  items: [] as unknown[],
  paging: {} as { total?: number; page?: number; totalPages?: number },
  /** How much history there is in all, whatever the query finds. */
  overall: 0,
  venues: [] as unknown[],
  contexts: [] as unknown[],
  idea: null as unknown,
  searchHistory: vi.fn(),
  getIdea: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  recordOccurrence: vi.fn(),
  updateOccurrence: vi.fn(),
  deleteOccurrence: vi.fn(),
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    if (!state.signedIn) throw new Error("redirect:/sign-in");
    return { id: "owner-1", role: "user", status: "active" };
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace, refresh: state.refresh }),
}));
vi.mock("@/db", () => ({ getDb: () => "database" }));
vi.mock("@/features/ideas/ideas", () => ({
  getIdea: async (...args: unknown[]) => {
    state.getIdea(...args);
    return state.idea;
  },
}));
vi.mock("@/features/preaching/occurrences", () => ({
  searchHistory: async (...args: unknown[]) => {
    state.searchHistory(...args);
    // The second question the page may ask: is there any history at all?
    if (args[3] === 1) {
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
vi.mock("@/features/preaching/venues", () => ({ listVenues: async () => state.venues }));
vi.mock("@/features/preaching/contexts", () => ({ listContexts: async () => state.contexts }));
vi.mock("@/features/preaching/actions", () => ({
  recordOccurrence: state.recordOccurrence,
  updateOccurrence: state.updateOccurrence,
  deleteOccurrence: state.deleteOccurrence,
  createVenue: vi.fn(),
  updateVenue: vi.fn(),
  deleteVenue: vi.fn(),
  createContext: vi.fn(),
  renameContext: vi.fn(),
  deleteContext: vi.fn(),
}));

import PreachingHistoryPage from "./page";

const sermonId = "11111111-1111-4111-8111-111111111111";
const venueId = "22222222-2222-4222-8222-222222222222";
const contextId = "44444444-4444-4444-8444-444444444444";

const item = (fields: Partial<HistoryItem> = {}): HistoryItem => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerId: "owner-1",
  sermonId,
  preachedOn: "2026-10-04",
  timeOfDay: "am",
  venueId,
  contextId,
  actualFormat: "full_length",
  durationMinutes: 75,
  notes: "Went long in the second point.",
  recordingUrl: "https://example.com/sermons/it-is-well",
  createdAt: new Date("2026-10-04T18:00:00Z"),
  updatedAt: new Date("2026-10-04T18:00:00Z"),
  sermon: { id: sermonId, title: "It is Well", kind: "sermon", archivedAt: null },
  venue: { id: venueId, name: "Grace Baptist Church", locality: "Springfield" },
  context: { id: contextId, name: "Regular Church Service" },
  ...fields,
});
/** An occasion with nothing optional recorded. */
const bare = item({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  preachedOn: "2026-09-27",
  timeOfDay: null,
  venueId: null,
  contextId: null,
  actualFormat: "unspecified",
  durationMinutes: null,
  notes: null,
  recordingUrl: null,
  sermon: { id: sermonId, title: "Faith Speaks First", kind: "sermon", archivedAt: null },
  venue: null,
  context: null,
});
const venue = {
  id: venueId,
  name: "Grace Baptist Church",
  locality: "Springfield",
  occurrenceCount: 3,
};
const context = { id: contextId, name: "Regular Church Service", occurrenceCount: 2 };

async function show(search = "") {
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(search)) {
    params[key] = key in params ? [params[key], value].flat() : value;
  }
  const page = await PreachingHistoryPage({ searchParams: Promise.resolve(params) });
  return render(
    <I18nProvider locale={testPreferences.current().locale}>
      <ToastProvider>{page}</ToastProvider>
    </I18nProvider>,
  );
}
/** The query the page asked the database for. */
const asked = () => state.searchHistory.mock.calls[0];
const list = () => within(screen.getByRole("list", { name: "Your preaching record" }));

beforeEach(() => {
  vi.clearAllMocks();
  state.signedIn = true;
  state.items = [];
  state.paging = {};
  state.overall = 0;
  state.venues = [venue];
  state.contexts = [context];
  state.idea = null;
});

describe("the preaching history section", () => {
  it("checks access itself, before reading anything", async () => {
    state.signedIn = false;
    await expect(PreachingHistoryPage({})).rejects.toThrow("redirect:/sign-in");
    expect(state.searchHistory).not.toHaveBeenCalled();
  });

  it("asks for the signed-in account's history with the query from the address", async () => {
    state.items = [item()];
    await show(
      `q=grace&from=2026-01-01&to=2026-12-31&venue=${venueId}&context=${contextId}` +
        "&format=mini&time=pm&time=unspecified&sort=date-asc&page=2&owner=someone-else",
    );
    expect(asked()).toEqual([
      "database",
      "owner-1",
      {
        q: "grace",
        sermonId: null,
        from: "2026-01-01",
        through: "2026-12-31",
        venueIds: [venueId],
        contextIds: [contextId],
        formats: ["mini"],
        timesOfDay: ["pm", "unspecified"],
        sort: "date-asc",
        page: 2,
      },
    ]);
  });

  it("reads a nonsense address as everything, newest first", async () => {
    state.items = [item()];
    await show("venue=1&format=long&time=noon&sort=drop&page=-1&sermon=mine");
    expect(asked()[2]).toEqual(defaultHistoryQuery);
    expect(state.getIdea).not.toHaveBeenCalled();
  });

  it("belongs to the library: its heading, and the way between its sections", async () => {
    state.items = [item()];
    await show();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Preaching Record");
    // The way up is a link to the overview, wherever this page was reached from.
    expect(screen.getByRole("link", { name: "Back to Library" })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(screen.getAllByRole("link", { name: "Back to Library" })).toHaveLength(1);
    const sections = within(screen.getByRole("navigation", { name: "Library sections" }));
    expect(sections.getByRole("link", { name: "Sermon Ideas" })).toHaveAttribute(
      "href",
      "/library/sermon-ideas",
    );
    const here = sections.getByRole("link", { name: "Preaching Record" });
    expect(here).toHaveAttribute("href", "/library/preaching-record");
    expect(here).toHaveAttribute("aria-current", "page");
  });

  it("lists each occasion with what was recorded, and nothing where nothing was", async () => {
    state.items = [item(), bare];
    await show();
    const [full, plain] = list().getAllByRole("listitem");

    expect(full).toHaveTextContent("It is Well");
    expect(full).toHaveTextContent("Oct 4, 2026");
    expect(full).toHaveTextContent("AM");
    expect(full).toHaveTextContent("Grace Baptist Church");
    expect(full).toHaveTextContent("Springfield");
    expect(full).toHaveTextContent("Regular Church Service");
    expect(full).toHaveTextContent("Full-Length · 1 hr 15 min");
    expect(
      within(full).getByRole("button", { name: "View It is Well, preached Oct 4, 2026 AM" }),
    ).toBeEnabled();

    // The date as it was written: a Sunday is not moved to a Saturday.
    expect(plain).toHaveTextContent("Sep 27, 2026");
    expect(plain.querySelector("time")).toHaveAttribute("datetime", "2026-09-27");
    // Nothing stands in for what was not recorded.
    expect(plain).not.toHaveTextContent(/AM|PM|Not Specified|Not specified|min|—|-$/);
    expect(plain.textContent).toBe("Sep 27, 2026Sep 27, 2026Faith Speaks First");

    expect(screen.getByText("2 records")).toHaveAttribute("role", "status");
  });

  it("keeps the history of a sermon since archived or refiled, and says which it is", async () => {
    state.items = [
      item({
        sermon: { id: sermonId, title: "Archived one", kind: "sermon", archivedAt: new Date() },
      }),
      item({
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        sermon: { id: sermonId, title: "Now a point", kind: "point", archivedAt: null },
      }),
    ];
    await show();
    const [archived, refiled] = list().getAllByRole("listitem");
    expect(archived).toHaveTextContent("Archived");
    expect(refiled).toHaveTextContent("Now filed as: Point idea");
  });

  it("pages through the database's answer, carrying the query", async () => {
    state.items = [item()];
    state.paging = { total: 60, page: 2, totalPages: 3 };
    await show("q=grace&time=pm&page=2");
    expect(screen.getByText("Showing 25–48 of 60 matching records")).toBeVisible();
    const pages = within(screen.getByRole("navigation", { name: "Preaching record pages" }));
    expect(pages.getByRole("link", { name: /Previous/ })).toHaveAttribute(
      "href",
      "/library/preaching-record?q=grace&time=pm",
    );
    expect(pages.getByRole("link", { name: /Next/ })).toHaveAttribute(
      "href",
      "/library/preaching-record?q=grace&time=pm&page=3",
    );
  });

  it("says so when nothing has been recorded, and offers to record", async () => {
    await show();
    expect(screen.getByRole("heading", { name: "Nothing recorded yet" })).toBeVisible();
    // There is nothing to search or filter yet.
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Record preaching" })).toHaveLength(2);
    expect(state.searchHistory).toHaveBeenCalledTimes(1);
  });

  it("tells a filter that matches nothing from having no history at all", async () => {
    state.overall = 4;
    await show("time=pm");
    expect(screen.getByRole("heading", { name: "No records match these filters" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/library/preaching-record",
    );
    // Asked only because the search found nothing, and only for a count.
    expect(state.searchHistory).toHaveBeenLastCalledWith(
      "database",
      "owner-1",
      defaultHistoryQuery,
      1,
    );
  });

  it("names the search that found nothing, alone and together with filters", async () => {
    state.overall = 4;
    const { unmount } = await show("q=jonah");
    expect(screen.getByRole("heading", { name: "No records match your search" })).toBeVisible();
    expect(
      screen.getByText(
        "Nothing in your preaching record has “jonah” in its sermon, venue, or context.",
      ),
    ).toHaveAttribute("role", "status");
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      "/library/preaching-record",
    );
    unmount();

    await show("q=jonah&time=am");
    expect(
      screen.getByText(
        "Nothing in your preaching record fits “jonah” together with the filters you have chosen.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/library/preaching-record?q=jonah",
    );
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute(
      "href",
      "/library/preaching-record?time=am",
    );
  });

  it("narrows to one of the account's own sermons, and names it", async () => {
    state.items = [item()];
    state.idea = { id: sermonId, title: "It is Well", kind: "sermon" };
    await show(`sermon=${sermonId}`);
    // Looked up for this account only.
    expect(state.getIdea).toHaveBeenCalledWith("database", "owner-1", sermonId);
    expect(asked()[2]).toMatchObject({ sermonId });
    const chips = within(screen.getByRole("list", { name: "Active filters" }));
    fireEvent.click(chips.getByRole("button", { name: "Remove filter: Sermon It is Well" }));
    expect(state.push).toHaveBeenCalledWith("/library/preaching-record", { scroll: false });
  });

  it("drops a sermon that is not this account's, and names nothing", async () => {
    state.items = [item()];
    state.idea = null;
    await show(`sermon=${sermonId}`);
    expect(asked()[2]).toMatchObject({ sermonId: null });
    expect(screen.queryByRole("list", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it("filters through the address, keeping the search and going back to page 1", async () => {
    state.items = [item()];
    await show(`q=grace&venue=${venueId}&page=3`);

    const filters = screen.getByRole("button", { name: /Filters/ });
    expect(filters).toHaveAttribute("aria-expanded", "false");
    expect(filters).toHaveTextContent("1 active");
    fireEvent.click(filters);
    const panel = within(screen.getByRole("region", { name: "Filters" }));

    // The venue in force shows as chosen, with how many records name it.
    expect(
      panel.getByRole("button", { name: /Grace Baptist Church · Springfield/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(panel.getByRole("button", { name: "PM" }));
    expect(state.push).toHaveBeenLastCalledWith(
      `/library/preaching-record?q=grace&venue=${venueId}&time=pm`,
      { scroll: false },
    );
    // The router here goes nowhere, so each change is made to the page as it was read.
    fireEvent.click(panel.getByRole("button", { name: "Mini" }));
    expect(state.push).toHaveBeenLastCalledWith(
      `/library/preaching-record?q=grace&venue=${venueId}&format=mini`,
      { scroll: false },
    );
    fireEvent.change(panel.getByLabelText("From"), { target: { value: "2026-01-01" } });
    expect(state.push).toHaveBeenLastCalledWith(
      `/library/preaching-record?q=grace&from=2026-01-01&venue=${venueId}`,
      { scroll: false },
    );

    fireEvent.click(panel.getByRole("button", { name: "Clear filters" }));
    expect(state.push).toHaveBeenLastCalledWith("/library/preaching-record?q=grace", {
      scroll: false,
    });
  });

  it("removes one filter at a time, and names one it does not know", async () => {
    state.items = [item()];
    const unknown = "99999999-9999-4999-8999-999999999999";
    await show(`venue=${venueId}&venue=${unknown}&time=am&from=2026-01-01`);
    const chips = within(screen.getByRole("list", { name: "Active filters" }));
    expect(chips.getByRole("button", { name: "Remove filter: Venue Unknown venue" })).toBeVisible();
    expect(
      chips.getByRole("button", { name: "Remove filter: Preached from Jan 1, 2026" }),
    ).toBeVisible();
    fireEvent.click(chips.getByRole("button", { name: "Remove filter: Time AM" }));
    expect(state.push).toHaveBeenCalledWith(
      `/library/preaching-record?from=2026-01-01&venue=${venueId}&venue=${unknown}`,
      { scroll: false },
    );
  });

  it("opens an occasion to everything recorded on it, with a working link to the recording", async () => {
    state.items = [item()];
    await show();
    fireEvent.click(list().getByRole("button", { name: /View It is Well/ }));

    const dialog = within(await screen.findByRole("dialog", { name: "Record details" }));
    expect(dialog.getByText("It is Well")).toBeVisible();
    expect(dialog.getByRole("link", { name: "Open sermon" })).toHaveAttribute(
      "href",
      `/library/${sermonId}`,
    );
    for (const text of [
      "Grace Baptist Church · Springfield",
      "Regular Church Service",
      "Full-Length",
      "1 hr 15 min",
      "Went long in the second point.",
    ]) {
      expect(dialog.getByText(text)).toBeVisible();
    }
    const recording = dialog.getByRole("link", { name: /Open recording/ });
    expect(recording).toHaveAttribute("href", "https://example.com/sermons/it-is-well");
    expect(recording).toHaveAttribute("target", "_blank");
    expect(recording).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows only what an occasion has, in its own record too", async () => {
    state.items = [bare];
    await show();
    fireEvent.click(list().getByRole("button", { name: /View Faith Speaks First/ }));
    const dialog = within(await screen.findByRole("dialog", { name: "Record details" }));
    expect(dialog.getAllByRole("term").map((term) => term.textContent)).toEqual(["Date preached"]);
    expect(dialog.queryByRole("link", { name: /Open recording/ })).not.toBeInTheDocument();
  });

  it("deletes one occasion only after asking, and says the sermon is kept", async () => {
    state.items = [item()];
    state.deleteOccurrence.mockResolvedValue({
      ok: true,
      message: "Removed from your preaching record.",
    });
    await show();
    fireEvent.click(list().getByRole("button", { name: /View It is Well/ }));
    const dialog = within(await screen.findByRole("dialog", { name: "Record details" }));

    fireEvent.click(dialog.getByRole("button", { name: "Delete record" }));
    expect(state.deleteOccurrence).not.toHaveBeenCalled();
    const confirm = within(dialog.getByRole("alertdialog"));
    expect(confirm.getByText("Delete the record of “It is Well” on Oct 4, 2026?")).toBeVisible();
    expect(
      confirm.getByText("Only this record is removed. The sermon itself is kept."),
    ).toBeVisible();

    fireEvent.click(confirm.getByRole("button", { name: "Delete record" }));
    await waitFor(() => expect(state.deleteOccurrence).toHaveBeenCalledWith(item().id));
    expect(await screen.findByText("Removed from your preaching record.")).toBeVisible();
    expect(state.refresh).toHaveBeenCalled();
  });

  it("is in Spanish for an account that reads Spanish", async () => {
    testPreferences.locale = "es";
    state.items = [item()];
    await show("time=pm");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Registro de predicación");
    expect(screen.getByRole("link", { name: "Volver a la biblioteca" })).toHaveAttribute(
      "href",
      "/library",
    );
    expect(screen.getByRole("link", { name: "Registro de predicación" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Registrar predicación" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Tu registro de predicación" })).toBeVisible();
    expect(screen.getByText("1 registro que coincide")).toBeVisible();
    expect(screen.getByRole("button", { name: "Quitar filtro: Hora PM" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Tu registro de predicación" })).toHaveTextContent(
      "4 oct 2026",
    );
  });

  it("is in English when Spanish is switched off, whatever the account chose", async () => {
    testPreferences.locale = "es";
    testPreferences.spanishEnabled = false;
    state.items = [item()];
    await show();
    expect(screen.getByRole("button", { name: "Record preaching" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Your preaching record" })).toBeVisible();
  });
});
