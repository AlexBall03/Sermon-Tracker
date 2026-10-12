import "server-only";

import { cookies, headers } from "next/headers";

import { isLocale, localeCookie, preferredLocale, type Locale } from "./locales";

/**
 * The language to use where no account says: the language cookie's when there
 * is one, and otherwise the browser's own. It is what the pages before sign-in
 * are written in, and what a new account starts with.
 */
export async function deviceLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(localeCookie)?.value;
  if (isLocale(cookie)) return cookie;
  return preferredLocale((await headers()).get("accept-language"));
}
