import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

/** Driver-independent database handle, so services run on Neon and in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const connectionString = /postgres(?:ql)?:\/\/[^\s"'`]+/gi;

function hasSqlState(error: unknown, code: string): boolean {
  // Drizzle wraps the driver's error, so the code may be one level down.
  for (let current = error, depth = 0; current && depth < 3; depth += 1) {
    if (typeof current !== "object") return false;
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** True when a write was refused by a unique constraint or index (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return hasSqlState(error, "23505");
}

/**
 * True when a write was refused by a foreign key: a row it names is not there
 * (SQLSTATE 23503), or a row it would remove is still pointed at (23503, or
 * 23001 where the key is ON DELETE RESTRICT).
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasSqlState(error, "23503") || hasSqlState(error, "23001");
}

/** A log-safe description of a database failure: no connection strings. */
export function describeDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(connectionString, "[connection string removed]");
}
