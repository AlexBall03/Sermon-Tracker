/**
 * Closes the in-memory databases tests create (docs/TESTING.md).
 *
 * A PGlite instance holds about 240 MB outside the JavaScript heap, and an
 * instance that is never closed is never reclaimed, even after garbage
 * collection (measured: TEST-005 in docs/BUGS.md). So every instance a test
 * makes is registered here and closed by `vitest.setup.ts`:
 *
 * - one made during a test (its `beforeEach` included) is closed after that
 *   test, once the file's own `afterEach` hooks have run;
 * - one made outside a test (`beforeAll`, or a module's top level) is closed
 *   after the file, once its own `afterAll` hooks have run.
 *
 * A database used after it is closed fails loudly ("PGlite is closed"); it is
 * never reopened. This module imports nothing heavy, so setting it up costs a
 * test file that uses no database nothing.
 */

type Closable = { close(): Promise<void>; readonly closed: boolean };

const owned = new Map<Closable, "test" | "file">();
let inTest = false;

/** Registers a database client to be closed when its test or file ends. Returns it. */
export function ownTestClient<T extends Closable>(client: T): T {
  owned.set(client, inTest ? "test" : "file");
  return client;
}

async function closeWhere(scope: "test" | "file" | "all") {
  const errors: unknown[] = [];
  for (const [client, owner] of [...owned]) {
    if (scope !== "all" && owner !== scope) continue;
    owned.delete(client);
    if (client.closed) continue;
    try {
      await client.close();
    } catch (error) {
      errors.push(error);
    }
  }
  // A failure to close is reported, after every other database has been closed.
  if (errors.length > 0) throw new AggregateError(errors, "A test database did not close");
}

/** The hooks `vitest.setup.ts` registers; exported for its own tests. */
export const testDatabaseLifecycle = {
  beforeEach() {
    inTest = true;
  },
  async afterEach() {
    inTest = false;
    await closeWhere("test");
  },
  async afterAll() {
    inTest = false;
    await closeWhere("all");
  },
  /** How many are still open, by scope (for tests). */
  open() {
    let test = 0;
    let file = 0;
    for (const [client, owner] of owned) {
      if (client.closed) continue;
      if (owner === "test") test++;
      else file++;
    }
    return { test, file };
  },
};
