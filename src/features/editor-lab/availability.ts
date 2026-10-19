import { NextResponse } from "next/server";

/*
 * The editor lab (PS-1A) exists only in development. Everywhere else every
 * address under /lab is answered 404 by the proxy, before Clerk or the
 * database is reached, and the page itself refuses again as defense in depth.
 * A page in the (app) shell streams, so only the proxy can give a real 404
 * status; the page's own notFound() would arrive after a 200.
 */

/** The lab's addresses: /lab itself and anything beneath it. */
export const labRoot = "/lab";

/** Whether the lab may be served at all. Only `next dev` sets development. */
export function labAvailable(environment: string | undefined = process.env.NODE_ENV): boolean {
  return environment === "development";
}

export function isLabPath(pathname: string): boolean {
  return pathname === labRoot || pathname.startsWith(`${labRoot}/`);
}

/** A 404 for a lab address outside development, or null to carry on. */
export function labGuard(
  pathname: string,
  environment: string | undefined = process.env.NODE_ENV,
): NextResponse | null {
  if (!isLabPath(pathname) || labAvailable(environment)) return null;
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
