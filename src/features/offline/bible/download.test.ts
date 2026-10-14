import "fake-indexeddb/auto";

import { createHash } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearChapterCache, loadChapter } from "@/features/scripture/use-chapter";
import { verseCounts } from "@/features/scripture/versification";
import { closeOfflineDb, openOfflineDb } from "../db";
import { enqueue, listMutations } from "../queue";
import { resetOfflineSettingsMemory, saveOfflineSettings } from "../settings";
import { autoDownload, maxAutoAttempts } from "./auto";
import { downloadTranslation, removeTranslation } from "./download";
import { localTranslations, readLocalChapter } from "./local";
import { editionVersion, packageParts, validatePart, type PackagePart } from "./package";

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** A whole, made-up translation in the shared numbering, and the checksums it adds up to. */
function makeEdition(word: string) {
  const books = verseCounts.map((chapters, b) =>
    chapters.map((count, c) =>
      Array.from({ length: count }, (_, v) => `${word} ${b + 1}:${c + 1}:${v + 1}`),
    ),
  );
  const titles: Record<string, string> = { "3": `${word} title 3`, "51": `${word} title 51` };
  const edition = {
    text: sha(books),
    titles: sha(Object.entries(titles).map(([psalm, text]) => [Number(psalm), text])),
  };
  const part = (index: number): PackagePart => {
    const { first, last } = packageParts[index];
    const hasPsalms = first <= 19 && 19 <= last;
    // A copy each time, so a test that spoils a part spoils only its own.
    return structuredClone({
      translation: "kjv",
      version: editionVersion(edition),
      part: index,
      books: books.slice(first - 1, last).map((chapters, i) => ({ book: first + i, chapters })),
      titles: hasPsalms ? titles : {},
    });
  };
  return { edition, part };
}

const first = makeEdition("First");
const fromFirst = async (_translation: string, index: number) => first.part(index);

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetOfflineSettingsMemory();
  clearChapterCache();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await closeOfflineDb();
});

describe("validatePart", () => {
  it("takes a whole part and refuses anything short, blank, or misplaced", () => {
    const good = first.part(0);
    expect(validatePart(good, "kjv", 0)).not.toBeNull();
    expect(validatePart(good, "rvg", 0)).toBeNull();
    expect(validatePart(good, "kjv", 1)).toBeNull();
    const short = structuredClone(good);
    short.books[0].chapters[0].pop();
    expect(validatePart(short, "kjv", 0)).toBeNull();
    const blank = structuredClone(good);
    blank.books[0].chapters[0][0] = " ";
    expect(validatePart(blank, "kjv", 0)).toBeNull();
    expect(validatePart({ ...good, titles: { "1": "Not a psalm here" } }, "kjv", 0)).toBeNull();
  });

  it("covers the 66 books once, in order, in a handful of parts", () => {
    expect(packageParts[0].first).toBe(1);
    expect(packageParts.at(-1)?.last).toBe(66);
    expect(packageParts.length).toBeLessThan(12);
    packageParts.slice(1).forEach((range, index) => {
      expect(range.first).toBe(packageParts[index].last + 1);
    });
  });
});

describe("downloading a translation", () => {
  it("keeps a whole, verified translation that is then read with no connection", async () => {
    const fetchPart = vi.fn(fromFirst);
    const progress = vi.fn();
    expect(
      await downloadTranslation("kjv", { fetchPart, edition: first.edition, onProgress: progress }),
    ).toBe("complete");
    expect(fetchPart).toHaveBeenCalledTimes(packageParts.length);
    expect(progress).toHaveBeenLastCalledWith(packageParts.length, packageParts.length);

    const psalm = await readLocalChapter("kjv", 19, 51);
    expect(psalm?.verses[0]).toBe("First 19:51:1");
    expect(psalm?.title).toBe("First title 51");
    expect((await readLocalChapter("kjv", 1, 1))?.title).toBeNull();
    expect(await localTranslations()).toEqual(["kjv"]);
    // Asked again, nothing is fetched.
    expect(await downloadTranslation("kjv", { fetchPart, edition: first.edition })).toBe(
      "complete",
    );
    expect(fetchPart).toHaveBeenCalledTimes(packageParts.length);
  });

  it("never reads a partial download, and goes on from the part it stopped in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const index = Number(url.split("/").at(-1));
        if (index === 2) throw new TypeError("Failed to fetch");
        return Response.json(first.part(index));
      }),
    );
    expect(await downloadTranslation("kjv", { edition: first.edition })).toEqual({
      error: "network",
    });
    expect(await readLocalChapter("kjv", 1, 1)).toBeNull();
    expect(await localTranslations()).toEqual([]);

    const resumed = vi.fn(fromFirst);
    expect(await downloadTranslation("kjv", { fetchPart: resumed, edition: first.edition })).toBe(
      "complete",
    );
    // Parts 0 and 1 were kept: only the rest were fetched again.
    expect(resumed.mock.calls.map(([, index]) => index)).toEqual(
      packageParts.map((_, index) => index).slice(2),
    );
    expect(await readLocalChapter("kjv", 1, 1)).not.toBeNull();
  });

  it("keeps what an interrupted download wrote, and resumes from it", async () => {
    const controller = new AbortController();
    const fetchPart = vi.fn(async (translation: string, index: number) => {
      if (index === 1) controller.abort();
      return fromFirst(translation, index);
    });
    expect(
      await downloadTranslation("kjv", {
        fetchPart,
        edition: first.edition,
        signal: controller.signal,
      }),
    ).toBe("aborted");
    expect(await readLocalChapter("kjv", 1, 1)).toBeNull();

    const resumed = vi.fn(fromFirst);
    expect(await downloadTranslation("kjv", { fetchPart: resumed, edition: first.edition })).toBe(
      "complete",
    );
    expect(resumed).toHaveBeenCalledTimes(packageParts.length - 2);
  });

  it("refuses a download that does not match its checksums, keeping the edition already kept", async () => {
    await downloadTranslation("kjv", { fetchPart: fromFirst, edition: first.edition });
    const second = makeEdition("Second");
    // Every part is well formed, but one verse is not what the checksums say.
    const tampered = async (_translation: string, index: number) => {
      const part = second.part(index);
      if (index === 0) part.books[0].chapters[0][0] = "Altered";
      return part;
    };
    expect(
      await downloadTranslation("kjv", { fetchPart: tampered, edition: second.edition }),
    ).toEqual({ error: "integrity" });
    expect((await readLocalChapter("kjv", 1, 1))?.verses[0]).toBe("First 1:1:1");
    expect(await (await openOfflineDb()).count("bibleChapters")).toBe(1189);
  });

  it("refuses a malformed part outright", async () => {
    const broken = async (_translation: string, index: number) => {
      const part = first.part(index);
      if (index === 0) part.books[0].chapters.pop();
      return part;
    };
    expect(await downloadTranslation("kjv", { fetchPart: broken, edition: first.edition })).toEqual(
      { error: "integrity" },
    );
    expect(await (await openOfflineDb()).count("bibleChapters")).toBe(0);
  });

  it("replaces an edition only once the new one is verified, then lets the old one go", async () => {
    await downloadTranslation("kjv", { fetchPart: fromFirst, edition: first.edition });
    const second = makeEdition("Second");
    expect(
      await downloadTranslation("kjv", {
        fetchPart: async (_translation, index) => second.part(index),
        edition: second.edition,
      }),
    ).toBe("complete");
    expect((await readLocalChapter("kjv", 1, 1))?.verses[0]).toBe("Second 1:1:1");
    expect(await (await openOfflineDb()).count("bibleChapters")).toBe(1189);
  });

  it("says a translation the server will not send is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    expect(await downloadTranslation("rvg")).toEqual({ error: "unavailable" });
    expect(await readLocalChapter("rvg", 1, 1)).toBeNull();
  });

  it("says when the device runs out of room, and keeps nothing half-written", async () => {
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "bibleChapters") throw new DOMException("full", "QuotaExceededError");
      return put.apply(this, args);
    });
    expect(
      await downloadTranslation("kjv", { fetchPart: fromFirst, edition: first.edition }),
    ).toEqual({ error: "quota" });
    vi.restoreAllMocks();
    const db = await openOfflineDb();
    expect(await db.count("bibleChapters")).toBe(0);
    expect((await db.get("bibleDatasets", "kjv"))?.status).toBe("failed");
  });

  it("removes a translation's text and nothing else", async () => {
    await downloadTranslation("kjv", { fetchPart: fromFirst, edition: first.edition });
    await enqueue("owner", {
      opId: "op",
      type: "idea.create",
      entityType: "idea",
      entityId: "op",
      payload: {},
    });
    await removeTranslation("kjv");
    expect(await readLocalChapter("kjv", 1, 1)).toBeNull();
    expect(await (await openOfflineDb()).count("bibleChapters")).toBe(0);
    expect(await listMutations("owner")).toHaveLength(1);
  });
});

describe("reading a chapter", () => {
  it("comes from the device when the server cannot be reached", async () => {
    await downloadTranslation("kjv", { fetchPart: fromFirst, edition: first.edition });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    expect((await loadChapter("kjv", 43, 3)).verses[15]).toBe("First 43:3:16");
    // A translation not on the device is still an error, never an empty chapter.
    await expect(loadChapter("rvg", 43, 3)).rejects.toThrow();
  });
});

describe("downloading by itself", () => {
  it("does nothing when this device says not to", async () => {
    await saveOfflineSettings({ autoBible: false });
    expect(await autoDownload("kjv")).toBe("off");
  });

  it("stops after a few failed tries until asked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    for (let attempt = 0; attempt < maxAutoAttempts; attempt++) {
      expect(await autoDownload("kjv")).toEqual({ error: "network" });
    }
    expect(await autoDownload("kjv")).toBe("waiting");
  });
});
