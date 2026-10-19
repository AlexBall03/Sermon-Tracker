import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  markAllNotificationsRead: vi.fn(async () => {}),
  markNotificationsRead: vi.fn(async () => {}),
}));

import { markAllNotificationsRead, markNotificationsRead } from "../actions";
import { minRefreshMs, pollMs, type NotificationSummary } from "../model";
import { NotificationBell } from "./notification-bell";

const item = (id: string, read = false) => ({
  id,
  kind: "reply" as const,
  ticketId: "t1",
  subject: "Search is slow",
  status: null,
  createdAt: new Date().toISOString(),
  read,
});

let online = true;
let visibility: DocumentVisibilityState = "visible";
let shown = true;
let worker: EventTarget;

/** A fetch that answers `summary` (the latest value) each time it is called. */
function serve(summary: () => NotificationSummary) {
  const fetch = vi.fn(async () => Response.json(summary()));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

/** Lets the bell's timers and promises run, inside act. */
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  visibility = "visible";
  shown = true;
  // jsdom lays nothing out; the bell asks only when it is on screen.
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    () => (shown ? [{}] : []) as unknown as DOMRectList,
  );
  vi.spyOn(Navigator.prototype, "onLine", "get").mockImplementation(() => online);
  vi.spyOn(Document.prototype, "visibilityState", "get").mockImplementation(() => visibility);
  worker = new EventTarget();
  Object.defineProperty(navigator, "serviceWorker", { value: worker, configurable: true });
});
afterEach(() => {
  // @ts-expect-error -- jsdom has no service worker; the stub is removed again.
  delete navigator.serviceWorker;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(markNotificationsRead).mockClear();
  vi.mocked(markAllNotificationsRead).mockClear();
});

describe("NotificationBell", () => {
  it("asks for the summary and says how many are unread", async () => {
    const fetch = serve(() => ({ unread: 2, items: [item("n1")] }));
    render(<NotificationBell />);
    await tick();
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/notifications",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("stays a plain bell when the summary cannot be read, and does not retry", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    render(<NotificationBell />);
    await tick(minRefreshMs * 4);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });

  it("falls back to one ask every 15 minutes, not every minute", async () => {
    const fetch = serve(() => ({ unread: 0, items: [] }));
    render(<NotificationBell />);
    await tick();
    await tick(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await tick(pollMs - 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await tick(pollMs * 3);
    expect(fetch).toHaveBeenCalledTimes(5); // about four an hour
  });

  it("never asks from a bell that is off screen", async () => {
    shown = false;
    const fetch = serve(() => ({ unread: 0, items: [] }));
    render(<NotificationBell />);
    await tick(pollMs * 2);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      worker.dispatchEvent(
        new MessageEvent("message", { data: { type: "NOTIFICATIONS_CHANGED" } }),
      );
    });
    await tick();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks nothing while the tab is hidden, and asks when it is shown again", async () => {
    visibility = "hidden";
    const fetch = serve(() => ({ unread: 0, items: [] }));
    render(<NotificationBell />);
    await tick(pollMs * 2);
    expect(fetch).not.toHaveBeenCalled();
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("asks nothing while offline, and asks when the network comes back", async () => {
    online = false;
    const fetch = serve(() => ({ unread: 0, items: [] }));
    render(<NotificationBell />);
    await tick(pollMs * 2);
    act(() => window.dispatchEvent(new Event("focus")));
    await tick();
    expect(fetch).not.toHaveBeenCalled();
    online = true;
    act(() => window.dispatchEvent(new Event("online")));
    await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("makes one ask of focus and visibilitychange together, and throttles routine asks", async () => {
    const fetch = serve(() => ({ unread: 0, items: [] }));
    render(<NotificationBell />);
    await tick();
    await tick(minRefreshMs);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
    // Within the throttle window, routine triggers ask nothing more.
    await tick(minRefreshMs / 2);
    act(() => window.dispatchEvent(new Event("focus")));
    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("asks when the panel opens, past the throttle", async () => {
    const fetch = serve(() => ({ unread: 1, items: [item("n1")] }));
    render(<NotificationBell />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("link", { name: /Search is slow/ })).toHaveAttribute(
      "href",
      "/support/t1",
    );
    expect(screen.getByRole("link", { name: "View all notifications" })).toHaveAttribute(
      "href",
      "/notifications",
    );
  });

  it("asks when the service worker says a push arrived, and ignores other messages", async () => {
    const fetch = serve(() => ({ unread: 0, items: [] }));
    render(<NotificationBell />);
    await tick();
    act(() => {
      worker.dispatchEvent(new MessageEvent("message", { data: { type: "SOMETHING_ELSE" } }));
      worker.dispatchEvent(new MessageEvent("message", { data: "NOTIFICATIONS_CHANGED" }));
    });
    await tick();
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => {
      worker.dispatchEvent(
        new MessageEvent("message", { data: { type: "NOTIFICATIONS_CHANGED" } }),
      );
    });
    await tick();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("marks one read, keeps it read past an older answer, and asks again", async () => {
    let resolveSlow: (() => void) | undefined;
    let unreadOnServer = 1;
    const fetch = vi.fn(async () => {
      const body = { unread: unreadOnServer, items: [item("n1", unreadOnServer === 0)] };
      if (fetch.mock.calls.length === 2) {
        // The panel's ask is slow and answers from before the read.
        await new Promise<void>((resolve) => (resolveSlow = resolve));
      }
      return Response.json(body);
    });
    vi.stubGlobal("fetch", fetch);
    render(<NotificationBell />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    await tick();
    // The first ask answered, so the item is listed; the panel's ask is on its way.
    unreadOnServer = 0;
    fireEvent.click(screen.getByRole("link", { name: /Search is slow/ }));
    await tick();
    expect(markNotificationsRead).toHaveBeenCalledWith(["n1"]);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();

    resolveSlow?.();
    await tick();
    // The old answer (1 unread) was thrown away and a fresh one asked for.
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("marks all read and asks again", async () => {
    let unreadOnServer = 2;
    const fetch = serve(() => ({ unread: unreadOnServer, items: [item("n1"), item("n2")] }));
    render(<NotificationBell />);
    await tick();
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
    await tick();
    unreadOnServer = 0;
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    await tick();
    expect(markAllNotificationsRead).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });

  it("stops listening and asking once unmounted", async () => {
    const fetch = serve(() => ({ unread: 0, items: [] }));
    const removed = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<NotificationBell />);
    await tick();
    unmount();
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["focus", "online"]),
    );
    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
      worker.dispatchEvent(
        new MessageEvent("message", { data: { type: "NOTIFICATIONS_CHANGED" } }),
      );
    });
    await tick(pollMs * 2);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
