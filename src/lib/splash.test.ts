// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it } from "vitest";

import { applySplash, seenCookie, splashCookie, splashDecision } from "./splash";

describe("splashDecision", () => {
  it("shows the splash on the first page of a browser session, signed in or not", () => {
    expect(splashDecision(undefined, null)).toEqual({ show: true, seen: "guest" });
    expect(splashDecision(undefined, "user_1")).toEqual({ show: true, seen: "u:user_1" });
  });

  it("shows it on the first page after signing in, new or returning", () => {
    expect(splashDecision("guest", "user_1")).toEqual({ show: true, seen: "u:user_1" });
    // A different person signing in on the same browser is a first sign-in too.
    expect(splashDecision("u:user_1", "user_2")).toEqual({ show: true, seen: "u:user_2" });
  });

  it("stays out of the way after that", () => {
    expect(splashDecision("guest", null).show).toBe(false);
    expect(splashDecision("u:user_1", "user_1").show).toBe(false);
  });

  it("notes a sign-out quietly, so the next sign-in counts again", () => {
    expect(splashDecision("u:user_1", null)).toEqual({ show: false, seen: "guest" });
    expect(splashDecision("guest", "user_1").show).toBe(true);
  });
});

describe("applySplash", () => {
  const request = (path: string, cookie?: string) =>
    new NextRequest(`https://sermontracker.com${path}`, {
      headers: cookie ? { cookie } : undefined,
    });
  const cookies = (response: NextResponse) => ({
    seen: response.cookies.get(seenCookie),
    signal: response.cookies.get(splashCookie),
  });

  it("signals the splash and remembers a first visit", () => {
    const { seen, signal } = cookies(applySplash(request("/"), NextResponse.next(), null));
    expect(seen).toMatchObject({ value: "guest", httpOnly: true, sameSite: "lax", secure: true });
    // A session cookie: a new browser session is a first visit again.
    expect(seen?.maxAge).toBeUndefined();
    // The page's script must be able to read the signal, and it is short-lived.
    expect(signal).toMatchObject({ value: "1", maxAge: 30 });
    expect(signal?.httpOnly).toBeFalsy();
  });

  it("signals it on the redirect that follows a sign-in", () => {
    const redirect = NextResponse.redirect("https://sermontracker.com/dashboard");
    const { seen, signal } = cookies(
      applySplash(request("/", `${seenCookie}=guest`), redirect, "user_1"),
    );
    expect(seen?.value).toBe("u:user_1");
    expect(signal?.value).toBe("1");
  });

  it("sets nothing when nothing has changed", () => {
    const { seen, signal } = cookies(
      applySplash(request("/library", `${seenCookie}=u:user_1`), NextResponse.next(), "user_1"),
    );
    expect(seen).toBeUndefined();
    expect(signal).toBeUndefined();
  });

  it("records a sign-out without a splash", () => {
    const { seen, signal } = cookies(
      applySplash(request("/", `${seenCookie}=u:user_1`), NextResponse.next(), null),
    );
    expect(seen?.value).toBe("guest");
    expect(signal).toBeUndefined();
  });

  it("ignores requests that are not pages", () => {
    const { seen, signal } = cookies(
      applySplash(request("/api/bible/1/1"), NextResponse.next(), "user_1"),
    );
    expect(seen).toBeUndefined();
    expect(signal).toBeUndefined();
  });
});
