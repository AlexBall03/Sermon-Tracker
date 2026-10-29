import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ push: vi.fn(), discarded: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));

import { hasUnsavedWork } from "@/lib/unsaved-work";
import { useLeaveGuard } from "./leave-guard";

function Page({ startDirty = true }: { startDirty?: boolean }) {
  const [dirty, setDirty] = useState(startDirty);
  const guard = useLeaveGuard(dirty, "Your changes have not been saved.", state.discarded);
  return (
    <>
      <button onClick={() => setDirty((value) => !value)}>Toggle</button>
      <button
        onClick={() => {
          guard.allowLeaving();
          state.push("/after-delete");
        }}
      >
        Delete
      </button>
      <a href="/dashboard">Dashboard</a>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a plain anchor is the case under test */}
      <a href="/library/1#notes">Same page</a>
      <a href="/dashboard" target="_blank">
        New tab
      </a>
      <a href="https://example.com/">Elsewhere</a>
      {guard.dialog}
    </>
  );
}

/** Clicks a link and reports whether the click was held back. */
function follow(name: string, init?: MouseEventInit) {
  const link = screen.getByRole("link", { name });
  // jsdom cannot navigate; note only whether the guard stopped the click first.
  const reached = vi.fn((event: Event) => event.preventDefault());
  link.addEventListener("click", reached);
  fireEvent.click(link, init);
  return reached.mock.calls.length === 0;
}

const unloadIsWarned = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

const dialog = () => screen.findByRole("alertdialog", { name: "Leave without saving?" });

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/library/1");
});

describe("useLeaveGuard", () => {
  it("does nothing while there is nothing to lose", () => {
    render(<Page startDirty={false} />);
    const entries = window.history.length;
    expect(follow("Dashboard")).toBe(false);
    expect(unloadIsWarned()).toBe(false);
    expect(window.history.length).toBe(entries);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("tells an update of the application that work is unsaved, for as long as it is", async () => {
    render(<Page />);
    expect(hasUnsavedWork()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(hasUnsavedWork()).toBe(false);
    await removed();
  });

  it("warns before the tab is closed or reloaded", async () => {
    render(<Page />);
    expect(unloadIsWarned()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(unloadIsWarned()).toBe(false);
    await removed();
  });

  it("holds a link to another page and asks; staying keeps the page", async () => {
    render(<Page />);
    expect(follow("Dashboard")).toBe(true);
    expect(await dialog()).toHaveTextContent("Your changes have not been saved.");

    fireEvent.click(screen.getByRole("button", { name: "Stay on this page" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(state.push).not.toHaveBeenCalled();
    expect(state.discarded).not.toHaveBeenCalled();
    // Still guarded.
    expect(follow("Dashboard")).toBe(true);
  });

  it("goes where the link led once leaving is confirmed", async () => {
    render(<Page />);
    follow("Dashboard");
    await dialog();
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(state.push).toHaveBeenCalledWith("/dashboard");
    // The work is thrown away before going, not left behind on the page.
    expect(state.discarded).toHaveBeenCalledTimes(1);
    // The navigation that follows is not questioned again.
    expect(unloadIsWarned()).toBe(false);
  });

  it("leaves alone what does not leave the page", () => {
    render(<Page />);
    expect(follow("Same page")).toBe(false);
    expect(follow("New tab")).toBe(false);
    expect(follow("Dashboard", { ctrlKey: true })).toBe(false);
    // Another site unloads the page; the browser's own warning covers that.
    expect(follow("Elsewhere")).toBe(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("lets deliberate navigation through", () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(state.push).toHaveBeenCalledWith("/after-delete");
    expect(unloadIsWarned()).toBe(false);
    expect(follow("Dashboard")).toBe(false);
  });

  it("undoes the Back button and asks, keeping the router out of it", async () => {
    render(<Page />);
    // The guard added one entry for the same page, marked as its own.
    expect(window.history.state).toMatchObject({ __leaveGuard: expect.any(String) });

    const router = vi.fn();
    window.addEventListener("popstate", router);
    const push = vi.spyOn(History.prototype, "pushState");
    // Back lands on the page's own entry: the same address, without the mark.
    window.history.replaceState(null, "", "/library/1");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));

    expect(router).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.history.state).toMatchObject({ __leaveGuard: expect.any(String) });
    await dialog();

    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(go).toHaveBeenCalledWith(-2);
    window.removeEventListener("popstate", router);
    vi.restoreAllMocks();
  });

  it("returns from a Forward move to another page and asks", async () => {
    render(<Page />);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    window.history.replaceState(null, "", "/somewhere-else");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(go).toHaveBeenCalledWith(-1);
    await dialog();

    // The guard's own return trip is not another question.
    window.history.replaceState({ __leaveGuard: true }, "", "/library/1");
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }));
    expect(go).toHaveBeenLastCalledWith(1);
    vi.restoreAllMocks();
  });

  it("never adds more than one history entry, however often the page becomes unsaved", async () => {
    render(<Page startDirty={false} />);
    const entries = window.history.length;
    const toggle = screen.getByRole("button", { name: "Toggle" });
    for (let cycle = 0; cycle < 3; cycle += 1) {
      fireEvent.click(toggle);
      expect(window.history.length).toBe(entries + 1);
      expect(marked()).toBe(true);
      fireEvent.click(toggle);
      await removed();
    }
    expect(window.history.length).toBe(entries + 1);
  });

  it("takes its entry away once nothing is unsaved, without the router seeing it", async () => {
    const router = vi.fn();
    window.addEventListener("popstate", router);
    render(<Page />);
    expect(marked()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await removed();
    // Back on the page's own entry, at the same address, and the router never told.
    expect(window.location.pathname).toBe("/library/1");
    expect(router).not.toHaveBeenCalled();
    window.removeEventListener("popstate", router);
  });

  it("lets the person's own Back through after the entry is gone", async () => {
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await removed();
    // A later popstate is the person's, never swallowed (the removal's wait has ended).
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const router = vi.fn();
    window.addEventListener("popstate", router);
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    expect(router).toHaveBeenCalledTimes(1);
    window.removeEventListener("popstate", router);
  });

  it("moves no history when the page goes away or leaving was agreed", async () => {
    const back = vi.spyOn(window.history, "back");
    const { unmount } = render(<Page />);
    unmount();
    await settle();
    expect(back).not.toHaveBeenCalled();

    window.history.replaceState(null, "", "/library/1");
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await settle();
    expect(back).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("takes away only its own entry, on top, at its own address", async () => {
    const back = vi.spyOn(window.history, "back");
    render(<Page />);
    // The entry on top is no longer the guard's (another page's code replaced it).
    window.history.replaceState({ other: true }, "", "/library/1");
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await settle();
    expect(back).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("keeps the entry while another guard on the page still holds work", async () => {
    const back = vi.spyOn(window.history, "back");
    render(
      <>
        <Page />
        <Second />
      </>,
    );
    expect(marked()).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Toggle" })[0]);
    await settle();
    expect(back).not.toHaveBeenCalled();
    expect(marked()).toBe(true);
    // The last one done: now it goes.
    fireEvent.click(screen.getByRole("button", { name: "Toggle second" }));
    await settle();
    expect(back).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

function Second() {
  const [dirty, setDirty] = useState(true);
  const guard = useLeaveGuard(dirty, "Second form unsaved.");
  return (
    <>
      <button onClick={() => setDirty((value) => !value)}>Toggle second</button>
      {guard.dialog}
    </>
  );
}

const marked = () => {
  const state: unknown = window.history.state;
  return typeof state === "object" && state !== null && "__leaveGuard" in state;
};
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 60)));
/** Waits for the guard's own Back to land on the page's entry beneath. */
async function removed() {
  await act(async () => {
    for (let i = 0; i < 40 && marked(); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
  expect(marked()).toBe(false);
}
