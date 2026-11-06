import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import * as schema from "./schema";
import { ownTestClient } from "./test-lifecycle";
import type { Database } from "./types";

/**
 * A throwaway in-memory PostgreSQL with the committed migrations applied.
 * Tests only: it never touches a shared database. It is a single connection,
 * so it proves the SQL and constraints but not true concurrent transactions.
 *
 * It is closed for the caller when its test (or, made in `beforeAll`, its
 * file) ends (`test-lifecycle.ts`), and at once if the migrations fail.
 */
export async function createTestDatabase(): Promise<Database> {
  const client = ownTestClient(new PGlite());
  try {
    const db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    return db;
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}
