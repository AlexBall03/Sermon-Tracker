import "server-only";

import { getPreferences } from "@/features/preferences/current";
import { dictionary, type Dictionaries, type Feature } from "./index";
import type { Locale } from "./locales";

/**
 * The interface language for this request: the signed-in account's, or the
 * language cookie's before signing in, and English whenever Spanish is
 * switched off. Decided once per request.
 */
export async function getLocale(): Promise<Locale> {
  return (await getPreferences()).locale;
}

/** One feature's strings in this request's language, for Server Components, actions, and routes. */
export async function getT<F extends Feature>(feature: F): Promise<Dictionaries[F]> {
  return dictionary(await getLocale(), feature);
}
