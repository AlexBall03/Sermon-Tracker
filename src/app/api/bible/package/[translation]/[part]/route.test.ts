// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { scripturePsalmTitles, scriptureVerses } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import { packageParts, validatePart } from "@/features/offline/bible/package";
import { testPreferences } from "@/features/preferences/testing";
import { verseCounts } from "@/features/scripture/versification";

const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { GET } from "./route";

let db: Database;
const signedIn = { ok: true, user: { id: "user", role: "user", status: "active" } };
const request = (translation: string, part: string) =>
  GET(new Request(`http://localhost/api/bible/package/${translation}/${part}`), {
    params: Promise.resolve({ translation, part }),
  });

// The last part, loaded whole: the smallest that is a real part.
const last = packageParts.length - 1;
const { first: firstBook, last: lastBook } = packageParts[last];

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  state.access = signedIn;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function loadLastPart(translation: "kjv" | "rvg") {
  const rows = [];
  for (let book = firstBook; book <= lastBook; book++) {
    const chapters = verseCounts[book - 1];
    for (let chapter = 1; chapter <= chapters.length; chapter++) {
      for (let verse = 1; verse <= chapters[chapter - 1]; verse++) {
        rows.push({ translation, book, chapter, verse, text: `${book}:${chapter}:${verse}` });
      }
    }
  }
  for (let start = 0; start < rows.length; start += 1000) {
    await db.insert(scriptureVerses).values(rows.slice(start, start + 1000));
  }
}

describe("GET /api/bible/package/[translation]/[part]", () => {
  it("sends nothing to someone not signed in", async () => {
    state.access = { ok: false, message: "Your session has ended. Sign in again." };
    expect((await request("kjv", "0")).status).toBe(401);
  });

  it("sends one whole part that the device will accept", async () => {
    await loadLastPart("kjv");
    const response = await request("kjv", String(last));
    expect(response.status).toBe(200);
    expect(validatePart(await response.json(), "kjv", last)).not.toBeNull();
  });

  it("answers a part that is not whole with an error, never a short part", async () => {
    const response = await request("kjv", String(last));
    expect(response.status).toBe(503);
  });

  it("does not send the Spanish text while Spanish is switched off", async () => {
    await loadLastPart("rvg");
    expect((await request("rvg", String(last))).status).toBe(200);
    testPreferences.spanishEnabled = false;
    expect((await request("rvg", String(last))).status).toBe(404);
  });

  it("refuses a part or a translation that does not exist", async () => {
    expect((await request("kjv", "99")).status).toBe(404);
    expect((await request("kjv", "x")).status).toBe(404);
    expect((await request("niv", "0")).status).toBe(404);
  });

  it("sends the psalm titles with the part that holds the Psalms", async () => {
    await db.insert(scripturePsalmTitles).values({ translation: "kjv", psalm: 3, text: "A title" });
    // The Psalms' part is not loaded here: it is refused as incomplete, titles or not.
    const psalms = packageParts.findIndex((range) => range.first <= 19 && 19 <= range.last);
    expect((await request("kjv", String(psalms))).status).toBe(503);
  });
});
