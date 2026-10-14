import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearActiveAccount,
  getActiveAccount,
  onAccountChange,
  resetAccountMemory,
  setActiveAccount,
} from "./account";
import { closeOfflineDb, dbName, dbVersion, migrations, openOfflineDb } from "./db";
import { enqueue, listMutations, markAttempt, removeMutation } from "./queue";
import { readOfflineSettings, resetOfflineSettingsMemory, saveOfflineSettings } from "./settings";
import { isQuotaError } from "./storage";

const capture = (id: string, title = "A thought") => ({
  opId: id,
  type: "idea.create" as const,
  entityType: "idea" as const,
  entityId: id,
  payload: { title, kind: "undecided" },
});

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
  resetOfflineSettingsMemory();
});
afterEach(() => closeOfflineDb());

describe("the offline database", () => {
  it("is created at the latest version with every store", async () => {
    const db = await openOfflineDb();
    expect(db.version).toBe(dbVersion);
    expect([...db.objectStoreNames].sort()).toEqual(
      ["accountData", "bibleChapters", "bibleDatasets", "meta", "mutations"].sort(),
    );
    expect([...db.transaction("mutations").store.indexNames].sort()).toEqual([
      "owner",
      "ownerStatus",
    ]);
  });

  it("runs every step from an older version, keeping what is there", async () => {
    // A database left by version 1, then opened by a version with one more step.
    const legacy = await openDB(dbName, 1, {
      upgrade: (db, _old, _new, tx) => migrations[0](db as never, tx as never),
    });
    await legacy.put("meta", "kept", "probe");
    legacy.close();

    migrations.push((db) => void db.createObjectStore("later" as never));
    try {
      const db = await openOfflineDb();
      expect(db.version).toBe(2);
      expect(db.objectStoreNames.contains("later" as never)).toBe(true);
      expect(await db.get("meta", "probe")).toBe("kept");
    } finally {
      migrations.pop();
      await closeOfflineDb();
    }
  });

  it("lets a newer version of the application upgrade it without waiting", async () => {
    await openOfflineDb();
    // Opening at a newer version only resolves once this connection has closed when asked.
    const newer = await openDB(dbName, dbVersion + 1);
    newer.close();
    // This (older) version cannot read the newer database, and says storage is unavailable
    // rather than failing in some other way, until the page takes the update.
    await expect(openOfflineDb()).rejects.toThrow(/unavailable/);
  });
});

describe("the queue", () => {
  it("keeps a change across a reopen, and adding the same change twice keeps one", async () => {
    await enqueue("owner-a", capture("op-1"));
    await enqueue("owner-a", capture("op-1", "changed"));
    await closeOfflineDb();
    const kept = await listMutations("owner-a");
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ status: "pending", attempts: 0, schemaVersion: 1 });
    expect(kept[0].payload).toMatchObject({ title: "A thought" });
  });

  it("never shows, changes, or removes one account's changes for another", async () => {
    await enqueue("owner-a", capture("op-a"));
    await enqueue("owner-b", capture("op-b"));
    expect((await listMutations("owner-a")).map((record) => record.opId)).toEqual(["op-a"]);
    expect(await removeMutation("owner-b", "op-a")).toBe(false);
    await markAttempt("owner-b", "op-a", { ok: false, kind: "network" });
    expect((await listMutations("owner-a"))[0].attempts).toBe(0);
    await expect(enqueue("owner-b", capture("op-a"))).rejects.toThrow(/another account/);
    expect(await listMutations("")).toEqual([]);
  });

  it("records attempts and removes a change only when asked", async () => {
    await enqueue("owner-a", capture("op-1"));
    await markAttempt("owner-a", "op-1", { ok: false, kind: "network" });
    expect((await listMutations("owner-a"))[0]).toMatchObject({
      attempts: 1,
      status: "failed",
      error: { kind: "network" },
    });
    expect(await removeMutation("owner-a", "op-1")).toBe(true);
    expect(await listMutations("owner-a")).toEqual([]);
  });
});

describe("the active account", () => {
  it("is forgotten on signing out and replaced on switching, and the work stays", async () => {
    const seen: (string | null)[] = [];
    onAccountChange((account) => seen.push(account));
    await setActiveAccount("owner-a");
    await enqueue("owner-a", capture("op-a"));

    await clearActiveAccount();
    expect(await getActiveAccount()).toBeNull();
    await setActiveAccount("owner-b");
    expect(await getActiveAccount()).toBe("owner-b");
    // Each change was announced, so memory of the last account can be dropped.
    expect(seen).toEqual(["owner-a", null, "owner-b"]);
    // Still on the device, still only the first account's.
    expect(await listMutations("owner-a")).toHaveLength(1);
    expect(await listMutations("owner-b")).toEqual([]);
  });
});

describe("the device's settings", () => {
  it("start from the defaults and keep what is changed", async () => {
    expect(await readOfflineSettings()).toEqual({ captureOffline: true, autoBible: true });
    await saveOfflineSettings({ autoBible: false });
    resetOfflineSettingsMemory();
    expect(await readOfflineSettings()).toEqual({ captureOffline: true, autoBible: false });
  });

  it("fall back to the defaults where storage is refused", async () => {
    await closeOfflineDb();
    // @ts-expect-error: no IndexedDB, as in some private windows.
    delete globalThis.indexedDB;
    expect(await readOfflineSettings()).toEqual({ captureOffline: true, autoBible: true });
    await expect(enqueue("owner-a", capture("op"))).rejects.toThrow(/unavailable/);
  });
});

describe("isQuotaError", () => {
  it("recognizes the browser's out-of-space error, however wrapped", () => {
    const quota = new DOMException("full", "QuotaExceededError");
    expect(isQuotaError(quota)).toBe(true);
    expect(isQuotaError(new Error("wrapped", { cause: quota }))).toBe(true);
    expect(isQuotaError(new Error("other"))).toBe(false);
  });
});
