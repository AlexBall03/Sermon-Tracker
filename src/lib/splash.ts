import type { NextRequest, NextResponse } from "next/server";

/*
 * When the splash screen is shown. The proxy decides, because only the server
 * knows on the very first byte whether this is a first visit or the first
 * request after signing in; it says so with a short-lived cookie that the
 * page reads before it paints (see components/layout/splash-screen.tsx).
 *
 * `st_seen` remembers, for the browser session, who the site was last shown
 * to. `st_splash` is the one-time signal to the page.
 */

export const seenCookie = "st_seen";
export const splashCookie = "st_splash";
/** Long enough to survive a chain of redirects after sign-in; short enough to be one-time. */
export const splashSignalSeconds = 30;

/**
 * The splash is shown on the first page of a browser session, and on the
 * first page after signing in (as anyone, new or returning). Signing out is
 * remembered quietly, so the next sign-in counts as a first one again.
 */
export function splashDecision(seen: string | undefined, userId: string | null) {
  const state = userId ? `u:${userId}` : "guest";
  const show = seen === undefined || (userId !== null && seen !== state);
  return { show, seen: state };
}

/** Records who is being shown the site and, when it is due, signals the splash. */
export function applySplash<Response extends NextResponse>(
  request: NextRequest,
  response: Response,
  userId: string | null,
): Response {
  // Data and API requests are not pages.
  if (request.nextUrl.pathname.startsWith("/api")) return response;

  const before = request.cookies.get(seenCookie)?.value;
  const { show, seen } = splashDecision(before, userId);
  if (before !== seen) {
    // A session cookie: a new browser session is a first visit again.
    response.cookies.set(seenCookie, seen, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }
  if (show) {
    // Read by the page's own script, so it cannot be httpOnly. It carries no information.
    response.cookies.set(splashCookie, "1", {
      path: "/",
      sameSite: "lax",
      maxAge: splashSignalSeconds,
    });
  }
  return response;
}
