import { describe, expect, it } from "vitest";

import { lockName } from "./model";
import { createOwnership, type LockManagerLike, type ReleaseRegistry } from "./ownership";
import { fakeLocks } from "./testing";

/*
 * The editing lock (A2.3B.3) on stand-in Web Locks shared by pretend tabs:
 * exclusivity, cancellation before, during, and after a grant, and one tab's
 * sessions handing the lock on in order (React's Strict Mode).
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const outline = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const other = "7d3e9a10-1b2c-4d5e-8f60-718293a4b5c6";
const name = lockName(owner, outline);

const settle = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

function make(
  locks: ReturnType<typeof fakeLocks>,
  tab: string,
  releases: ReleaseRegistry = new Map(),
  lock = name,
) {
  return createOwnership({ locks: locks.forTab(tab), name: lock, releases });
}

describe("ownership", () => {
  it("lets one session hold the lock and tells the next it is busy", async () => {
    const locks = fakeLocks();
    const a = make(locks, "A");
    const b = make(locks, "B");
    expect(await a.tryAcquire()).toBe("held");
    expect(await b.tryAcquire()).toBe("busy");
    expect(a.held()).toBe(true);
    expect(b.held()).toBe(false);
    expect(locks.holder(name)).toBe("A");
  });

  it("grants exactly one of two simultaneous requests", async () => {
    const locks = fakeLocks();
    const results = await Promise.all([
      make(locks, "A").tryAcquire(),
      make(locks, "B").tryAcquire(),
    ]);
    expect(results.sort()).toEqual(["busy", "held"]);
  });

  it("keeps outlines and accounts apart", async () => {
    const locks = fakeLocks();
    expect(await make(locks, "A").tryAcquire()).toBe("held");
    expect(await make(locks, "B", new Map(), lockName(owner, other)).tryAcquire()).toBe("held");
    expect(await make(locks, "C", new Map(), lockName("another-owner", outline)).tryAcquire()).toBe(
      "held",
    );
  });

  it("frees the lock on release, so it can be taken again", async () => {
    const locks = fakeLocks();
    const a = make(locks, "A");
    await a.tryAcquire();
    await a.release();
    expect(a.held()).toBe(false);
    expect(await make(locks, "B").tryAcquire()).toBe("held");
  });

  it("refuses every request once disposed", async () => {
    const locks = fakeLocks();
    const a = make(locks, "A");
    await a.dispose();
    expect(await a.tryAcquire()).toBe("aborted");
    expect(await a.waitFor(new AbortController().signal)).toBe("aborted");
    expect(locks.holder(name)).toBeNull();
  });

  it("gives back a grant that arrives after disposal (before the grant)", async () => {
    const locks = fakeLocks({ manual: true });
    const a = make(locks, "A");
    const asked = a.tryAcquire();
    await settle();
    const ended = a.dispose();
    locks.grant();
    await settle();
    locks.grant();
    expect(await asked).toBe("aborted");
    await ended;
    expect(a.held()).toBe(false);
    expect(locks.holder(name)).toBeNull();
  });

  it("gives back a waited-for grant whose request was aborted just before it ran (during)", async () => {
    const locks = fakeLocks({ manual: true });
    const a = make(locks, "A");
    const b = make(locks, "B");
    const takenA = a.tryAcquire();
    await settle();
    locks.grant();
    expect(await takenA).toBe("held");

    const abort = new AbortController();
    const waiting = b.waitFor(abort.signal);
    await settle();
    locks.grant(); // queued behind A
    await a.release(); // A lets go: B's grant is scheduled…
    abort.abort(); // …and abandoned before it runs
    locks.grant();
    await settle();
    locks.grant();
    expect(await waiting).toBe("aborted");
    expect(b.held()).toBe(false);
    expect(locks.holder(name)).toBeNull();
  });

  it("keeps a grant that ran before an abort (after), until released", async () => {
    const locks = fakeLocks();
    const b = make(locks, "B");
    const abort = new AbortController();
    expect(await b.waitFor(abort.signal)).toBe("held");
    abort.abort();
    await settle();
    expect(b.held()).toBe(true);
    await b.release();
    expect(locks.holder(name)).toBeNull();
  });

  it("aborts a wait in line", async () => {
    const locks = fakeLocks();
    await make(locks, "A").tryAcquire();
    const abort = new AbortController();
    const waiting = make(locks, "B").waitFor(abort.signal);
    abort.abort();
    expect(await waiting).toBe("aborted");
  });

  it("is unavailable when the lock manager fails", async () => {
    const broken: LockManagerLike = {
      request: () => {
        throw new Error("SecurityError");
      },
    };
    expect(await createOwnership({ locks: broken, name, releases: new Map() }).tryAcquire()).toBe(
      "unavailable",
    );
    const rejecting: LockManagerLike = { request: () => Promise.reject(new Error("failed")) };
    expect(
      await createOwnership({ locks: rejecting, name, releases: new Map() }).tryAcquire(),
    ).toBe("unavailable");
  });

  it("reports a held lock the browser takes away", async () => {
    let fail: (error: unknown) => void = () => {};
    const stealing: LockManagerLike = {
      request: (_name, _options, callback) =>
        new Promise((_resolve, reject) => {
          fail = reject;
          void callback({});
        }),
    };
    const a = createOwnership({ locks: stealing, name, releases: new Map() });
    let lost = 0;
    a.onLost(() => (lost += 1));
    expect(await a.tryAcquire()).toBe("held");
    fail(Object.assign(new Error("stolen"), { name: "AbortError" }));
    await settle();
    expect(a.held()).toBe(false);
    expect(lost).toBe(1);
  });

  describe("one tab (Strict Mode, a quick remount)", () => {
    it("a new session waits for the one ending, instead of finding the lock busy", async () => {
      const locks = fakeLocks();
      const tab: ReleaseRegistry = new Map();
      const first = make(locks, "A", tab);
      await first.tryAcquire();
      void first.dispose();
      const second = make(locks, "A", tab);
      expect(await second.tryAcquire()).toBe("held");
    });

    it("waits for a request still pending when the first session ended", async () => {
      const locks = fakeLocks({ manual: true });
      const tab: ReleaseRegistry = new Map();
      const first = make(locks, "A", tab);
      const asked = first.tryAcquire();
      await settle();
      void first.dispose();
      const second = make(locks, "A", tab);
      const taken = second.tryAcquire();
      for (let i = 0; i < 5; i += 1) {
        locks.grant();
        await settle();
      }
      expect(await asked).toBe("aborted");
      expect(await taken).toBe("held");
    });

    it("waits for the first session's last local work before it takes over", async () => {
      const locks = fakeLocks();
      const tab: ReleaseRegistry = new Map();
      const first = make(locks, "A", tab);
      await first.tryAcquire();
      let finish!: () => void;
      const lastWork = new Promise<void>((resolve) => (finish = resolve));
      void first.dispose(lastWork);
      const second = make(locks, "A", tab);
      let result: string | null = null;
      void second.tryAcquire().then((value) => (result = value));
      await settle();
      expect(result).toBeNull();
      expect(first.held()).toBe(true);
      finish();
      await settle();
      expect(result).toBe("held");
    });

    it("an old session's late cleanup never frees the new session's lock", async () => {
      const locks = fakeLocks();
      const tab: ReleaseRegistry = new Map();
      const first = make(locks, "A", tab);
      await first.tryAcquire();
      await first.dispose();
      const second = make(locks, "A", tab);
      expect(await second.tryAcquire()).toBe("held");
      await first.release();
      await first.dispose();
      await settle();
      expect(second.held()).toBe(true);
      expect(locks.holder(name)).toBe("A");
    });

    it("two live sessions of one tab: the second is busy", async () => {
      const locks = fakeLocks();
      const tab: ReleaseRegistry = new Map();
      expect(await make(locks, "A", tab).tryAcquire()).toBe("held");
      expect(await make(locks, "A", tab).tryAcquire()).toBe("busy");
    });
  });
});
