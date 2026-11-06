// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ownTestClient } from "@/db/test-lifecycle";
import { userPresetIds } from "@/features/editor-lab/styles/model";
import { presetAt } from "@/features/editor-lab/styles/presets";
import {
  appearanceSnapshotSchema,
  materialize,
  type AppearanceSnapshot,
} from "@/features/editor-lab/styles/snapshot";
import { builtinPresetIds } from "./builtin";
import {
  canonicalJson,
  compactBytes,
  createPresetInput,
  hasUnknownKeys,
  prepareAppearance,
  presetLimits,
  presetNameSchema,
  readStoredAppearance,
  setDefaultInput,
} from "./model";
import { fingerprint } from "./presets";
import { largestSnapshot } from "./testing";

const decimal = { version: 1, preset: "decimal" } as const;
const minimal: AppearanceSnapshot = {
  version: 1,
  preset: "balanced",
  presetRevision: 2,
  numbering: decimal,
};

let pg: PGlite;
beforeAll(() => {
  pg = ownTestClient(new PGlite());
});
afterAll(() => pg.close());

/** What the table's CHECK measures: PostgreSQL's own text of the jsonb, in bytes. */
const storedBytes = async (value: unknown) =>
  (
    await pg.query<{ bytes: number }>(`select octet_length($1::jsonb::text) as bytes`, [
      JSON.stringify(value),
    ])
  ).rows[0].bytes;

describe("built-in presets", () => {
  it("are the editor's own three", () => {
    expect([...builtinPresetIds]).toEqual([...userPresetIds]);
  });
});

describe("preset names", () => {
  it("are trimmed and kept in their case", () => {
    expect(presetNameSchema.parse("  Sunday Morning ")).toBe("Sunday Morning");
    expect(presetNameSchema.parse("ÉPHÈSE")).toBe("ÉPHÈSE");
  });

  it("are 1 to 80 characters, counted as PostgreSQL counts them", () => {
    expect(presetNameSchema.safeParse("   ").success).toBe(false);
    expect(presetNameSchema.safeParse("x".repeat(80)).success).toBe(true);
    expect(presetNameSchema.safeParse("x".repeat(81)).success).toBe(false);
    // 80 emoji are 160 UTF-16 units but 80 characters.
    expect(presetNameSchema.safeParse("😀".repeat(80)).success).toBe(true);
    expect(presetNameSchema.safeParse("😀".repeat(81)).success).toBe(false);
  });

  it("are one line, with no control characters", () => {
    for (const bad of ["a\nb", "a\u0000b", "a b", "a\tb"]) {
      expect(presetNameSchema.safeParse(bad).success).toBe(false);
    }
    expect(presetNameSchema.safeParse(42).success).toBe(false);
  });
});

describe("request inputs", () => {
  it("refuse unknown keys, an owner among them", () => {
    const create = {
      operationId: crypto.randomUUID(),
      name: "A",
      appearance: minimal,
    };
    expect(createPresetInput.safeParse(create).success).toBe(true);
    expect(createPresetInput.safeParse({ ...create, ownerId: crypto.randomUUID() }).success).toBe(
      false,
    );
    expect(createPresetInput.safeParse({ ...create, operationId: "nope" }).success).toBe(false);
  });

  it("take a built-in or a personal default, and nothing else", () => {
    const at = (target: unknown) => setDefaultInput.safeParse({ target, expectedRevision: 1 });
    expect(at({ kind: "builtin", preset: "minimal" }).success).toBe(true);
    expect(at({ kind: "personal", presetId: crypto.randomUUID() }).success).toBe(true);
    expect(at({ kind: "builtin", preset: "baseline" }).success).toBe(false);
    expect(at({ kind: "personal", presetId: crypto.randomUUID(), preset: "minimal" }).success).toBe(
      false,
    );
    expect(
      setDefaultInput.safeParse({ target: { kind: "builtin", preset: "minimal" } }).success,
    ).toBe(false);
  });
});

describe("prepareAppearance", () => {
  it("stores the materialized snapshot, which keeps its look", () => {
    const prepared = prepareAppearance(minimal);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.snapshot).toEqual(materialize(minimal));
    expect(prepared.snapshot.defaults).toEqual(presetAt("balanced", 2).defaults);
    expect(appearanceSnapshotSchema.safeParse(prepared.snapshot).success).toBe(true);
  });

  it("is stable: materializing what it stores changes nothing", () => {
    for (const preset of builtinPresetIds) {
      for (const presetRevision of [1, 2] as const) {
        const prepared = prepareAppearance({ ...minimal, preset, presetRevision });
        if (!prepared.ok) throw new Error("refused");
        expect(materialize(prepared.snapshot)).toEqual(prepared.snapshot);
        const again = prepareAppearance(prepared.snapshot);
        expect(again).toEqual(prepared);
      }
    }
  });

  it("keeps each built-in revision's own values (Minimal's script differs in revision 2)", () => {
    const first = prepareAppearance({ ...minimal, preset: "minimal", presetRevision: 1 });
    const second = prepareAppearance({ ...minimal, preset: "minimal", presetRevision: 2 });
    if (!first.ok || !second.ok) throw new Error("refused");
    expect(first.snapshot.presetRevision).toBe(1);
    expect(second.snapshot.presetRevision).toBe(2);
    expect(first.snapshot.components?.script).toEqual(presetAt("minimal", 1).components.script);
    expect(second.snapshot.components?.script).toEqual(presetAt("minimal", 2).components.script);
    expect(first.snapshot.components?.script).not.toEqual(second.snapshot.components?.script);
  });

  it("keeps the person's own values over the built-in ones", () => {
    const prepared = prepareAppearance({
      ...minimal,
      components: { point: { bold: false } },
      levels: { "32": { italic: true } },
    });
    if (!prepared.ok) throw new Error("refused");
    expect(prepared.snapshot.components?.point?.bold).toBe(false);
    expect(prepared.snapshot.levels?.["32"]?.italic).toBe(true);
  });

  it("accepts numbers at their bounds and refuses them past", () => {
    const at = (components: unknown) => prepareAppearance({ ...minimal, components }).ok;
    expect(at({ point: { fontSize: 4 } })).toBe(true);
    expect(at({ point: { fontSize: 144 } })).toBe(true);
    expect(at({ point: { fontSize: 144.5 } })).toBe(false);
    expect(at({ point: { fontSize: 12.25 } })).toBe(false);
    expect(at({ scripture: { radius: 12 } })).toBe(true);
    expect(at({ scripture: { radius: 12.01 } })).toBe(false);
    expect(at({ point: { indentFirst: -144 } })).toBe(true);
    expect(at({ point: { indentFirst: -144.5 } })).toBe(false);
  });

  it("accepts levels 1 to 32 and refuses any other key", () => {
    const at = (levels: unknown) => prepareAppearance({ ...minimal, levels }).ok;
    expect(at({ "1": { bold: true }, "32": { bold: true } })).toBe(true);
    for (const key of ["0", "33", "01", "1.5", "one"])
      expect(at({ [key]: { bold: true } })).toBe(false);
    // A level holds a point heading's look only: no indent.
    expect(at({ "2": { indentLeft: 12 } })).toBe(false);
  });

  it("accepts every numbering form and refuses a broken one", () => {
    const at = (numbering: unknown) => prepareAppearance({ ...minimal, numbering }).ok;
    expect(at({ version: 1, preset: "traditional" })).toBe(true);
    expect(
      at({ version: 1, preset: "custom", levels: [{ counter: "roman" }], repeatFrom: 0 }),
    ).toBe(true);
    expect(at({ version: 1, preset: "custom", levels: [], repeatFrom: 0 })).toBe(false);
    expect(
      at({ version: 1, preset: "custom", levels: [{ counter: "roman" }], repeatFrom: 1 }),
    ).toBe(false);
    expect(
      at({ version: 1, preset: "custom", levels: [{ counter: "decimal", prefix: "<b>" }] }),
    ).toBe(false);
  });

  it("refuses unsupported versions and built-in revisions", () => {
    expect(prepareAppearance({ ...minimal, version: 2 })).toEqual({ ok: false, code: "invalid" });
    expect(prepareAppearance({ ...minimal, presetRevision: 3 }).ok).toBe(false);
    expect(prepareAppearance({ ...minimal, preset: "baseline" }).ok).toBe(false);
    expect(prepareAppearance({ ...minimal, numbering: { version: 2, preset: "decimal" } }).ok).toBe(
      false,
    );
  });

  it("refuses forbidden and unknown fields anywhere, never dropping them", () => {
    for (const extra of [
      { content: [] },
      { outlineId: crypto.randomUUID() },
      { runningHeader: { fontSize: 10 } },
      { appearance: { fontSize: 9 } },
      { layout: { levels: [] } },
    ]) {
      expect(prepareAppearance({ ...minimal, ...extra }).ok).toBe(false);
    }
    expect(prepareAppearance({ ...minimal, components: { point: { id: "p-1" } } }).ok).toBe(false);
    // The numbering schema itself would drop these; a preset refuses them.
    expect(prepareAppearance({ ...minimal, numbering: { ...decimal, extra: 1 } }).ok).toBe(false);
    expect(
      prepareAppearance({
        ...minimal,
        numbering: { version: 1, preset: "custom", levels: [{ counter: "decimal", note: "x" }] },
      }).ok,
    ).toBe(false);
  });

  it("refuses what is not plain JSON", () => {
    for (const bad of [
      null,
      "snapshot",
      [minimal],
      { ...minimal, defaults: undefined },
      { ...minimal, defaults: { lineHeight: Number.NaN } },
      { ...minimal, named: { title: { fontFamily: new Date() } } },
      {
        ...minimal,
        numbering: {
          version: 1,
          preset: "custom",
          levels: [{ counter: "decimal", prefix: "\u0000" }],
        },
      },
    ]) {
      expect(prepareAppearance(bad)).toEqual({ ok: false, code: "invalid" });
    }
  });

  it("refuses an appearance it cannot measure as small enough, before anything is stored", () => {
    const prepared = prepareAppearance({
      ...minimal,
      defaults: { fontFamily: "x".repeat(70_000) },
    });
    // Not a font: invalid long before its size matters.
    expect(prepared).toEqual({ ok: false, code: "invalid" });
  });
});

describe("the largest snapshots and the 64 KiB limit", () => {
  /*
   * A snapshot that the schema accepts is not by that alone one that may be
   * stored: storing it is also bounded by its size. These measure both
   * fixtures with PostgreSQL itself and hold each to what is true of it.
   */
  for (const kind of ["realistic", "adversarial"] as const) {
    it(`measures the ${kind} one and answers by the stored size`, async () => {
      const snapshot = largestSnapshot(kind);
      expect(appearanceSnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(Object.keys(snapshot.levels ?? {})).toHaveLength(32);

      const compact = compactBytes(snapshot as never);
      const stored = await storedBytes(snapshot);
      // The application's measure never exceeds the table's, so it never refuses what fits.
      expect(compact).toBeLessThanOrEqual(stored);

      const prepared = prepareAppearance(snapshot);
      console.info(`${kind} largest snapshot: ${compact} bytes compact, ${stored} stored`);
      if (stored <= presetLimits.bytes) {
        expect(prepared.ok).toBe(true);
      } else if (compact > presetLimits.bytes) {
        expect(prepared).toMatchObject({ ok: false, code: "too_large" });
      } else {
        // Between the two measures: the table's CHECK decides (presets.test.ts).
        expect(prepared.ok).toBe(true);
      }
    });
  }

  it("leaves the realistic largest one well inside the limit", async () => {
    const stored = await storedBytes(largestSnapshot("realistic"));
    expect(stored).toBeLessThan(presetLimits.bytes);
  });
});

describe("reading a stored appearance", () => {
  it("returns a valid one and refuses anything else, unrepaired", () => {
    const prepared = prepareAppearance(minimal);
    if (!prepared.ok) throw new Error("refused");
    expect(readStoredAppearance(prepared.snapshot)).toEqual(prepared.snapshot);
    expect(readStoredAppearance({ ...prepared.snapshot, version: 2 })).toBeNull();
    expect(readStoredAppearance({ ...prepared.snapshot, extra: true })).toBeNull();
    expect(readStoredAppearance({ version: 1 })).toBeNull();
  });
});

describe("operation fingerprints", () => {
  it("are the same for the same request whatever the key order, and differ otherwise", () => {
    const a = fingerprint({ kind: "create", name: "A", appearance: minimal });
    const reordered = fingerprint({
      kind: "create",
      name: "A",
      appearance: { numbering: decimal, presetRevision: 2, preset: "balanced", version: 1 },
    });
    expect(a).toBe(reordered);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint({ kind: "create", name: "B", appearance: minimal })).not.toBe(a);
    const id = crypto.randomUUID();
    expect(fingerprint({ kind: "duplicate", sourceId: id, name: "A" })).toBe(
      fingerprint({ kind: "duplicate", sourceId: id.toUpperCase(), name: "A" }),
    );
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });

  it("detect unknown keys by structure, not by defaults filled in", () => {
    expect(hasUnknownKeys({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(hasUnknownKeys({ a: 1, b: 2 }, { a: 1 })).toBe(true);
    expect(hasUnknownKeys([{ a: 1, x: 1 }], [{ a: 1 }])).toBe(true);
  });
});

describe("the size limit", () => {
  it("refuses, before anything is stored, what is certainly over it", () => {
    const prepared = prepareAppearance(largestSnapshot("realistic"), 1_000);
    expect(prepared).toMatchObject({ ok: false, code: "too_large" });
    if (prepared.ok) return;
    expect(prepared.bytes).toBeGreaterThan(1_000);
  });
});
