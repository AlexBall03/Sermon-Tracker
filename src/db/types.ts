import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

/** Driver-independent database handle, so services run on Neon and in tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const connectionString = /postgres(?:ql)?:\/\/[^\s"'`]+/gi;

/** A log-safe description of a database failure: no connection strings. */
export function describeDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(connectionString, "[connection string removed]");
}
