// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, ideaScriptureReferences, ideaTags, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { locales } from "@/i18n/locales";
import { classificationOptions } from "./classification";
import {
  archiveIdea,
  classifyIdea,
  createIdea,
  getIdea,
  recentIdeas,
  restoreIdea,
  searchIdeas,
  setIdeaKind,
  updateIdea,
} from "./ideas";
import { defaultLibraryQuery, parseLibraryQuery } from "./library-query";
import {
  classificationDefaults,
  ideaStatuses,
  intendedFormats,
  sermonTypes,
  type IdeaStatus,
  type SermonType,
} from "./model";
import {
  classificationInputSchema,
  emptyDraft,
  ideaInputSchema,
  ideaUpdateSchema,
  type IdeaReference,
} from "./schemas";
import { createTag } from "./tags";

describe("the classification vocabulary", () => {
  it("is the four statuses, four formats, and three types with unspecified", () => {
    expect(ideaStatuses).toEqual(["idea", "developing", "ready", "on_hold"]);
    expect(intendedFormats).toEqual(["full_length", "mini", "flexible", "unspecified"]);
    expect(sermonTypes).toEqual(["topical", "textual", "expository", "unspecified"]);
    expect(classificationDefaults).toEqual({
      status: "idea",
      intendedFormat: "unspecified",
      sermonType: "unspecified",
    });
    expect(emptyDraft).toMatchObject(classificationDefaults);
  });

  it("accepts every value on a new idea, and gives the defaults when none is named", () => {
    expect(ideaInputSchema.parse({ title: "T" })).toMatchObject(classificationDefaults);
    for (const status of ideaStatuses) {
      expect(ideaInputSchema.parse({ title: "T", status }).status).toBe(status);
    }
    for (const intendedFormat of intendedFormats) {
      expect(ideaInputSchema.parse({ title: "T", intendedFormat }).intendedFormat).toBe(
        intendedFormat,
      );
    }
    for (const sermonType of sermonTypes) {
      expect(ideaInputSchema.parse({ title: "T", sermonType }).sermonType).toBe(sermonType);
    }
  });

  it("refuses a value that is not on the list, on a new idea, a save, and a change", () => {
    const wrong = [
      { status: "captured" },
      { status: "preached" },
      { status: "inbox" },
      { status: "archived" },
      { status: null },
      { intendedFormat: "preaching_class" },
      { intendedFormat: "Mini" },
      { intendedFormat: 5 },
      { sermonType: "verse_by_verse" },
      { sermonType: "narrative" },
      { sermonType: null },
      { sermonType: ["topical", "textual"] },
    ];
    for (const fields of wrong) {
      expect(ideaInputSchema.safeParse({ title: "T", ...fields }).success).toBe(false);
      expect(ideaUpdateSchema.safeParse({ title: "T", ...fields }).success).toBe(false);
      expect(classificationInputSchema.safeParse(fields).success).toBe(false);
    }
  });

  it("gives a save no default: a classification left out stays left out", () => {
    const parsed = ideaUpdateSchema.parse({ title: "Only the title" });
    expect(parsed.status).toBeUndefined();
    expect(parsed.intendedFormat).toBeUndefined();
    expect(parsed.sermonType).toBeUndefined();
    const one = ideaUpdateSchema.parse({ title: "T", status: "ready" });
    expect(one.status).toBe("ready");
    expect(one.intendedFormat).toBeUndefined();
  });

  it("takes a change of any one classification, or several, but not of nothing", () => {
    expect(classificationInputSchema.parse({ status: "on_hold" })).toEqual({ status: "on_hold" });
    expect(classificationInputSchema.parse({ intendedFormat: "mini" })).toEqual({
      intendedFormat: "mini",
    });
    expect(
      classificationInputSchema.parse({ status: "ready", sermonType: "textual", title: "x" }),
    ).toEqual({ status: "ready", sermonType: "textual" });
    expect(classificationInputSchema.safeParse({}).success).toBe(false);
    expect(classificationInputSchema.safeParse({ archivedAt: new Date() }).success).toBe(false);
    expect(classificationInputSchema.safeParse(null).success).toBe(false);
  });

  it.each(locales)("names and explains every value in %s", (locale) => {
    const options = classificationOptions(locale);
    expect(options.statuses.map((option) => option.value)).toEqual([...ideaStatuses]);
    expect(options.formats.map((option) => option.value)).toEqual([...intendedFormats]);
    expect(options.sermonTypes.map((option) => option.value)).toEqual([...sermonTypes]);
    const words = [
      ...options.statuses.flatMap((option) => [option.label, option.meaning]),
      ...options.formats.flatMap((option) => [option.label, option.meaning]),
      ...options.sermonTypes.flatMap((option) => [option.label, option.definition]),
      // A sermon with no type yet is not an example of anything.
      ...options.sermonTypes
        .filter((option) => option.value !== "unspecified")
        .map((option) => option.example),
    ];
    for (const word of words) expect(word.trim()).not.toBe("");
  });

  it("gives the definitions and examples as they were written", () => {
    const { statuses, formats, sermonTypes: types } = classificationOptions("en");
    expect(statuses.map((option) => option.label)).toEqual([
      "Idea",
      "Developing",
      "Ready",
      "On Hold",
    ]);
    expect(formats.map((option) => option.label)).toEqual([
      "Full-Length",
      "Mini",
      "Flexible",
      "Not Specified",
    ]);
    expect(types.map((option) => option.label)).toEqual([
      "Topical",
      "Textual",
      "Expository",
      "Not Specified",
    ]);
    expect(types[0].definition).toMatch(/organized around a particular subject/);
    expect(types[0].example).toMatch(/The Importance of Prayer/);
    expect(types[1].example).toMatch(/1 Samuel 17:29/);
    expect(types[2].example).toMatch(/Psalm 23/);
    // Spanish says the same things in its own words.
    const spanish = classificationOptions("es");
    expect(spanish.statuses[3].label).toBe("En pausa");
    expect(spanish.sermonTypes[0].example).toMatch(/La importancia de la oración/);
    // The title is the verse as the RVG has it, not the English put into Spanish.
    expect(spanish.sermonTypes[1].example).toMatch(/¿Acaso no hay una causa\?/);
  });

  it("reads a library address from when `idea` was called `captured`", () => {
    expect(parseLibraryQuery({ status: "captured" }).statuses).toEqual(["idea"]);
    expect(parseLibraryQuery({ status: ["captured", "idea", "on_hold"] }).statuses).toEqual([
      "idea",
      "on_hold",
    ]);
    for (const type of sermonTypes) {
      expect(parseLibraryQuery({ type }).sermonTypes).toEqual([type]);
    }
  });
});

describe("classifications in the database", () => {
  let db: Database;
  let me: string;
  let other: string;

  beforeEach(async () => {
    db = await createTestDatabase();
    const rows = await db
      .insert(users)
      .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
      .returning();
    [me, other] = rows.map((row) => row.id);
  });

  const input = (fields: Record<string, unknown>) => ideaInputSchema.parse(fields);
  const change = (fields: Record<string, unknown>) => ideaUpdateSchema.parse(fields);
  const john316: IdeaReference = {
    book: 43,
    chapterStart: 3,
    verseStart: 16,
    chapterEnd: null,
    verseEnd: null,
    isPrimary: true,
  };

  /** A sermon with everything on it: classifications, notes, a passage, and a tag. */
  async function whole() {
    const tag = await createTag(db, me, "Faith");
    if (!tag.ok) throw new Error("no tag");
    const idea = await createIdea(
      db,
      me,
      input({
        kind: "sermon",
        title: "Is There Not a Cause?",
        notes: "1 Samuel 17.",
        subject: "Courage",
        status: "developing",
        intendedFormat: "flexible",
        sermonType: "textual",
        references: [john316],
        tagIds: [tag.tag.id],
      }),
    );
    return { id: idea!.id, tag: { id: tag.tag.id, name: "Faith" } };
  }

  const kept = {
    kind: "sermon",
    title: "Is There Not a Cause?",
    notes: "1 Samuel 17.",
    subject: "Courage",
    status: "developing",
    intendedFormat: "flexible",
    sermonType: "textual",
    references: [john316],
  };

  describe("a new idea", () => {
    it("is an idea of no stated format or type, and is not archived", async () => {
      const idea = await createIdea(db, me, input({ title: "A thought" }));
      expect(idea).toMatchObject({ ...classificationDefaults, archivedAt: null });
      expect(await getIdea(db, me, idea!.id)).toMatchObject({
        ...classificationDefaults,
        archivedAt: null,
      });
    });

    it("gets the same defaults from the table itself", async () => {
      const [row] = await db.insert(ideas).values({ ownerId: me, title: "Bare" }).returning();
      expect(row).toMatchObject({ ...classificationDefaults, archivedAt: null });
    });

    it("keeps the classifications it was given", async () => {
      const idea = await createIdea(
        db,
        me,
        input({
          kind: "sermon",
          title: "David and Goliath",
          status: "ready",
          intendedFormat: "full_length",
          sermonType: "expository",
        }),
      );
      expect(await getIdea(db, me, idea!.id)).toMatchObject({
        status: "ready",
        intendedFormat: "full_length",
        sermonType: "expository",
        archivedAt: null,
      });
    });

    it("takes every value of every classification", async () => {
      for (const status of ideaStatuses) {
        for (const intendedFormat of intendedFormats) {
          const sermonType = sermonTypes[ideaStatuses.indexOf(status)];
          const idea = await createIdea(
            db,
            me,
            input({ title: "T", status, intendedFormat, sermonType }),
          );
          expect(idea).toMatchObject({ status, intendedFormat, sermonType });
        }
      }
    });
  });

  describe("a save", () => {
    it("of the title alone leaves every classification as it was", async () => {
      const { id, tag } = await whole();
      const saved = await updateIdea(
        db,
        me,
        id,
        change({
          kind: "sermon",
          title: "Renamed",
          notes: "1 Samuel 17.",
          subject: "Courage",
          references: [john316],
        }),
      );
      expect(saved).toMatchObject({ ...kept, title: "Renamed", tags: [tag] });
      expect(await getIdea(db, me, id)).toMatchObject({ ...kept, title: "Renamed", tags: [tag] });
    });

    it("of the notes alone leaves every classification as it was", async () => {
      const { id } = await whole();
      await updateIdea(
        db,
        me,
        id,
        change({
          kind: "sermon",
          title: kept.title,
          notes: "More thought.",
          subject: "Courage",
          references: [john316],
        }),
      );
      expect(await getIdea(db, me, id)).toMatchObject({ ...kept, notes: "More thought." });
    });

    it("sets the classifications it names and no others", async () => {
      const { id } = await whole();
      const fields = { kind: "sermon", title: kept.title, references: [john316] };
      await updateIdea(db, me, id, change({ ...fields, status: "ready" }));
      expect(await getIdea(db, me, id)).toMatchObject({
        status: "ready",
        intendedFormat: "flexible",
        sermonType: "textual",
      });
      await updateIdea(db, me, id, change({ ...fields, intendedFormat: "mini" }));
      expect(await getIdea(db, me, id)).toMatchObject({
        status: "ready",
        intendedFormat: "mini",
        sermonType: "textual",
      });
      await updateIdea(db, me, id, change({ ...fields, sermonType: "unspecified" }));
      expect(await getIdea(db, me, id)).toMatchObject({
        status: "ready",
        intendedFormat: "mini",
        sermonType: "unspecified",
      });
    });

    it("of the whole draft, as the editor sends it, keeps a format the editor does not show", async () => {
      const { id, tag } = await whole();
      const idea = (await getIdea(db, me, id))!;
      // What the idea page builds and the editor sends back on Save.
      const draft = {
        kind: idea.kind,
        title: "Edited in the editor",
        notes: idea.notes ?? "",
        status: idea.status,
        intendedFormat: idea.intendedFormat,
        sermonType: idea.sermonType,
        subject: idea.subject ?? "",
        references: idea.references,
        tagIds: idea.tags.map((item) => item.id),
      };
      await updateIdea(db, me, id, change(draft));
      expect(await getIdea(db, me, id)).toMatchObject({
        ...kept,
        title: "Edited in the editor",
        tags: [tag],
      });
    });
  });

  describe("classifyIdea", () => {
    it("changes each classification by itself", async () => {
      const { id } = await whole();
      expect(await classifyIdea(db, me, id, { status: "on_hold" })).toMatchObject({
        status: "on_hold",
        intendedFormat: "flexible",
        sermonType: "textual",
      });
      expect(await classifyIdea(db, me, id, { intendedFormat: "full_length" })).toMatchObject({
        status: "on_hold",
        intendedFormat: "full_length",
        sermonType: "textual",
      });
      expect(await classifyIdea(db, me, id, { sermonType: "topical" })).toMatchObject({
        status: "on_hold",
        intendedFormat: "full_length",
        sermonType: "topical",
      });
      expect(
        await classifyIdea(db, me, id, { status: "idea", sermonType: "unspecified" }),
      ).toMatchObject({ status: "idea", intendedFormat: "full_length", sermonType: "unspecified" });
    });

    it("lets any status follow any other", async () => {
      const { id } = await whole();
      for (const from of ideaStatuses) {
        for (const to of ideaStatuses) {
          await classifyIdea(db, me, id, { status: from });
          expect((await classifyIdea(db, me, id, { status: to }))?.status).toBe(to);
        }
      }
    });

    it("leaves the content, the passages, the tags, the kind, and the owner alone", async () => {
      const { id, tag } = await whole();
      await classifyIdea(db, me, id, {
        status: "ready",
        intendedFormat: "mini",
        sermonType: "expository",
      });
      expect(await getIdea(db, me, id)).toMatchObject({
        ...kept,
        ownerId: me,
        status: "ready",
        intendedFormat: "mini",
        sermonType: "expository",
        archivedAt: null,
        tags: [tag],
      });
      expect(await db.select().from(ideaScriptureReferences)).toHaveLength(1);
      expect(await db.select().from(ideaTags)).toHaveLength(1);
    });

    it("does nothing to another account's idea, or to one that does not exist", async () => {
      const { id } = await whole();
      expect(await classifyIdea(db, other, id, { status: "ready" })).toBeNull();
      expect(
        await classifyIdea(db, me, "99999999-9999-4999-8999-999999999999", { status: "ready" }),
      ).toBeNull();
      expect(await getIdea(db, me, id)).toMatchObject(kept);
    });

    it("keeps a sermon's classifications when it is reclassified, and gives them back", async () => {
      const { id } = await whole();
      await setIdeaKind(db, me, id, "point");
      expect(await getIdea(db, me, id)).toMatchObject({ ...kept, kind: "point" });
      await setIdeaKind(db, me, id, "sermon");
      expect(await getIdea(db, me, id)).toMatchObject(kept);
    });
  });

  describe("archiving", () => {
    it("marks the idea with when, and changes nothing else", async () => {
      const { id, tag } = await whole();
      const before = (await getIdea(db, me, id))!;
      const archived = await archiveIdea(db, me, id);
      expect(archived?.archivedAt).toBeInstanceOf(Date);

      const after = (await getIdea(db, me, id))!;
      expect(after).toEqual({ ...before, archivedAt: archived!.archivedAt });
      expect(after).toMatchObject({ ...kept, ownerId: me, tags: [tag] });
      // Putting an idea away is not an edit.
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it("is undone by restoring, which gives the idea back exactly as it was", async () => {
      const { id } = await whole();
      const before = (await getIdea(db, me, id))!;
      await archiveIdea(db, me, id);
      const restored = await restoreIdea(db, me, id);
      expect(restored?.archivedAt).toBeNull();
      expect(await getIdea(db, me, id)).toEqual(before);
    });

    it("keeps whatever status the idea had, whichever it was", async () => {
      for (const status of ideaStatuses) {
        const idea = await createIdea(db, me, input({ title: status, status }));
        expect((await archiveIdea(db, me, idea!.id))?.status).toBe(status);
        expect((await restoreIdea(db, me, idea!.id))?.status).toBe(status);
      }
    });

    it("can be repeated: the first date is kept, and restoring twice is restoring once", async () => {
      const { id } = await whole();
      const first = await archiveIdea(db, me, id);
      // The clock moves on; the date the idea was archived does not.
      await db.execute(sql`select pg_sleep(0.02)`);
      const second = await archiveIdea(db, me, id);
      expect(second?.archivedAt).toEqual(first?.archivedAt);

      expect((await restoreIdea(db, me, id))?.archivedAt).toBeNull();
      expect((await restoreIdea(db, me, id))?.archivedAt).toBeNull();
      expect(await getIdea(db, me, id)).toMatchObject({ ...kept, archivedAt: null });

      // And an idea can be archived again after it has been restored.
      expect((await archiveIdea(db, me, id))?.archivedAt).toBeInstanceOf(Date);
    });

    it("leaves a classification free to change while the idea is archived", async () => {
      const { id } = await whole();
      const archived = await archiveIdea(db, me, id);
      await classifyIdea(db, me, id, { status: "ready" });
      expect(await getIdea(db, me, id)).toMatchObject({
        status: "ready",
        archivedAt: archived!.archivedAt,
      });
      expect(await restoreIdea(db, me, id)).toMatchObject({ status: "ready", archivedAt: null });
    });

    it("is not touched by a save of the idea", async () => {
      const { id } = await whole();
      const archived = await archiveIdea(db, me, id);
      await updateIdea(db, me, id, change({ kind: "sermon", title: "Renamed while away" }));
      expect((await getIdea(db, me, id))?.archivedAt).toEqual(archived!.archivedAt);
    });

    it("cannot be done to, or undone on, another account's idea", async () => {
      const { id } = await whole();
      expect(await archiveIdea(db, other, id)).toBeNull();
      expect((await getIdea(db, me, id))?.archivedAt).toBeNull();

      const archived = await archiveIdea(db, me, id);
      expect(await restoreIdea(db, other, id)).toBeNull();
      expect((await getIdea(db, me, id))?.archivedAt).toEqual(archived!.archivedAt);

      const unknown = "99999999-9999-4999-8999-999999999999";
      expect(await archiveIdea(db, me, unknown)).toBeNull();
      expect(await restoreIdea(db, me, unknown)).toBeNull();
    });

    it("does not delete: the idea is still read, and found when the archive is asked for", async () => {
      const { id } = await whole();
      await archiveIdea(db, me, id);
      expect(await getIdea(db, me, id)).not.toBeNull();
      // Put away: not among the recent ideas, and not in the library as it opens.
      expect(await recentIdeas(db, me, 10)).toEqual([]);
      expect((await searchIdeas(db, me, defaultLibraryQuery)).total).toBe(0);
      const archived = await searchIdeas(db, me, { ...defaultLibraryQuery, archive: "archived" });
      expect(archived.items.map((idea) => idea.id)).toEqual([id]);
    });
  });

  describe("the table", () => {
    const insert = (values: Partial<typeof ideas.$inferInsert>) =>
      db.insert(ideas).values({ ownerId: me, title: "Fine", ...values });

    it("refuses a classification that is not on its list", async () => {
      await expect(insert({ status: "preached" as never })).rejects.toThrow();
      await expect(insert({ status: "archived" as never })).rejects.toThrow();
      await expect(insert({ intendedFormat: "long" as never })).rejects.toThrow();
      await expect(insert({ intendedFormat: null as never })).rejects.toThrow();
      await expect(insert({ sermonType: "verse_by_verse" as never })).rejects.toThrow();
    });

    it("takes every value on each list", async () => {
      for (const status of ideaStatuses) await expect(insert({ status })).resolves.toBeDefined();
      for (const intendedFormat of intendedFormats) {
        await expect(insert({ intendedFormat })).resolves.toBeDefined();
      }
      for (const sermonType of sermonTypes) {
        await expect(insert({ sermonType })).resolves.toBeDefined();
      }
    });
  });

  /*
   * The deployment that was live while this migration ran writes `captured`
   * and no sermon type, and rows from before it hold them still. They are
   * admitted by the table and read as `idea` and `unspecified`.
   */
  describe("an idea saved before the classifications were renamed", () => {
    /** PGlite answers a raw statement with its rows. */
    const rowsOf = (result: unknown) => (result as { rows: Record<string, unknown>[] }).rows;

    async function legacy(fields: { kind?: string; sermonType?: string | null } = {}) {
      const result = await db.execute(sql`
        insert into ideas (owner_id, kind, title, notes, status, sermon_type, subject)
        values (${me}, ${fields.kind ?? "sermon"}, 'From before', null, 'captured',
                ${fields.sermonType ?? null}, null)
        returning id
      `);
      return rowsOf(result)[0].id as string;
    }
    const stored = async (id: string) => {
      const result = await db.execute(
        sql`select status, sermon_type, intended_format, archived_at from ideas where id = ${id}`,
      );
      return rowsOf(result)[0];
    };

    it("is accepted as the old code writes it, and read in the new words", async () => {
      const id = await legacy();
      expect(await stored(id)).toEqual({
        status: "captured",
        sermon_type: null,
        intended_format: "unspecified",
        archived_at: null,
      });
      expect(await getIdea(db, me, id)).toMatchObject({
        ...classificationDefaults,
        archivedAt: null,
      });
      expect((await recentIdeas(db, me, 5))[0]).toMatchObject(classificationDefaults);
      const page = await searchIdeas(db, me, defaultLibraryQuery);
      expect(page.items[0]).toMatchObject(classificationDefaults);
    });

    it("is found by the filters for `idea` and for no stated type", async () => {
      const id = await legacy();
      const found = async (fields: { statuses?: IdeaStatus[]; sermonTypes?: SermonType[] }) =>
        (await searchIdeas(db, me, { ...defaultLibraryQuery, ...fields })).items.map(
          (idea) => idea.id,
        );
      expect(await found({ statuses: ["idea"] })).toEqual([id]);
      expect(await found({ statuses: ["idea", "ready"] })).toEqual([id]);
      expect(await found({ statuses: ["developing", "ready", "on_hold"] })).toEqual([]);
      expect(await found({ sermonTypes: ["unspecified"] })).toEqual([id]);
      expect(await found({ sermonTypes: ["topical", "unspecified"] })).toEqual([id]);
      expect(await found({ sermonTypes: ["topical", "textual", "expository"] })).toEqual([]);
      // A type, stated or not, is still a sermon's alone.
      const point = await legacy({ kind: "point" });
      expect(await found({ sermonTypes: ["unspecified"] })).toEqual([id]);
      expect(await found({ statuses: ["idea"] })).toHaveLength(2);
      expect(point).not.toBe(id);
    });

    it("is written in the new words by the next thing that sets them, and not before", async () => {
      const id = await legacy({ sermonType: "expository" });
      // Reclassifying, archiving, and restoring name neither column.
      await setIdeaKind(db, me, id, "point");
      await archiveIdea(db, me, id);
      await restoreIdea(db, me, id);
      expect(await stored(id)).toMatchObject({ status: "captured", sermon_type: "expository" });
      expect(await getIdea(db, me, id)).toMatchObject({ status: "idea", sermonType: "expository" });

      // A save that names only the title leaves them too.
      await updateIdea(db, me, id, change({ kind: "point", title: "Renamed" }));
      expect(await stored(id)).toMatchObject({ status: "captured", sermon_type: "expository" });

      await classifyIdea(db, me, id, { status: "developing" });
      expect(await stored(id)).toMatchObject({ status: "developing", sermon_type: "expository" });
    });

    it("is never written as `captured` by anything here", async () => {
      await createIdea(db, me, input({ title: "New" }));
      const { id } = await whole();
      await classifyIdea(db, me, id, { status: "idea" });
      const rows = await db
        .select({ status: ideas.status })
        .from(ideas)
        .where(eq(ideas.ownerId, me));
      expect(rows.map((row) => row.status)).toEqual(["idea", "idea"]);
    });
  });
});
