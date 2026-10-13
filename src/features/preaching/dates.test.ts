// @vitest-environment node
import { describe, expect, it } from "vitest";

import { formatDay, localDate, splitDuration } from "./dates";

describe("calendar dates in preaching history", () => {
  it("reads today from the person's own clock, not from UTC", () => {
    // Late on a Sunday evening and early on a Sunday morning are both that Sunday,
    // whichever side of Greenwich the clock is on.
    expect(localDate(new Date(2026, 9, 4, 23, 45))).toBe("2026-10-04");
    expect(localDate(new Date(2026, 9, 4, 0, 15))).toBe("2026-10-04");
    expect(localDate(new Date(2026, 0, 1, 0, 0))).toBe("2026-01-01");
    expect(localDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("writes a date as the day it names, in each language", () => {
    expect(formatDay("2026-10-04", "en")).toBe("Oct 4, 2026");
    expect(formatDay("2026-01-01", "en")).toBe("Jan 1, 2026");
    expect(formatDay("2026-12-31", "en")).toBe("Dec 31, 2026");
    expect(formatDay("2026-10-04", "es")).toMatch(/^4 oct 2026$/);
    // What is not a date is shown as it was written, never as another day.
    expect(formatDay("2026-02-30", "en")).toBe("2026-02-30");
  });

  it("splits whole minutes into hours and minutes", () => {
    expect(splitDuration(0)).toEqual({ hours: 0, minutes: 0 });
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitDuration(60)).toEqual({ hours: 1, minutes: 0 });
    expect(splitDuration(75)).toEqual({ hours: 1, minutes: 15 });
  });
});
