import "server-only";

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { requireDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";
import { describeDatabaseError, type Database } from "./types";

let database: Database | undefined;

/**
 * The shared database handle. Created on first use so that pages which never
 * query (and builds without credentials) do not need a connection string.
 * The pooled WebSocket driver is used because role and status changes need
 * interactive transactions.
 */
export function getDb(): Database {
  if (database) return database;
  const pool = new Pool({ connectionString: requireDatabaseUrl() });
  pool.on("error", (error: Error) => {
    console.error("Database pool error:", describeDatabaseError(error));
  });
  database = drizzle({ client: pool, schema });
  return database;
}
