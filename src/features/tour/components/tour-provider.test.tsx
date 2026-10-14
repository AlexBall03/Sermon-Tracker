import { useSyncExternalStore } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ReadingProvider } from "@/features/preferences/client";
import { I18nProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";

/*
 * The tour over a stand-in for the application: the bar's and the tab bar's
 * named controls on every page, and the dashboard's sections where a test
 * puts them. The router is a small store, so a navigation the tour asks for
 * arrives as it would. The actions are mocked: this is what the tour asks of
 * them, and when.
 */
const nav = vi.hoisted(() => {
  let path = "/settings";
  const listeners = new Set<() => void>();
  return {
    get: () => path,
    set(next: string) {
      path = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    pushed: [] as string[],
  };
});
const actions = vi.hoisted(() => ({
  completeProductTour: vi.fn(async () => ({ ok: true, message: "" })),
  dismissProductTour: vi.fn(async () => ({ ok: true, message: "" })),
  markTourOffered: vi.fn(async () => ({ ok: true, message: "" })),
}));

vi.mock("../actions", () => actions);
const router = {
  push: (href: string) => {
    nav.pushed.push(href);
    nav.set(href);
  },
};
vi.mock("next/navigation", () => ({
  usePathname: () => useSyncExternalStore(nav.subscribe, nav.get, nav.get),
  useRouter: () => router,
}));

import { TourInvitation } from "./tour-invitation";
import { TourProvider, useTour } from "./tour-provider";

let wide = true;
const sections = { present: [] as string[], preachingLink: true };

function Page() {
  const path = useSyncExternalStore(nav.subscribe, nav.get, nav.get);
  const narrow = !wide;
  return (
    <>
      <header>
        <button data-tour="quick-capture" hidden={narrow}>
          Capture
        </button>
        {["dashboard", "library", "outlines", "bible"].map((id) => (
          <a key={id} href={`/${id}`} data-tour={`nav-${id}`} hidden={narrow}>
            {id}
          </a>
        ))}
      </header>
      <main>
        <h1>Page at {path}</h1>
        {path === "/dashboard" && (
          <div data-tour="dashboard-workspace">
            {sections.present.map((name) => (
              <section key={name} data-tour={name} />
            ))}
          </div>
        )}
        {path === "/library/preaching-record" && sections.preachingLink && (
          <span data-tour="section-preaching-record">Preaching Record</span>
        )}
      </main>
      <nav>
        <button data-tour="tab-quick-capture" hidden={!narrow}>
          +
        </button>
        {["dashboard", "library", "outlines", "bible"].map((id) => (
          <a key={id} href={`/${id}`} data-tour={`tab-${id}`} hidden={!narrow}>
            {id}
          </a>
        ))}
      </nav>
    </>
  );
}

function StartButton() {
  return <button onClick={useTour().start}>Restart Product Tour</button>;
}

function renderTour({
  locale = "en",
  translations = ["kjv", "rvg"],
  invite = false,
}: { locale?: Locale; translations?: ("kjv" | "rvg")[]; invite?: boolean } = {}) {
  return render(
    <I18nProvider locale={locale}>
      <ReadingProvider translation={translations[0]} translations={translations}>
        <TourProvider>
          <Page />
          {invite ? <TourInvitation /> : <StartButton />}
        </TourProvider>
      </ReadingProvider>
    </I18nProvider>,
  );
}

const dialog = () => screen.findByRole("dialog");
const title = () => screen.getByRole("dialog").querySelector("h2")?.textContent;
/** Next, once the step's page has arrived and what it points at was looked for. */
async function next(name = /next/i) {
  const button = await screen.findByRole("button", { name });
  await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "false"), { timeout: 5000 });
  fireEvent.click(button);
}

beforeEach(() => {
  wide = true;
  Object.assign(sections, { present: [], preachingLink: true });
  nav.set("/settings");
  nav.pushed.length = 0;
  Object.values(actions).forEach((action) => action.mockClear());
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width") ? wide : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  // jsdom lays nothing out, so nothing resizes, and an element is seen unless it is hidden.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (
    this: HTMLElement,
  ) {
    return (this.closest("[hidden]") ? [] : [{}]) as unknown as DOMRectList;
  });
});

afterEach(() => {
  // Unmounted first, so nothing it scheduled outlives the stand-ins it needs.
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the product tour", () => {
  it("goes through its seven stops in order, on their own pages, and finishes", async () => {
    sections.present = ["continue-working", "at-a-glance"];
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Restart Product Tour" }));

    await dialog();
    await waitFor(() => expect(title()).toBe("Your Dashboard"));
    expect(nav.get()).toBe("/dashboard");
    expect(screen.getByText("Step 1 of 7")).toBeInTheDocument();
    // Only the sections that are there are named.
    await waitFor(() =>
      expect(screen.getByText(/Continue Working, the sermons/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Revisit an Idea, unfinished/)).not.toBeInTheDocument();

    const seen: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      seen.push(title() ?? "");
      await next();
      await waitFor(() => expect(title()).not.toBe(seen.at(-1)));
    }
    seen.push(title() ?? "");
    expect(seen).toEqual([
      "Your Dashboard",
      "Capture an Idea",
      "Your Library",
      "The Bible",
      "Outlines",
      "Preaching Record",
      "You're ready to begin.",
    ]);
    expect(nav.pushed).toEqual([
      "/dashboard",
      "/library",
      "/bible",
      "/outlines",
      "/library/preaching-record",
      "/dashboard",
    ]);

    await next(/finish tour/i);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(actions.completeProductTour).toHaveBeenCalledOnce();
    expect(actions.dismissProductTour).not.toHaveBeenCalled();
  });

  it("goes back a stop, to its page, without saving anything", async () => {
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Restart Product Tour" }));
    await dialog();
    await next();
    await next();
    await waitFor(() => expect(title()).toBe("Your Library"));

    const back = screen.getByRole("button", { name: /back/i });
    await waitFor(() => expect(back).toHaveAttribute("aria-disabled", "false"));
    fireEvent.click(back);
    await waitFor(() => expect(title()).toBe("Capture an Idea"));
    expect(nav.get()).toBe("/dashboard");
    expect(Object.values(actions).every((action) => action.mock.calls.length === 0)).toBe(true);
  });

  it("can be skipped at any stop, by the button or by Escape, and says so once", async () => {
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Restart Product Tour" }));
    await dialog();
    fireEvent.click(screen.getByRole("button", { name: "Skip Tour" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(actions.dismissProductTour).toHaveBeenCalledOnce();

    // A click focuses the button it lands on, in a browser; here it is said outright.
    const restart = screen.getByRole("button", { name: "Restart Product Tour" });
    restart.focus();
    fireEvent.click(restart);
    await dialog();
    await next();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(actions.dismissProductTour).toHaveBeenCalledTimes(2);
    expect(actions.completeProductTour).not.toHaveBeenCalled();
    // Focus goes back to what started it.
    await waitFor(() => expect(restart).toHaveFocus());
  });

  it("carries on when what a stop points at is not there", async () => {
    sections.preachingLink = false;
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Restart Product Tour" }));
    await dialog();
    // A new account's dashboard: no section to name, and a word that more will come.
    await waitFor(() => expect(screen.getByText(/More sections appear here/)).toBeInTheDocument());
    expect(screen.queryByText("On your dashboard now:")).not.toBeInTheDocument();
    for (let step = 0; step < 5; step += 1) await next();
    await waitFor(() => expect(title()).toBe("Preaching Record"));
    // The library's own destination is pointed out instead, and the tour goes on.
    await next();
    await waitFor(() => expect(title()).toBe("You're ready to begin."));
  });

  it("on a narrow screen points at the tab bar, not the hidden link row", async () => {
    wide = false;
    renderTour();
    fireEvent.click(screen.getByRole("button", { name: "Restart Product Tour" }));
    await dialog();
    await next();
    await waitFor(() => expect(title()).toBe("Capture an Idea"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /next/i })).toHaveAttribute(
        "aria-disabled",
        "false",
      ),
    );
  });

  it("names only the translations on offer, and speaks the interface's language", async () => {
    renderTour({ translations: ["kjv"] });
    fireEvent.click(screen.getByRole("button", { name: "Restart Product Tour" }));
    await dialog();
    for (let step = 0; step < 3; step += 1) await next();
    await waitFor(() => expect(title()).toBe("The Bible"));
    expect(screen.getByText(/^Read the KJV here\./)).toBeInTheDocument();
  });

  it("in Spanish", async () => {
    renderTour({ locale: "es" });
    fireEvent.click(screen.getByRole("button", { name: "Restart Product Tour" }));
    await dialog();
    await waitFor(() => expect(title()).toBe("Tu inicio"));
    expect(screen.getByText("Paso 1 de 7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saltar recorrido" })).toBeInTheDocument();
  });
});

describe("the dashboard's invitation", () => {
  it("records that it was offered, and starts the tour only when asked", async () => {
    nav.set("/dashboard");
    renderTour({ invite: true });
    expect(screen.getByRole("heading", { name: "Take a quick tour" })).toBeInTheDocument();
    await waitFor(() => expect(actions.markTourOffered).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Take the Tour" }));
    await dialog();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Take a quick tour" })).not.toBeInTheDocument(),
    );
    expect(actions.dismissProductTour).not.toHaveBeenCalled();
  });

  it("keeps Maybe Later and folds away without starting anything", async () => {
    nav.set("/dashboard");
    renderTour({ invite: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Maybe Later" }));
    });
    expect(actions.dismissProductTour).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Take a quick tour" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
