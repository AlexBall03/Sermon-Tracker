import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { describeDatabaseError, type Database } from "@/db/types";

/** Settings of the whole application, as every request reads them. */
export type AppSettings = {
  /** The administrator's switch for the Spanish interface and the Spanish Bible. */
  spanishEnabled: boolean;
};

/** The one row, or the defaults where no administrator has changed anything yet. */
export async function readAppSettings(db: Pick<Database, "select">): Promise<AppSettings> {
  const [row] = await db
    .select({ spanishEnabled: appSettings.spanishEnabled })
    .from(appSettings)
    .where(eq(appSettings.singleton, true))
    .limit(1);
  return { spanishEnabled: row?.spanishEnabled ?? true };
}

/**
 * Switches Spanish on or off for everyone. It is one row, written whole, so
 * two administrators at once leave whichever wrote last. Nothing any person
 * saved is touched: not a preference, a favorite, or a highlight.
 */
export async function writeSpanishEnabled(
  db: Pick<Database, "insert">,
  enabled: boolean,
  adminId: string,
): Promise<AppSettings> {
  const [row] = await db
    .insert(appSettings)
    .values({ singleton: true, spanishEnabled: enabled, updatedBy: adminId })
    .onConflictDoUpdate({
      target: appSettings.singleton,
      set: { spanishEnabled: enabled, updatedBy: adminId, updatedAt: new Date() },
    })
    .returning({ spanishEnabled: appSettings.spanishEnabled });
  return { spanishEnabled: row.spanishEnabled };
}

/**
 * The settings for this request, read from the database every time and once
 * per request, so the switch takes effect on the next request with no
 * deployment and nothing to expire.
 *
 * If they cannot be read, Spanish is treated as off: English and the King
 * James always work, and a switch that could not be consulted must not be
 * taken as "on".
 */
export const getAppSettings = cache(async (): Promise<AppSettings> => {
  try {
    return await readAppSettings(getDb());
  } catch (error) {
    console.error("Application settings read failed:", describeDatabaseError(error));
    return { spanishEnabled: false };
  }
});
