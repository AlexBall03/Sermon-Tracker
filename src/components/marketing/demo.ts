import { activeStatuses, revisitAfterDays, unfinishedStatuses } from "@/features/ideas/model";
import type { IdeaKind, IdeaStatus } from "@/features/ideas/model";
import type { ScriptureReference } from "@/features/scripture/reference";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";

/**
 * The fictional workspace the landing page's reconstructions show. It is one
 * account, so the dashboard, the library, the outline, and the preaching
 * record all agree: every list and figure below is worked out from the same
 * ideas and occasions, by the application's own rules, and never typed in
 * beside them. Its words are in the `marketing` dictionary; nothing here is
 * read from a database, an account, or the clock.
 */

export type DemoIdea = {
  id: string;
  kind: IdeaKind;
  status: IdeaStatus;
  title: string;
  subject: string;
  notes: string;
  references: ScriptureReference[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  /** When its content was last worked on, or null if it never was. */
  lastDevelopedAt: Date | null;
};

export type DemoOutlineEntry = {
  id: string;
  type: "introduction" | "point" | "conclusion";
  /** Its place among its siblings at each level, counted from 1. Empty for a section. */
  path: number[];
  title: string;
  notes: string;
  references: ScriptureReference[];
  /** The saved point idea it was copied from. */
  sourcePointId: string | null;
};

export type DemoOccasion = {
  id: string;
  sermon: DemoIdea;
  /** A calendar date, YYYY-MM-DD. */
  preachedOn: string;
  timeOfDay: "am" | "pm" | null;
  venue: { name: string; locality: string };
  context: string;
  durationMinutes: number;
};

/** The day the workspace is seen on. Fixed, so the page reads the same whenever it is rendered. */
export const demoToday = new Date("2026-10-13T00:00:00Z");

const day = (value: string) => new Date(`${value}T00:00:00Z`);
const passage = (
  book: number,
  chapterStart: number,
  verseStart: number,
  verseEnd: number | null = null,
): ScriptureReference => ({ book, chapterStart, verseStart, chapterEnd: null, verseEnd });

/** Where the Bible reader's reconstruction is open: 2 Corinthians 12, from verse 7. */
export const demoReading = { book: 47, chapter: 12, firstVerse: 7, marked: 9 } as const;

export function demoWorkspace(locale: Locale) {
  const t = dictionary(locale, "marketing").demo;
  const contexts = dictionary(locale, "preaching").suggestedContexts;

  const idea = (
    id: string,
    kind: IdeaKind,
    status: IdeaStatus,
    words: { title: string; subject?: string; notes?: string },
    dates: { created: string; updated: string; developed: string | null },
    references: ScriptureReference[] = [],
    tags: string[] = [],
  ): DemoIdea => ({
    id,
    kind,
    status,
    title: words.title,
    subject: words.subject ?? "",
    notes: words.notes ?? "",
    references,
    tags,
    createdAt: day(dates.created),
    updatedAt: day(dates.updated),
    lastDevelopedAt: dates.developed ? day(dates.developed) : null,
  });

  const grace = idea(
    "grace",
    "sermon",
    "developing",
    t.sermons.grace,
    { created: "2026-08-30", updated: "2026-10-11", developed: "2026-10-11" },
    [passage(47, 12, 7, 10)],
    [t.tags.suffering],
  );
  const story = idea(
    "story",
    "sermon",
    "developing",
    t.sermons.story,
    { created: "2026-09-08", updated: "2026-10-08", developed: "2026-10-08" },
    [passage(1, 50, 15, 21)],
    [t.tags.suffering, t.tags.faith],
  );
  const alone = idea(
    "alone",
    "sermon",
    "idea",
    t.sermons.alone,
    { created: "2026-07-26", updated: "2026-10-02", developed: "2026-10-02" },
    [passage(23, 41, 10)],
    [t.tags.comfort],
  );
  const voice = idea(
    "voice",
    "sermon",
    "idea",
    t.sermons.voice,
    { created: "2026-08-03", updated: "2026-08-03", developed: null },
    [passage(11, 19, 11, 13)],
  );
  const anchor = idea(
    "anchor",
    "sermon",
    "idea",
    t.sermons.anchor,
    { created: "2026-07-19", updated: "2026-07-19", developed: null },
    [passage(58, 6, 19)],
  );
  const well = idea(
    "well",
    "sermon",
    "ready",
    t.sermons.well,
    { created: "2026-05-17", updated: "2026-09-27", developed: "2026-09-20" },
    [passage(12, 4, 8, 37)],
    [t.tags.faith],
  );
  const strength = idea(
    "strength",
    "point",
    "developing",
    t.points.strength,
    { created: "2026-09-02", updated: "2026-10-10", developed: "2026-10-10" },
    [passage(47, 12, 9)],
  );
  const faith = idea(
    "faith",
    "point",
    "idea",
    t.points.faith,
    { created: "2026-05-20", updated: "2026-09-18", developed: null },
    [passage(12, 4, 26)],
  );
  const waiting = idea("waiting", "undecided", "idea", t.undecided.waiting, {
    created: "2026-10-06",
    updated: "2026-10-06",
    developed: null,
  });

  const ideas = [grace, story, alone, voice, anchor, well, strength, faith, waiting];
  const sermons = ideas.filter((item) => item.kind === "sermon");

  const entry = (
    id: keyof typeof t.outline,
    type: DemoOutlineEntry["type"],
    path: number[],
    references: ScriptureReference[] = [],
    sourcePointId: string | null = null,
  ): DemoOutlineEntry => ({ id, type, path, ...t.outline[id], references, sourcePointId });

  /** The outline of "His Grace Is Sufficient", in the order it is read. */
  const outline = {
    sermon: grace,
    entries: [
      entry("introduction", "introduction", []),
      entry("given", "point", [1], [passage(47, 12, 7)]),
      entry("exalted", "point", [1, 1]),
      entry("messenger", "point", [1, 2]),
      entry("answered", "point", [2], [passage(47, 12, 8, 9)]),
      entry("grace", "point", [2, 1]),
      entry("power", "point", [3], [passage(47, 12, 9, 10)], strength.id),
      entry("conclusion", "conclusion", []),
    ],
  };

  /** How many entries each outlined sermon's outline holds. Only the first is drawn. */
  const outlineSizes = new Map<string, number>([
    [grace.id, outline.entries.length],
    [story.id, 6],
  ]);

  const occasion = (
    id: string,
    sermon: DemoIdea,
    preachedOn: string,
    timeOfDay: DemoOccasion["timeOfDay"],
    venue: DemoOccasion["venue"],
    context: string,
    durationMinutes: number,
  ): DemoOccasion => ({ id, sermon, preachedOn, timeOfDay, venue, context, durationMinutes });

  /** Every occasion the account has recorded, most recent first. */
  const occasions = [
    occasion("o3", well, "2026-09-27", "am", t.venues.church, contexts.regular_service, 38),
    occasion("o2", alone, "2026-08-16", "pm", t.venues.church, contexts.regular_service, 31),
    occasion("o1", well, "2026-06-14", null, t.venues.camp, contexts.special_service, 26),
  ];

  const developed = (item: DemoIdea) => (item.lastDevelopedAt ?? item.createdAt).getTime();
  const quietSince = demoToday.getTime() - revisitAfterDays * 24 * 60 * 60 * 1000;
  const active: readonly IdeaStatus[] = activeStatuses;
  const unfinished: readonly IdeaStatus[] = unfinishedStatuses;

  return {
    firstName: t.firstName,
    initials: t.initials,
    ideas,
    outline,
    occasions,
    /** Sermons at Idea or Developing whose content has been worked on, most recent first, up to four. */
    continueWorking: sermons
      .filter((item) => active.includes(item.status) && item.lastDevelopedAt)
      .sort((a, b) => developed(b) - developed(a))
      .slice(0, 4)
      .map((sermon) => ({ sermon, entryCount: outlineSizes.get(sermon.id) ?? null })),
    /** Unfinished sermons not worked on for `revisitAfterDays`, longest left first, up to three. */
    revisit: sermons
      .filter((item) => unfinished.includes(item.status) && developed(item) <= quietSince)
      .sort((a, b) => developed(a) - developed(b))
      .slice(0, 3),
    /** The latest ideas of every kind. */
    recentIdeas: [...ideas].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    recentPreaching: occasions.slice(0, 3),
    counts: {
      sermons: sermons.length,
      points: ideas.filter((item) => item.kind === "point").length,
      // Sermons only, as the dashboard counts it.
      developing: sermons.filter((item) => item.status === "developing").length,
    },
    timesPreached: occasions.length,
  };
}

export type DemoWorkspace = ReturnType<typeof demoWorkspace>;
