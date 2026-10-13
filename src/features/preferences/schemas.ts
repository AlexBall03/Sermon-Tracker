import { z } from "zod";

import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { profileLimits } from "./model";

/**
 * What an account may say about itself, and what is refused, said in one
 * language. There is no server code here, so the settings page, the server
 * action, and any later form (first-time setup, say) parse with the same rules.
 */
export function profileSchemas(locale: Locale = defaultLocale) {
  const t = dictionary(locale, "settings").ministry;

  /** A line of the person's own words, tidied. Blank is the same as cleared. */
  const line = (limit: number, tooLong: string) =>
    z
      .union([z.string(), z.null()], t.invalid)
      .transform((value) => value?.replace(/\s+/g, " ").trim() || null)
      .pipe(z.string().max(limit, tooLong).nullable())
      .optional();

  /**
   * A save of what is already there: a field left out is left alone, and null
   * or a blank clears a text. Anything else sent with it (an account, a role)
   * is dropped. The ministry role is words: nothing reads it to decide access.
   */
  const profileUpdate = z
    .object(
      {
        churchName: line(profileLimits.churchName, t.churchTooLong(profileLimits.churchName)),
        ministryRole: line(profileLimits.ministryRole, t.roleTooLong(profileLimits.ministryRole)),
        attendsPreachingClass: z.boolean(t.invalid).optional(),
      },
      t.invalid,
    )
    .refine((value) => Object.values(value).some((field) => field !== undefined), t.invalid);

  return { profileUpdate };
}

export type ProfileUpdate = z.infer<ReturnType<typeof profileSchemas>["profileUpdate"]>;
