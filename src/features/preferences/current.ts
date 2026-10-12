import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { getAccess } from "@/features/auth/access";
import { isLocale, localeCookie } from "@/i18n/locales";
import { storedPreferences } from "./preferences";
import { defaultStoredPreferences, resolvePreferences, type Preferences } from "./resolve";
import { getAppSettings } from "./settings";

/**
 * The language and translation in force for this request, with the
 * administrator's switch applied (see `resolvePreferences`). Every page,
 * action, and route that shows a language or serves Bible text asks here, so
 * the switch is enforced in one place and on the server.
 *
 * Signed in, they are the account's. Before signing in there is no account,
 * and the interface language is the language cookie's; the Bible is not
 * reachable then.
 */
export const getPreferences = cache(async (): Promise<Preferences> => {
  // One after the other: the access check is what marks the request as one that cannot
  // be prerendered, and the database must not be read before it has.
  const access = await getAccess();
  const settings = await getAppSettings();
  if (access.state === "active") {
    return resolvePreferences(storedPreferences(access.user), settings.spanishEnabled);
  }
  const cookie = (await cookies()).get(localeCookie)?.value;
  return resolvePreferences(
    { ...defaultStoredPreferences, locale: isLocale(cookie) ? cookie : "en" },
    settings.spanishEnabled,
  );
});
