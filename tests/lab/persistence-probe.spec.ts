import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { Pool } from "@neondatabase/serverless";
import { expect, test, type Page, type Route } from "@playwright/test";

/*
 * A2.3B.2D's runtime acceptance: in a real browser on a real Next.js server,
 * the authoritative read (a plain GET of /api/sermon-documents/…) completes
 * while a save Server Action is still pending. Two different claims, proved
 * apart:
 *
 * 1. Browser dispatch. The save's POST is held by the browser's network
 *    layer (Playwright), so it has left the page but not reached the server.
 *    The GET still goes out and comes back; a Server Action read started
 *    beside it does not even leave the page until the save is answered (the
 *    queue the GET avoids).
 * 2. Server execution. The save reaches Next.js and its UPDATE waits on a row
 *    lock this test holds on the fixture's document (a plain SELECT is not
 *    blocked by it). PostgreSQL itself says the save is waiting on this
 *    test's lock, and the GET answers meanwhile.
 *
 * Everything happens on a disposable sermon the probe makes for the run
 * (/lab/persistence-probe, development only) and deletes afterwards. Signed
 * in as the development Clerk test account, as the other lab specs are.
 */

const email = process.env.E2E_CLERK_USER_EMAIL;
const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const development = publishableKey.startsWith("pk_test_");
const databaseUrl = process.env.DATABASE_URL;

type Fixture = { outlineId: string; revision: number };
type Probe = {
  setup(): Promise<Fixture | null>;
  save(content: unknown, expectedRevision: number): Promise<unknown>;
  read(): Promise<{ kind: string; content?: unknown; revision?: number }>;
  readByAction(): Promise<{ ok: boolean; revision?: number }>;
  teardown(): Promise<boolean>;
};
type ProbeWindow = {
  __persistenceProbe: Probe;
  __save?: unknown;
  __actionRead?: unknown;
};

test.describe.configure({ mode: "serial" });

async function openProbe(page: Page) {
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: email ?? "" });
  await page.goto("/lab/persistence-probe");
  await expect(page.getByTestId("persistence-probe")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
}

const setup = (page: Page) =>
  page.evaluate(() => (window as unknown as ProbeWindow).__persistenceProbe.setup());
const read = (page: Page) =>
  page.evaluate(() => (window as unknown as ProbeWindow).__persistenceProbe.read());
const teardown = (page: Page) =>
  page.evaluate(() => (window as unknown as ProbeWindow).__persistenceProbe.teardown());
/** Starts the save (and, if asked, the Server Action read) without waiting for either. */
const startSave = (page: Page, content: unknown, revision: number, withActionRead: boolean) =>
  page.evaluate(
    ([content, revision, withActionRead]) => {
      const w = window as unknown as ProbeWindow;
      w.__save = null;
      w.__actionRead = null;
      void w.__persistenceProbe.save(content, revision as number).then((outcome) => {
        w.__save = outcome;
      });
      if (withActionRead) {
        void w.__persistenceProbe.readByAction().then((result) => {
          w.__actionRead = result;
        });
      }
    },
    [content, revision, withActionRead] as const,
  );
const settled = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as ProbeWindow;
    return { save: w.__save ?? null, actionRead: w.__actionRead ?? null };
  });

/**
 * How many saves of a sermon document are waiting on the lock `lock` holds.
 * Its own transaction would keep the first snapshot of pg_stat_activity, so
 * each look takes a fresh one.
 */
async function waitingOnLock(lock: {
  query(sql: string): Promise<{ rows: { waiting: number }[] }>;
}) {
  await lock.query("SELECT pg_stat_clear_snapshot()");
  const result = await lock.query(
    `SELECT count(*)::int AS waiting FROM pg_stat_activity
     WHERE pg_backend_pid() = ANY (pg_blocking_pids(pid))
       AND query ILIKE 'update "sermon_outline_documents"%'`,
  );
  return result.rows[0].waiting;
}

/** Every answer to the read route, as the browser saw it. */
function watchReads(page: Page) {
  const answers: { status: number; cacheControl: string | undefined }[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/api/sermon-documents/")) {
      answers.push({
        status: response.status(),
        cacheControl: response.headers()["cache-control"],
      });
    }
  });
  return answers;
}

test.describe("authoritative reads beside a pending save (A2.3B.2D)", () => {
  test.skip(!email, "Set E2E_CLERK_USER_EMAIL to a development Clerk user to run these.");
  test.skip(Boolean(email) && !development, "Tested against the development Clerk instance only.");
  test.beforeAll(async () => {
    await clerkSetup({ publishableKey });
  });
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop", "Checked at desktop size.");
  });

  test("browser dispatch: the GET completes while the save's POST is held in the browser", async ({
    page,
  }) => {
    await openProbe(page);
    const fixture = await setup(page);
    expect(fixture).not.toBeNull();
    const { revision: R0 } = fixture!;
    try {
      const reads = watchReads(page);
      const base = await read(page);
      expect(base).toMatchObject({ kind: "found", revision: R0 });

      // Every Server Action POST to the page is held until released.
      const held: Route[] = [];
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      await page.route("**/lab/persistence-probe", async (route) => {
        const request = route.request();
        if (request.method() === "POST" && request.headers()["next-action"]) {
          held.push(route);
          await released;
        }
        await route.continue();
      });

      await startSave(page, base.content, R0, true);
      await expect.poll(() => held.length).toBe(1);

      // The GET goes out and comes back while the save is held.
      const during = await read(page);
      expect(during).toEqual({ kind: "found", content: base.content, revision: R0 });
      expect(reads.at(-1)).toEqual({ status: 200, cacheControl: "private, no-store" });
      expect(await settled(page)).toEqual({ save: null, actionRead: null });
      // The Server Action read started beside the save has not even left the page.
      expect(held).toHaveLength(1);

      release();
      await expect
        .poll(async () => (await settled(page)).save, { timeout: 30_000 })
        .toMatchObject({ kind: "confirmed", revision: R0 + 1 });
      // Only now does the queued action read go out, and it sees the save.
      await expect
        .poll(async () => (await settled(page)).actionRead, { timeout: 30_000 })
        .toEqual({ ok: true, revision: R0 + 1 });
      expect(held).toHaveLength(2);
      expect(await read(page)).toEqual({ kind: "found", content: base.content, revision: R0 + 1 });
      await page.unroute("**/lab/persistence-probe");
    } finally {
      expect(await teardown(page)).toBe(true);
    }
  });

  test("server execution: the GET completes while the save waits inside Next.js on a row lock", async ({
    page,
  }) => {
    test.skip(!databaseUrl, "Needs DATABASE_URL (the development database) to hold the lock.");
    await openProbe(page);
    const fixture = await setup(page);
    expect(fixture).not.toBeNull();
    const { outlineId, revision: R0 } = fixture!;
    const pool = new Pool({ connectionString: databaseUrl });
    const lock = await pool.connect();
    let locked = false;
    try {
      const reads = watchReads(page);
      const base = await read(page);
      expect(base).toMatchObject({ kind: "found", revision: R0 });

      // Locks the fixture's document row, and nothing else; writes nothing.
      await lock.query("BEGIN");
      locked = true;
      const row = await lock.query(
        "SELECT revision FROM sermon_outline_documents WHERE outline_id = $1 FOR UPDATE",
        [outlineId],
      );
      expect(row.rows).toEqual([{ revision: R0 }]);

      await startSave(page, base.content, R0, false);
      // PostgreSQL says the save's UPDATE is running and waiting on this test's lock.
      await expect.poll(() => waitingOnLock(lock), { timeout: 30_000 }).toBe(1);

      const during = await read(page);
      expect(during).toEqual({ kind: "found", content: base.content, revision: R0 });
      expect(reads.at(-1)).toEqual({ status: 200, cacheControl: "private, no-store" });
      // The save is still waiting on the lock.
      expect((await settled(page)).save).toBeNull();
      expect(await waitingOnLock(lock)).toBe(1);

      await lock.query("ROLLBACK");
      locked = false;
      await expect
        .poll(async () => (await settled(page)).save, { timeout: 30_000 })
        .toMatchObject({ kind: "confirmed", revision: R0 + 1 });
      expect(await read(page)).toEqual({ kind: "found", content: base.content, revision: R0 + 1 });
    } finally {
      if (locked) await lock.query("ROLLBACK");
      lock.release();
      await pool.end();
      expect(await teardown(page)).toBe(true);
    }
  });
});
