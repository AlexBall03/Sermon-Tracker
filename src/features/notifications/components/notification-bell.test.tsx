import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  markAllNotificationsRead: vi.fn(async () => {}),
  markNotificationsRead: vi.fn(async () => {}),
}));

import { NotificationBell } from "./notification-bell";

// jsdom lays nothing out; the bell asks only when it is on screen.
beforeEach(() => {
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NotificationBell", () => {
  it("asks for the summary and says how many are unread", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        unread: 2,
        items: [
          {
            id: "n1",
            kind: "reply",
            ticketId: "t1",
            subject: "Search is slow",
            status: null,
            createdAt: new Date().toISOString(),
            read: false,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<NotificationBell />);
    expect(await screen.findByRole("button", { name: "Notifications, 2 unread" })).toBeVisible();
    expect(fetch).toHaveBeenCalledWith("/api/notifications", { cache: "no-store" });
  });

  it("stays a plain bell when the summary cannot be read", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    render(<NotificationBell />);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible();
  });
});
