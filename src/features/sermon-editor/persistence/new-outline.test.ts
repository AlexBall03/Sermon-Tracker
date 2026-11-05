// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  appearancePresets,
  ideas,
  sermonOutlineDocuments,
  sermonOutlines,
  users,
} from "@/db/schema";
import type { Database } from "@/db/types";
import { processDeletion, requestDeletion } from "@/features/account/deletion";
import { setAccountDefault } from "@/features/appearance-presets/defaults";
import {
  createPreset,
  deletePreset,
  replacePresetAppearance,
} from "@/features/appearance-presets/presets";
import { recordingDatabase, seedAccount } from "@/features/appearance-presets/testing";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { createOutline } from "@/features/outlines/outlines";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { convertOutline } from "./conversion";
import { getDocument } from "./documents";
import { newOutlineDocument } from "./new-outline";

/*
 * A genuinely new outline made with its first sermon document (A4.2C), on an
 * in-memory PostgreSQL with the committed migrations. PGlite is one
 * connection: the races on real connections are in the scratchpad harness
 * (docs/HANDOFF-PS-A4.2C.md). Here: what is written, what is refused with
 * nothing written, idempotency, independence from the preset afterwards, and
 * the order the rows are locked in.
 */

let db: Database;
let statements: string[];
let me: string;
let other: string;

const mine: AppearanceSnapshot = {
  version: 1,
  preset: "expressive",
  presetRevision: 2,
  defaults: { fontSize: 13 },
  numbering: { version: 1, preset: "decimal" },
};

async function sermon(owner = me, kind: "sermon" | "point" = "sermon") {
  const [idea] = await db
    .insert(ideas)
    .values({ ownerId: owner, kind, title: "Grace" })
    .returning();
  return idea;
}

async function preset(owner = me, appearance: AppearanceSnapshot = mine, name = "Mine") {
  const made = await createPreset(db, owner, {
    operationId: crypto.randomUUID(),
    name,
    appearance,
  });
  if (made.status !== "created") throw new Error(made.status);
  return made.id;
}

async function choose(owner: string, presetId: string) {
  const [{ revision }] = await db
    .select({ revision: users.appearanceDefaultRevision })
    .from(users)
    .where(eq(users.id, owner));
  const set = await setAccountDefault(db, owner, {
    target: { kind: "personal", presetId },
    expectedRevision: revision,
  });
  if (set.status !== "updated") throw new Error(set.status);
}

const make = (
  sermonId: string,
  id = crypto.randomUUID(),
  choice: "default" | "balanced" = "default",
) => createOutline(db, me, sermonId, id, newOutlineDocument(me, choice));

async function stored(outlineId: string) {
  const [row] = await db
    .select()
    .from(sermonOutlineDocuments)
    .where(eq(sermonOutlineDocuments.outlineId, outlineId));
  return row;
}

const stylesOf = (row: { content: unknown }) =>
  (row.content as { attrs: { styles: Record<string, unknown> } }).attrs.styles;
const numberingOf = (row: { content: unknown }) =>
  (row.content as { attrs: { layout: { numbering: unknown } } }).attrs.layout.numbering;

const account = async (owner = me) => {
  const [row] = await db.select().from(users).where(eq(users.id, owner));
  return row;
};

beforeEach(async () => {
  ({ db, statements } = await recordingDatabase());
  me = await seedAccount(db, "user_me");
  other = await seedAccount(db, "user_other");
});

describe("a new outline's first document (A4.2C)", () => {
  it("starts from built-in Balanced for an account that chose nothing", async () => {
    const idea = await sermon();
    const made = await make(idea.id);
    expect(made.status).toBe("created");
    if (made.status !== "created") return;
    const row = await stored(made.outline.id);
    expect(row.revision).toBe(0);
    expect(stylesOf(row)).toEqual({ version: 1, preset: "balanced", presetRevision: 2 });
    expect(numberingOf(row)).toEqual({ version: 1, preset: "traditional" });
    expect(restoreSermonDocument(row.content).ok).toBe(true);
    expect((await getDocument(db, me, made.outline.id)).status).toBe("found");
  });

  it("starts from a built-in default the account chose", async () => {
    await setAccountDefault(db, me, {
      target: { kind: "builtin", preset: "minimal" },
      expectedRevision: 1,
    });
    const made = await make((await sermon()).id);
    if (made.status !== "created") throw new Error(made.status);
    expect(stylesOf(await stored(made.outline.id))).toMatchObject({ preset: "minimal" });
  });

  it("copies a personal default's styles and numbering, and names no preset", async () => {
    const id = await preset();
    await choose(me, id);
    const made = await make((await sermon()).id);
    if (made.status !== "created") throw new Error(made.status);
    const row = await stored(made.outline.id);
    expect(stylesOf(row)).toMatchObject({ preset: "expressive", defaults: { fontSize: 13 } });
    expect(numberingOf(row)).toEqual({ version: 1, preset: "decimal" });
    expect(JSON.stringify(row.content)).not.toContain(id);
  });

  it("is an independent copy: replacing, deleting, or changing the default restyles nothing", async () => {
    const id = await preset();
    await choose(me, id);
    const made = await make((await sermon()).id);
    if (made.status !== "created") throw new Error(made.status);
    const before = await stored(made.outline.id);

    const replaced = await replacePresetAppearance(db, me, {
      id,
      expectedRevision: 1,
      appearance: { ...mine, defaults: { fontSize: 20 } },
    });
    expect(replaced.status).toBe("updated");
    await setAccountDefault(db, me, {
      target: { kind: "builtin", preset: "minimal" },
      expectedRevision: 2,
    });
    expect((await deletePreset(db, me, { id, expectedRevision: 2 })).status).toBe("deleted");

    expect(await stored(made.outline.id)).toEqual(before);
  });

  it("refuses an unreadable personal default with nothing written, and never substitutes one", async () => {
    const id = await preset();
    await choose(me, id);
    // Stored by something that did not validate it: it no longer parses as a snapshot.
    await db.execute(
      sql`update appearance_presets set appearance = '{"version": 9}' where id = ${id}`,
    );
    const idea = await sermon();
    const before = await account();

    const made = await make(idea.id);
    expect(made).toEqual({ status: "refused", reason: "default_unreadable" });
    expect(await db.select().from(sermonOutlines)).toHaveLength(0);
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(0);
    expect(await account()).toEqual(before);
  });

  it("honors an explicit Balanced, without touching the account's default", async () => {
    const id = await preset();
    await choose(me, id);
    await db.execute(
      sql`update appearance_presets set appearance = '{"version": 9}' where id = ${id}`,
    );
    const idea = await sermon();
    const outlineId = crypto.randomUUID();
    expect((await make(idea.id, outlineId)).status).toBe("refused");

    const before = await account();
    const made = await make(idea.id, outlineId, "balanced");
    expect(made.status).toBe("created");
    expect(stylesOf(await stored(outlineId))).toEqual({
      version: 1,
      preset: "balanced",
      presetRevision: 2,
    });
    expect(await account()).toEqual(before);
    expect(before.defaultPersonalAppearancePresetId).toBe(id);
  });

  it("honors Balanced even once the default can be read again (owner's decision)", async () => {
    const id = await preset();
    await choose(me, id);
    const made = await make((await sermon()).id, crypto.randomUUID(), "balanced");
    if (made.status !== "created") throw new Error(made.status);
    expect(stylesOf(await stored(made.outline.id))).toMatchObject({ preset: "balanced" });
    expect((await account()).defaultPersonalAppearancePresetId).toBe(id);
  });

  it("answers a retry with the outline there is, its document untouched", async () => {
    const idea = await sermon();
    const outlineId = crypto.randomUUID();
    expect((await make(idea.id, outlineId)).status).toBe("created");
    const before = await stored(outlineId);

    // The default changed before the retry arrived: the retry must not restyle anything.
    await setAccountDefault(db, me, {
      target: { kind: "builtin", preset: "expressive" },
      expectedRevision: 1,
    });
    const again = await make(idea.id, outlineId);
    expect(again.status).toBe("exists");
    const another = await make(idea.id);
    expect(another.status).toBe("exists");
    const balancedRetry = await make(idea.id, outlineId, "balanced");
    expect(balancedRetry.status).toBe("exists");

    expect(await db.select().from(sermonOutlines)).toHaveLength(1);
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(1);
    expect(await stored(outlineId)).toEqual(before);
  });

  it("answers an unreadable default's retry of an outline already made as `exists`", async () => {
    const idea = await sermon();
    const outlineId = crypto.randomUUID();
    await make(idea.id, outlineId);
    const id = await preset();
    await choose(me, id);
    await db.execute(
      sql`update appearance_presets set appearance = '{"version": 9}' where id = ${id}`,
    );
    expect((await make(idea.id, outlineId)).status).toBe("exists");
  });

  it("never gives a document to an outline made before, legacy and empty", async () => {
    const idea = await sermon();
    const legacy = await createOutline(db, me, idea.id);
    if (legacy.status !== "created") throw new Error(legacy.status);
    expect((await make(idea.id)).status).toBe("exists");
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(0);

    // Its conversion stays lossless and applies no default.
    const id = await preset();
    await choose(me, id);
    const converted = await convertOutline(db, me, legacy.outline.id);
    expect(converted.status).toBe("converted");
    const row = await stored(legacy.outline.id);
    expect((row.content as { attrs: { styles?: unknown } }).attrs.styles ?? null).toBeNull();
  });

  it("keeps neither row when the document cannot be made", async () => {
    const idea = await sermon();
    await expect(
      createOutline(db, me, idea.id, crypto.randomUUID(), {
        prepare: async () => ({
          ok: true,
          build: async () => {
            throw new Error("injected");
          },
        }),
      }),
    ).rejects.toThrow("injected");
    expect(await db.select().from(sermonOutlines)).toHaveLength(0);
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(0);
  });

  it("refuses an account being deleted, rechecked under its lock", async () => {
    const idea = await sermon();
    await db.update(users).set({ status: "deleting" }).where(eq(users.id, me));
    expect(await make(idea.id)).toEqual({ status: "refused", reason: "account_unavailable" });
    expect(await db.select().from(sermonOutlines)).toHaveLength(0);
  });

  it("keeps the legacy answers for a missing sermon, another account's, and a point", async () => {
    expect((await make(crypto.randomUUID())).status).toBe("missing");
    expect((await make((await sermon(other)).id)).status).toBe("missing");
    expect((await make((await sermon(me, "point")).id)).status).toBe("not_sermon");
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(0);
  });

  it("does not count as developing the sermon", async () => {
    const idea = await sermon();
    await make(idea.id);
    const [after] = await db.select().from(ideas).where(eq(ideas.id, idea.id));
    expect(after.lastDevelopedAt).toBeNull();
    expect(after.updatedAt).toEqual(idea.updatedAt);
    expect(after.revision).toBe(idea.revision);
  });

  it("locks the sermon, then the account, then the default's preset, then writes", async () => {
    const id = await preset();
    await choose(me, id);
    const idea = await sermon();
    statements.length = 0;
    await make(idea.id);
    const at = (pattern: RegExp) => statements.findIndex((statement) => pattern.test(statement));
    const ideaLock = at(/from "ideas"[\s\S]* for update/i);
    const accountLock = at(/from "users"[\s\S]* for share/i);
    const presetLock = at(/from "appearance_presets"[\s\S]* for key share/i);
    const outlineInsert = at(/insert into "sermon_outlines"/i);
    const documentInsert = at(/insert into "sermon_outline_documents"/i);
    expect(ideaLock).toBeGreaterThanOrEqual(0);
    expect(ideaLock).toBeLessThan(accountLock);
    expect(accountLock).toBeLessThan(presetLock);
    expect(presetLock).toBeLessThan(outlineInsert);
    expect(outlineInsert).toBeLessThan(documentInsert);
  });

  it("is removed whole by account deletion", async () => {
    const id = await preset();
    await choose(me, id);
    await make((await sermon()).id);
    expect((await requestDeletion(db, me)).ok).toBe(true);
    const outcome = await processDeletion(db, me, {
      deleteBlobs: async () => true,
      deleteIdentity: async () => undefined,
    });
    expect(outcome).toBe("done");
    expect(await db.select().from(sermonOutlines)).toHaveLength(0);
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(0);
    expect(await db.select().from(appearancePresets)).toHaveLength(0);
  });
});
