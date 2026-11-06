import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

import { createTestDatabase } from "../testing";
import type { Database } from "../types";
import { log, name } from "./log";

let fileDb: Database;
let testDb: Database;
let first: Database | undefined;

beforeAll(async () => {
  fileDb = await createTestDatabase();
  name(fileDb, "file");
  log("created file");
});

beforeEach(async (context) => {
  testDb = await createTestDatabase();
  name(testDb, context.task.name);
  log(`created ${context.task.name}`);
});

afterEach(async (context) => {
  await testDb.execute(sql`select 1`);
  log(`afterEach used ${context.task.name}`);
});

afterAll(async () => {
  await fileDb.execute(sql`select 1`);
  log("afterAll used file");
});

it("t1", async () => {
  first = testDb;
  await fileDb.execute(sql`select 1`);
  log("ran t1");
});

it("t2", async () => {
  // Drizzle reports "Failed query"; PGlite's own refusal is its cause.
  await expect(first!.execute(sql`select 1`)).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringMatching(/closed/i) }),
  });
  log("t1 database refused after close");
  await fileDb.execute(sql`select 1`);
  log("ran t2");
});
