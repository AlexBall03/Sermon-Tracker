import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

/** Driver-independent database handle, so services run on Neon and in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const connectionString = /postgres(?:ql)?:\/\/[^\s"'`]+/gi;

/** True when a write was refused by a unique constraint or index (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps the driver's error, so the code may be one level down.
  for (let current = error, depth = 0; current && depth < 3; depth += 1) {
    if (typeof current !== "object") return false;
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** A log-safe description of a database failure: no connection strings. */
export function describeDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(connectionString, "[connection string removed]");
}
