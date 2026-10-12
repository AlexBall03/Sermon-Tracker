import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ useReverification: vi.fn(), useSession: vi.fn() }));

import { describeDevice, describeLocation, orderSessions } from "./use-sessions";

describe("the order of sessions", () => {
  it("is this device, then the others from the most recently active", () => {
    const entry = (id: string, day: number, current = false) => ({
      id,
      current,
      device: "Chrome on Windows",
      location: null,
      ipAddress: null,
      lastActiveAt: new Date(2026, 0, day),
    });
    const sessions = [entry("old", 1), entry("this", 2, true), entry("new", 9), entry("mid", 5)];
    expect(orderSessions(sessions).map((session) => session.id)).toEqual([
      "this",
      "new",
      "mid",
      "old",
    ]);
  });
});

describe("session descriptions", () => {
  it("names the browser and device when both are known", () => {
    expect(describeDevice({ id: "a", browserName: "Chrome", deviceType: "Windows" })).toBe(
      "Chrome on Windows",
    );
  });

  it("degrades to whatever was recorded", () => {
    expect(describeDevice({ id: "a", browserName: "Safari" })).toBe("Safari");
    expect(describeDevice({ id: "a", isMobile: true })).toBe("Mobile device");
    expect(describeDevice({ id: "a" })).toBe("Unknown device");
    expect(describeDevice(null)).toBe("Unknown device");
  });

  it("joins city and country, or reports nothing", () => {
    expect(describeLocation({ id: "a", city: "Leeds", country: "GB" })).toBe("Leeds, GB");
    expect(describeLocation({ id: "a", country: "GB" })).toBe("GB");
    expect(describeLocation({ id: "a" })).toBeNull();
  });
});
