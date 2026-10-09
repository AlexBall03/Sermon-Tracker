import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";
import type { Database } from "./types";

/**
 * A throwaway in-memory PostgreSQL with the committed migrations applied.
 * Tests only: it never touches a shared database. It is a single connection,
 * so it proves the SQL and constraints but not true concurrent transactions.
 */
export async function createTestDatabase(): Promise<Database> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
