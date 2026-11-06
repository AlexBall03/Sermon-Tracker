import {
  componentKinds,
  componentTypeFields,
  fontKeys,
  levelFields,
  namedStyles,
  paragraphPropsShape,
  textPropsShape,
} from "@/features/editor-lab/styles/model";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { maxDepth } from "@/features/editor-lab/v4/model";
import { numberingLimits } from "@/features/outlines/model";

/*
 * Test fixtures: the largest appearances the snapshot schema admits, built
 * from the schema's own field lists so a new property is covered by itself.
 * Every section, every component kind, every level from 1 to `maxDepth`, and
 * every property set; a custom numbering at its most levels.
 *
 * - `realistic`: the values a person can choose in the controls (whole or
 *   half points, theme-aware colors, the longest font key).
 * - `adversarial`: the same, with every free number at seventeen significant
 *   digits and every numbering text at its length limit in four-byte
 *   characters: schema-valid, but not something the controls write. Whether
 *   it fits the stored limit is what the tests measure; nothing assumes it.
 */

type Kind = "realistic" | "adversarial";

const longestFont = [...fontKeys].sort((a, b) => b.length - a.length)[0];
const themed = { mode: "themed", light: "#a1b2c3", dark: "#d4e5f6" } as const;

const ranges: Record<string, [number, number]> = {
  lineHeight: [1, 3],
  spaceBefore: [0, 72],
  spaceAfter: [0, 72],
  indentLeft: [0, 432],
  indentFirst: [-144, 144],
  levelIndent: [6, 72],
  borderWidth: [0, 4],
  accentWidth: [0, 6],
  radius: [0, 12],
  paddingBlock: [0, 24],
  paddingInline: [0, 36],
  outsideBefore: [0, 48],
  outsideAfter: [0, 48],
  markerGap: [0, 36],
};

const colors = new Set([
  "color",
  "titleColor",
  "notationColor",
  "referenceColor",
  "labelColor",
  "border",
  "fill",
  "accent",
]);
const flags = new Set([
  "bold",
  "italic",
  "underline",
  "markerVisible",
  "markerBold",
  "markerItalic",
  "hanging",
]);
const enums: Record<string, string> = {
  fontFamily: longestFont,
  markerFont: longestFont,
  labelFont: longestFont,
  align: "justify",
  borderStyle: "dashed",
  accentPosition: "right",
  markerAlign: "right",
};

function valueFor(field: string, kind: Kind): unknown {
  if (field === "fontSize" || field === "markerSize") return 143.5;
  if (colors.has(field)) return themed;
  if (flags.has(field)) return false;
  if (field in enums) return enums[field];
  const range = ranges[field];
  if (!range) throw new Error(`No fixture value for ${field}`);
  const [min, max] = range;
  // The negative end where there is one: a minus sign is one more byte.
  if (kind === "realistic") return min < 0 ? min + 0.5 : max - 0.5;
  return min < 0 ? min + 0.1234567890123456 : max - 0.1234567890123456;
}

const fill = (fields: readonly string[], kind: Kind) =>
  Object.fromEntries(fields.map((field) => [field, valueFor(field, kind)]));

const blockFields = [...Object.keys(textPropsShape), ...Object.keys(paragraphPropsShape), "align"];

export function largestSnapshot(kind: Kind): AppearanceSnapshot {
  const text = (limit: number) =>
    kind === "realistic" ? "x".repeat(limit) : "😀".repeat(Math.floor(limit / 2));
  return {
    version: 1,
    preset: "expressive",
    presetRevision: 2,
    defaults: fill([...blockFields, "levelIndent"], kind),
    named: Object.fromEntries(namedStyles.map((name) => [name, fill(blockFields, kind)])),
    components: Object.fromEntries(
      componentKinds.map((component) => [component, fill(componentTypeFields(component), kind)]),
    ),
    levels: Object.fromEntries(
      Array.from({ length: maxDepth }, (_, index) => [String(index + 1), fill(levelFields, kind)]),
    ),
    numbering: {
      version: 1,
      preset: "custom",
      levels: Array.from({ length: numberingLimits.levels }, () => ({
        counter: "decimal" as const,
        case: "upper" as const,
        bullet: "•" as const,
        prefix: text(numberingLimits.prefix),
        suffix: text(numberingLimits.suffix),
        composite: true,
        separator: text(numberingLimits.separator),
      })),
      overflow: "repeat",
      repeatFrom: 0,
    },
  } as AppearanceSnapshot;
}

/** An in-memory database with the committed migrations, recording every statement sent. */
export async function recordingDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("@/db/schema");
  const { ownTestClient } = await import("@/db/test-lifecycle");
  const statements: string[] = [];
  // Closed when its test or file ends, like createTestDatabase's (src/db/test-lifecycle.ts).
  const client = ownTestClient(new PGlite());
  const db = drizzle({
    client,
    schema,
    logger: { logQuery: (query: string) => statements.push(query) },
  });
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
  statements.length = 0;
  return { db: db as unknown as import("@/db/types").Database, statements };
}

/** An account that may use the application (past setup), or one in the state given. */
export async function seedAccount(
  db: import("@/db/types").Database,
  clerkUserId: string,
  state: "active" | "disabled" | "deleting" | "pending" = "active",
) {
  const { users } = await import("@/db/schema");
  const [row] = await db
    .insert(users)
    .values({
      clerkUserId,
      status: state === "disabled" || state === "deleting" ? state : "active",
      onboardingStatus: state === "pending" ? "pending" : "grandfathered",
    })
    .returning();
  return row.id;
}
