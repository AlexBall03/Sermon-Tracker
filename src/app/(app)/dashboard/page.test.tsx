import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui/toast";
import { defaultHistoryQuery } from "@/features/preaching/schemas";
import { testPreferences } from "@/features/preferences/testing";
import { I18nProvider } from "@/i18n/client";

// The access helper, Clerk, the queries, and the actions are mocked: this covers what the
// page does with their answers. The queries themselves are tested on a database.
const state = vi.hoisted(() => ({
  working: [] as unknown[],
  outlines: new Map<string, unknown>(),
  revisit: [] as unknown[],
  ideas: [] as unknown[],
  preaching: [] as unknown[],
  timesPreached: 0,
  counts: { sermons: 0, points: 0, developing: 0 } as unknown,
  countsDown: false,
  continueWorking: vi.fn(),
  outlinesForSermons: vi.fn(),
  revisitIdeas: vi.fn(),
  recentIdeas: vi.fn(),
  workspaceCounts: vi.fn(),
  searchHistory: vi.fn(),
  listVenues: vi.fn(),
  createOutline: vi.fn(),
  recordOccurrence: vi.fn(),
  role: "user" as "user" | "admin",
  firstName: "Ada" as string | null,
  clerkDown: false,
  signedIn: true,
  onboardingStatus: "grandfathered" as string,
  tourState: "not_offered" as string,
  markTourOffered: vi.fn(async () => ({ ok: true, message: "" })),
  dismissProductTour: vi.fn(async () => ({ ok: true, message: "" })),
}));

vi.mock("@/features/auth/access", () => ({
  requireActiveUser: async () => {
    if (!state.signedIn) throw new Error("redirect:/sign-in");
    return {
      id: "1",
      clerkUserId: "user_1",
      role: state.role,
      status: "active",
      onboardingStatus: state.onboardingStatus,
      tourState: state.tourState,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  currentUser: async () => {
    if (state.clerkDown) throw new Error("unreachable");
    return { firstName: state.firstName };
  },
}));

vi.mock("@/db", () => ({ getDb: () => "database" }));
vi.mock("@/features/ideas/ideas", () => ({
  continueWorking: async (...args: unknown[]) => {
    state.continueWorking(...args);
    return state.working;
  },
  revisitIdeas: async (...args: unknown[]) => {
    state.revisitIdeas(...args);
    return state.revisit;
  },
  recentIdeas: async (...args: unknown[]) => {
    state.recentIdeas(...args);
    return state.ideas;
  },
  workspaceCounts: async (...args: unknown[]) => {
    state.workspaceCounts(...args);
    if (state.countsDown) throw new Error("the database is unreachable");
    return state.counts;
  },
}));
vi.mock("@/features/outlines/outlines", () => ({
  outlinesForSermons: async (...args: unknown[]) => {
    state.outlinesForSermons(...args);
    return state.outlines;
  },
}));
vi.mock("@/features/outlines/actions", () => ({ createOutline: state.createOutline }));
vi.mock("@/features/preaching/occurrences", () => ({
  searchHistory: async (...args: unknown[]) => {
    state.searchHistory(...args);
    return { items: state.preaching, total: state.timesPreached };
  },
}));
vi.mock("@/features/preaching/venues", () => ({
  listVenues: async (...args: unknown[]) => {
    state.listVenues(...args);
    return [];
  },
}));
vi.mock("@/features/preaching/contexts", () => ({ listContexts: async () => [] }));
vi.mock("@/features/preaching/actions", () => ({
  recordOccurrence: state.recordOccurrence,
  updateOccurrence: vi.fn(),
  deleteOccurrence: vi.fn(),
  createVenue: vi.fn(),
  createContext: vi.fn(),
}));
vi.mock("@/features/tour/actions", () => ({
  markTourOffered: state.markTourOffered,
  dismissProductTour: state.dismissProductTour,
  completeProductTour: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import DashboardPage from "./page";

const idea = (id: string, title: string, kind: string, fields: Record<string, unknown> = {}) => ({
  id,
  ownerId: "1",
  kind,
  title,
  notes: null,
  status: "idea",
  intendedFormat: "unspecified",
  sermonType: "unspecified",
  subject: null,
  archivedAt: null,
  lastDevelopedAt: null,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-02T10:00:00Z"),
  ...fields,
});

const occasion = (id: string, title: string, fields: Record<string, unknown> = {}) => ({
  id,
  ownerId: "1",
  sermonId: "a1",
  preachedOn: "2026-10-11",
  timeOfDay: null,
  venueId: null,
  contextId: null,
  actualFormat: "unspecified",
  durationMinutes: null,
  notes: null,
  recordingUrl: null,
  createdAt: new Date("2026-10-11T18:00:00Z"),
  updatedAt: new Date("2026-10-11T18:00:00Z"),
  sermon: { id: "a1", title, kind: "sermon", archivedAt: null },
  venue: null,
  context: null,
  ...fields,
});

/** An account with a sermon in hand, so the regular sections are drawn. */
function populated() {
  state.ideas = [
    idea("a1", "His Grace is Sufficient", "sermon", { status: "developing" }),
    idea("b2", "Faith speaks", "point"),
    idea("c3", "Something about Jonah", "undecided"),
  ];
  state.counts = { sermons: 1, points: 1, developing: 1 };
}

async function show() {
  return render(
    <I18nProvider locale={testPreferences.current().locale}>
      <ToastProvider>{await DashboardPage()}</ToastProvider>
    </I18nProvider>,
  );
}

const figures = () =>
  Object.fromEntries(
    within(screen.getByRole("region", { name: /At a Glance|De un vistazo/ }))
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]),
  );

beforeEach(() => {
  Object.assign(state, {
    role: "user",
    firstName: "Ada",
    clerkDown: false,
    signedIn: true,
    onboardingStatus: "grandfathered",
    tourState: "not_offered",
    working: [],
    outlines: new Map(),
    revisit: [],
    ideas: [],
    preaching: [],
    timesPreached: 0,
    counts: { sermons: 0, points: 0, developing: 0 },
    countsDown: false,
  });
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardPage", () => {
  it("refuses to render without an active account, and asks the database nothing", async () => {
    state.signedIn = false;
    await expect(DashboardPage()).rejects.toThrow("redirect:/sign-in");
    expect(state.recentIdeas).not.toHaveBeenCalled();
    expect(state.searchHistory).not.toHaveBeenCalled();
  });

  it("asks every query for the signed-in account's own, and only a handful of each", async () => {
    state.working = [idea("a1", "Grace", "sermon")];
    await show();
    expect(state.continueWorking).toHaveBeenCalledWith("database", "1");
    // One more query for the outlines of exactly those sermons.
    expect(state.outlinesForSermons).toHaveBeenCalledExactlyOnceWith("database", "1", ["a1"]);
    expect(state.revisitIdeas).toHaveBeenCalledWith("database", "1");
    expect(state.recentIdeas).toHaveBeenCalledWith("database", "1", 5);
    expect(state.searchHistory).toHaveBeenCalledWith("database", "1", defaultHistoryQuery, 3);
    expect(state.workspaceCounts).toHaveBeenCalledWith("database", "1");
    expect(state.listVenues).toHaveBeenCalledWith("database", "1");
  });

  it("welcomes the person by first name", async () => {
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back, Ada" })).toBeVisible();
  });

  it("falls back when there is no name, or the name cannot be read", async () => {
    state.firstName = null;
    const { unmount } = await show();
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    unmount();

    Object.assign(state, { firstName: "Ada", clerkDown: true });
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  });

  it("leaves settings and administration to the account menu, for an administrator too", async () => {
    state.role = "admin";
    populated();
    await show();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Administration/ })).not.toBeInTheDocument();
  });

  describe("the product tour's invitation", () => {
    const invitation = () => screen.queryByRole("region", { name: "Take a quick tour" });

    it("is offered to an account that has just been through setup, above an empty workspace too", async () => {
      state.onboardingStatus = "completed";
      await show();
      expect(invitation()).toBeInTheDocument();
      // It is in the page, beside the one invitation to capture, and starts nothing by itself.
      expect(screen.getByRole("region", { name: "Start with an idea" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(state.markTourOffered).toHaveBeenCalled();
    });

    it("stays offered until it is answered", async () => {
      Object.assign(state, { onboardingStatus: "completed", tourState: "offered" });
      populated();
      await show();
      expect(invitation()).toBeInTheDocument();
    });

    it("is not offered once answered, nor to an account from before setup", async () => {
      for (const [onboardingStatus, tourState] of [
        ["completed", "dismissed"],
        ["completed", "completed"],
        ["grandfathered", "not_offered"],
      ]) {
        Object.assign(state, { onboardingStatus, tourState });
        const { unmount } = await show();
        expect(invitation()).not.toBeInTheDocument();
        unmount();
      }
      expect(state.markTourOffered).not.toHaveBeenCalled();
    });

    it("keeps Maybe Later", async () => {
      state.onboardingStatus = "completed";
      await show();
      fireEvent.click(screen.getByRole("button", { name: "Maybe Later" }));
      expect(state.dismissProductTour).toHaveBeenCalledOnce();
    });
  });

  describe("an empty workspace", () => {
    it("is one invitation to capture, and none of the sections", async () => {
      await show();
      expect(screen.getByRole("heading", { name: "Start with an idea" })).toBeVisible();
      expect(
        screen.getByText(
          "Capture the thought first. You can develop it, outline it, and record it when you preach it.",
        ),
      ).toBeVisible();
      // The one action, once.
      expect(screen.getAllByRole("button", { name: "Capture an idea" })).toHaveLength(1);
      expect(screen.queryByRole("button", { name: "Record preaching" })).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Start or open outline" }),
      ).not.toBeInTheDocument();
      for (const name of [
        "Continue Working",
        "Revisit an Idea",
        "Recent Ideas",
        "Recent Preaching",
      ]) {
        expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
      }
    });

    it("still shows its figures, as real zeros", async () => {
      await show();
      expect(figures()).toEqual({
        "Sermon Ideas": "0",
        "Point Ideas": "0",
        "In Development": "0",
        "Times Preached": "0",
      });
    });
  });

  describe("the header's actions", () => {
    beforeEach(populated);

    it("are capture, an outline, and recording, each once", async () => {
      await show();
      const header = within(screen.getByRole("banner"));
      expect(header.getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Start or open outline",
        "Record preaching",
        "Capture an idea",
      ]);
      expect(screen.getAllByRole("button", { name: "Capture an idea" })).toHaveLength(1);
    });

    it("open the shared recording form, with the sermon chosen in it, and record nothing by opening", async () => {
      await show();
      fireEvent.click(
        within(screen.getByRole("banner")).getByRole("button", { name: "Record preaching" }),
      );
      // The same form as the preaching record's, with no sermon chosen yet.
      const dialog = await screen.findByRole("dialog", { name: "Record preaching" });
      expect(within(dialog).getByRole("search")).toBeVisible();
      expect(state.recordOccurrence).not.toHaveBeenCalled();
      // The dashboard is still the page.
      expect(
        screen.getByRole("heading", { level: 1, name: "Welcome back, Ada", hidden: true }),
      ).toBeInTheDocument();
    });

    it("open the outlines' own sermon picker, and make no outline by opening it", async () => {
      await show();
      fireEvent.click(
        within(screen.getByRole("banner")).getByRole("button", { name: "Start or open outline" }),
      );
      const dialog = await screen.findByRole("dialog", { name: "Create an outline" });
      expect(within(dialog).getByRole("search", { name: "Find a sermon" })).toBeVisible();
      expect(state.createOutline).not.toHaveBeenCalled();
    });
  });

  describe("Continue Working", () => {
    beforeEach(populated);

    it("resumes the outline of a sermon that has one, and still leads to the sermon", async () => {
      state.working = [
        idea("a1", "His Grace is Sufficient", "sermon", {
          status: "developing",
          lastDevelopedAt: new Date("2026-10-09T10:00:00Z"),
        }),
      ];
      state.outlines = new Map([["a1", { id: "o1", entryCount: 7, updatedAt: new Date() }]]);
      await show();

      const section = within(screen.getByRole("region", { name: "Continue Working" }));
      const [card] = within(section.getByRole("list", { name: "Continue Working" })).getAllByRole(
        "listitem",
      );
      expect(card).toHaveTextContent("Status: Developing");
      expect(card).toHaveTextContent("Last developed Oct 9, 2026");
      expect(card).toHaveTextContent(/Outline.*7 entries/);
      expect(
        within(card).getByRole("link", { name: "Resume the outline of His Grace is Sufficient" }),
      ).toHaveAttribute("href", "/outlines/o1");
      expect(within(card).getByRole("link", { name: "His Grace is Sufficient" })).toHaveAttribute(
        "href",
        "/library/a1",
      );
      expect(
        within(card).getByRole("link", { name: "Open the sermon His Grace is Sufficient" }),
      ).toHaveAttribute("href", "/library/a1");
      // An outline has no status and no measure of progress.
      expect(card.textContent).not.toMatch(/%|complete/i);
      expect(within(card).queryByRole("progressbar")).not.toBeInTheDocument();
    });

    it("opens a sermon that has no outline, and leads to where it is given one without making it", async () => {
      state.working = [
        idea("a1", "His Grace is Sufficient", "sermon", {
          lastDevelopedAt: new Date("2026-10-09T10:00:00Z"),
        }),
      ];
      await show();

      const section = within(screen.getByRole("region", { name: "Continue Working" }));
      const card = section.getByRole("listitem");
      expect(card).toHaveTextContent("Status: Idea");
      expect(card).toHaveTextContent("No outline yet");
      expect(
        within(card).getByRole("link", { name: "Open the sermon His Grace is Sufficient" }),
      ).toHaveAttribute("href", "/library/a1");
      // A link to the page that asks first, never a button that creates.
      expect(
        within(card).getByRole("link", { name: "Create an outline for His Grace is Sufficient" }),
      ).toHaveAttribute("href", "/outlines/new?sermon=a1");
      expect(within(card).queryByRole("link", { name: /Resume/ })).not.toBeInTheDocument();
      expect(within(card).queryByRole("button")).not.toBeInTheDocument();
      expect(state.createOutline).not.toHaveBeenCalled();
    });

    it("keeps the order the server chose", async () => {
      state.working = ["Third", "First", "Second"].map((title, index) =>
        idea(`w${index}`, title, "sermon", { lastDevelopedAt: new Date("2026-10-09T10:00:00Z") }),
      );
      await show();
      const list = screen.getByRole("list", { name: "Continue Working" });
      expect(
        within(list)
          .getAllByRole("heading", { level: 3 })
          .map((heading) => heading.textContent),
      ).toEqual(["Third", "First", "Second"]);
    });

    it("says so in a line, and leads to the sermon ideas, when nothing is in development", async () => {
      await show();
      const section = within(screen.getByRole("region", { name: "Continue Working" }));
      expect(section.getByText(/Nothing in development yet/)).toBeVisible();
      expect(section.queryByRole("list")).not.toBeInTheDocument();
      expect(section.getByRole("link", { name: "Open Sermon Ideas" })).toHaveAttribute(
        "href",
        "/library/sermon-ideas",
      );
    });
  });

  describe("Revisit an Idea", () => {
    beforeEach(populated);

    it("offers the sermon ideas the server chose, each with its status and why", async () => {
      state.revisit = [
        idea("a1", "His Grace is Sufficient", "sermon"),
        idea("c3", "The Still Small Voice", "sermon", {
          status: "on_hold",
          lastDevelopedAt: new Date("2026-08-03T10:00:00Z"),
        }),
      ];
      await show();

      const section = within(screen.getByRole("region", { name: "Revisit an Idea" }));
      const [never, held] = within(
        section.getByRole("list", { name: "Revisit an Idea" }),
      ).getAllByRole("listitem");
      expect(within(never).getByRole("link", { name: "His Grace is Sufficient" })).toHaveAttribute(
        "href",
        "/library/a1",
      );
      expect(never).toHaveTextContent("Status: Idea");
      expect(never).toHaveTextContent(/Never developed.*created Oct 1, 2026/);
      expect(within(held).getByRole("link", { name: "The Still Small Voice" })).toHaveAttribute(
        "href",
        "/library/c3",
      );
      expect(held).toHaveTextContent("Status: On Hold");
      expect(held).toHaveTextContent("Last developed Aug 3, 2026");
      expect(section.getByRole("link", { name: "See all that need attention" })).toHaveAttribute(
        "href",
        "/library/sermon-ideas?revisit=attention",
      );
    });

    it("says so, and leads to the library, when no idea needs revisiting", async () => {
      await show();
      const section = within(screen.getByRole("region", { name: "Revisit an Idea" }));
      expect(section.getByText(/Nothing is waiting on you.*last 30 days/)).toBeVisible();
      expect(section.queryByRole("list")).not.toBeInTheDocument();
      expect(section.getByRole("link", { name: "Open Sermon Ideas" })).toHaveAttribute(
        "href",
        "/library/sermon-ideas",
      );
    });
  });

  describe("Recent Ideas", () => {
    it("lists the latest ideas of every kind, each named for what it is and linked to its page", async () => {
      populated();
      await show();
      const section = within(screen.getByRole("region", { name: "Recent Ideas" }));
      const rows = within(section.getByRole("list", { name: "Recent Ideas" })).getAllByRole(
        "listitem",
      );
      expect(rows).toHaveLength(3);
      expect(rows[0]).toHaveTextContent("Sermon idea");
      expect(rows[0]).toHaveTextContent("Status: Developing");
      expect(rows[0]).toHaveTextContent("Updated Oct 2, 2026");
      expect(rows[1]).toHaveTextContent("Point idea");
      expect(rows[2]).toHaveTextContent("Undecided");
      expect(
        within(rows[0]).getByRole("link", { name: "His Grace is Sufficient" }),
      ).toHaveAttribute("href", "/library/a1");
      expect(within(rows[1]).getByRole("link", { name: "Faith speaks" })).toHaveAttribute(
        "href",
        "/library/b2",
      );
      expect(section.getByRole("link", { name: "Open Sermon Ideas" })).toHaveAttribute(
        "href",
        "/library/sermon-ideas",
      );
    });
  });

  describe("Recent Preaching", () => {
    it("lists each occasion by itself, with what was recorded and nothing that was not", async () => {
      populated();
      state.timesPreached = 9;
      state.preaching = [
        occasion("p1", "His Grace is Sufficient", {
          timeOfDay: "pm",
          venue: { id: "v1", name: "Grace Chapel", locality: "Springfield" },
          context: { id: "x1", name: "Revival" },
        }),
        // The same sermon again, the same day: a second row, not a count.
        occasion("p2", "His Grace is Sufficient", { timeOfDay: "am" }),
        occasion("p3", "An Old Sermon", {
          preachedOn: "2026-09-06",
          sermon: { id: "z9", title: "An Old Sermon", kind: "point", archivedAt: new Date() },
        }),
      ];
      await show();

      const section = within(screen.getByRole("region", { name: "Recent Preaching" }));
      const [evening, morning, old] = within(
        section.getByRole("list", { name: "Recent Preaching" }),
      ).getAllByRole("listitem");
      expect(evening).toHaveTextContent("Oct 11, 2026");
      expect(evening).toHaveTextContent("PM");
      expect(evening).toHaveTextContent("Grace Chapel, Springfield · Revival");
      expect(
        within(evening).getByRole("link", {
          name: "His Grace is Sufficient, preached Oct 11, 2026 PM: view its record",
        }),
      ).toHaveAttribute("href", "/library/preaching-record?sermon=a1");

      expect(morning).toHaveTextContent("AM");
      expect(morning).not.toHaveTextContent("·");
      // No part of the day was recorded for this one, and none is supposed.
      expect(old).toHaveTextContent("Sep 6, 2026");
      expect(old.textContent).not.toMatch(/AM|PM/);
      // Its sermon was put away and refiled since; the occasion stands.
      expect(old).toHaveTextContent("Archived");
      expect(old).toHaveTextContent("Now filed as: Point idea");

      expect(section.getByRole("link", { name: "Open Preaching Record" })).toHaveAttribute(
        "href",
        "/library/preaching-record",
      );
      expect(figures()["Times Preached"]).toBe("9");
    });

    it("says nothing is recorded yet for an account with a sermon and no preaching", async () => {
      populated();
      await show();
      const section = within(screen.getByRole("region", { name: "Recent Preaching" }));
      expect(section.getByText(/Nothing recorded yet/)).toBeVisible();
      expect(section.queryByRole("list")).not.toBeInTheDocument();
      // Ideas with no preaching is not a new account.
      expect(screen.queryByRole("heading", { name: "Start with an idea" })).not.toBeInTheDocument();
    });

    it("is left out for an account with no sermon to preach", async () => {
      state.ideas = [idea("b2", "Faith speaks", "point")];
      state.counts = { sermons: 0, points: 1, developing: 0 };
      await show();
      expect(screen.queryByRole("region", { name: "Recent Preaching" })).not.toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Recent Ideas" })).toBeVisible();
    });

    it("stands by itself for an account whose ideas are all put away", async () => {
      state.timesPreached = 1;
      state.preaching = [
        occasion("p1", "An Old Sermon", {
          sermon: { id: "z9", title: "An Old Sermon", kind: "sermon", archivedAt: new Date() },
        }),
      ];
      await show();
      expect(screen.getByRole("region", { name: "Recent Preaching" })).toBeVisible();
      expect(screen.queryByRole("heading", { name: "Start with an idea" })).not.toBeInTheDocument();
      for (const name of ["Continue Working", "Revisit an Idea", "Recent Ideas"]) {
        expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
      }
      // Recording is still offered.
      expect(screen.getByRole("button", { name: "Record preaching" })).toBeVisible();
    });
  });

  describe("At a Glance", () => {
    it("shows the four figures the database counted", async () => {
      populated();
      state.counts = { sermons: 12, points: 30, developing: 4 };
      state.timesPreached = 57;
      await show();
      expect(figures()).toEqual({
        "Sermon Ideas": "12",
        "Point Ideas": "30",
        "In Development": "4",
        "Times Preached": "57",
      });
      expect(screen.queryByRole("link", { name: /analytics/i })).not.toBeInTheDocument();
    });

    it("says a figure is unavailable when it could not be counted, never zero", async () => {
      populated();
      state.countsDown = true;
      state.timesPreached = 3;
      await show();
      expect(figures()).toEqual({
        "Sermon Ideas": "Unavailable",
        "Point Ideas": "Unavailable",
        "In Development": "Unavailable",
        "Times Preached": "3",
      });
      // The rest of the workspace is still there.
      expect(screen.getByRole("region", { name: "Recent Ideas" })).toBeVisible();
    });
  });

  it("is in Spanish for an account that reads Spanish", async () => {
    testPreferences.locale = "es";
    populated();
    state.working = [
      idea("a1", "Su gracia basta", "sermon", {
        status: "developing",
        lastDevelopedAt: new Date("2026-10-09T10:00:00Z"),
      }),
    ];
    state.outlines = new Map([["a1", { id: "o1", entryCount: 1, updatedAt: new Date() }]]);
    state.preaching = [occasion("p1", "Su gracia basta", { timeOfDay: "am" })];
    state.timesPreached = 1;
    state.countsDown = true;
    await show();

    expect(
      screen.getByRole("heading", { level: 1, name: "Te damos la bienvenida, Ada" }),
    ).toBeVisible();
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("button", { name: "Iniciar o abrir bosquejo" })).toBeVisible();
    expect(header.getByRole("button", { name: "Registrar predicación" })).toBeVisible();

    const working = screen.getByRole("region", { name: "Continúa trabajando" });
    expect(working).toHaveTextContent(/Bosquejo.*1 entrada/);
    expect(
      within(working).getByRole("link", { name: "Retomar el bosquejo de Su gracia basta" }),
    ).toHaveAttribute("href", "/outlines/o1");
    expect(screen.getByRole("region", { name: "Retoma una idea" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Ideas recientes" })).toHaveTextContent(
      "Idea de sermón",
    );
    expect(
      within(screen.getByRole("region", { name: "Predicación reciente" })).getByRole("link", {
        name: "Abrir Registro de predicación",
      }),
    ).toHaveAttribute("href", "/library/preaching-record");
    expect(figures()).toEqual({
      "Ideas de sermón": "No disponible",
      "Ideas de punto": "No disponible",
      "En desarrollo": "No disponible",
      "Veces predicado": "1",
    });
    // Nothing English is left on the page's own surfaces.
    expect(document.body.textContent).not.toMatch(
      /Continue Working|Recent Ideas|Recent Preaching|At a Glance|Unavailable|Last developed/,
    );
  });

  it("is the empty workspace in Spanish too", async () => {
    testPreferences.locale = "es";
    await show();
    expect(screen.getByRole("heading", { name: "Empieza con una idea" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Capturar una idea" })).toBeVisible();
  });
});
