import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { z } from "zod";

import { numberingConfigSchema, type NumberingConfig } from "@/features/outlines/numbering";
import { restoreOutline, setEdit, committedAt, type Draft, type Path } from "./draft";
import {
  componentKinds,
  documentStylesSchema,
  levelKey,
  namedStyles,
  userPresetIds,
  type DocumentStyles,
  type PresetRevision,
  type UserPresetId,
} from "./model";
import { presetAt } from "./presets";

/*
 * Appearance snapshots (A4.2A): the pure-data contract a personal preset
 * (A4.2B/C, approved, not built) is made from and applied with. Nothing here
 * stores, loads, or names an account, and nothing resolves a style: the
 * cascade stays `resolve.ts`'s.
 *
 * A snapshot holds the reusable, outline-wide appearance only: the built-in
 * preset and its revision, the shared defaults, the text styles, the
 * component-type styles, the levels, and the numbering. Never sermon content,
 * never a component's identity or its own appearance, never the running
 * header (UI.2C), never view state.
 *
 *   - `snapshotAppearance` takes it from styles as given, so the styles a
 *     draft would leave (\`mergeStyles\`) give the snapshot a person sees in the
 *     preview.
 *   - `materialize` writes the built-in revision's own values into it
 *     explicitly, so an applied snapshot keeps its look when a later revision
 *     refines the preset: nothing in it depends on a built-in definition
 *     except the colors the theme draws (which follow the theme by design)
 *     and the treatments only the CSS can draw (a note's per-kind shapes).
 *   - `snapshotDraft` turns it into Appearance draft edits over the outline,
 *     so applying one is an ordinary draft: previewed, cancelable, checked for
 *     conflicts, and written in one transaction by `applyAppearanceDraft`.
 *     Every single component's own appearance is kept (owner's decision).
 */

export const appearanceSnapshotSchema = z
  .object({
    version: z.literal(1),
    preset: z.enum(userPresetIds),
    presetRevision: z.union([z.literal(1), z.literal(2)]),
    defaults: documentStylesSchema.shape.defaults,
    named: documentStylesSchema.shape.named,
    components: documentStylesSchema.shape.components,
    levels: documentStylesSchema.shape.levels,
    numbering: numberingConfigSchema,
  })
  .strict();

export type AppearanceSnapshot = {
  version: 1;
  preset: UserPresetId;
  presetRevision: PresetRevision;
  defaults?: DocumentStyles["defaults"];
  named?: DocumentStyles["named"];
  components?: DocumentStyles["components"];
  levels?: DocumentStyles["levels"];
  numbering: NumberingConfig;
};

/** The outline-wide appearance of `styles` (a draft's merged styles included) and its numbering. */
export function snapshotAppearance(
  styles: DocumentStyles | null,
  numbering: NumberingConfig,
  fallback: UserPresetId,
): AppearanceSnapshot {
  const snapshot: AppearanceSnapshot = {
    version: 1,
    preset: styles?.preset ?? fallback,
    presetRevision: styles?.presetRevision ?? 1,
    numbering,
  };
  if (styles?.defaults) snapshot.defaults = styles.defaults;
  if (styles?.named) snapshot.named = styles.named;
  if (styles?.components) snapshot.components = styles.components;
  if (styles?.levels) snapshot.levels = styles.levels;
  return structuredClone(snapshot);
}

const filled = <T extends object>(below: T | undefined, above: T | undefined): T | undefined => {
  const value = { ...(below ?? {}), ...(above ?? {}) } as T;
  return Object.keys(value).length ? value : undefined;
};

/**
 * The snapshot with its built-in revision's code values written in, under
 * whatever it sets itself: the same look, with nothing left to the built-in
 * definition that code holds.
 */
export function materialize(snapshot: AppearanceSnapshot): AppearanceSnapshot {
  const preset = presetAt(snapshot.preset, snapshot.presetRevision);
  const named = Object.fromEntries(
    namedStyles
      .map((name) => [name, filled(preset.named[name], snapshot.named?.[name])] as const)
      .filter(([, value]) => value),
  );
  const components = Object.fromEntries(
    componentKinds
      .map((kind) => [kind, filled(preset.components[kind], snapshot.components?.[kind])] as const)
      .filter(([, value]) => value),
  );
  const keys = new Set([
    ...Object.keys(preset.levels ?? {}),
    ...Object.keys(snapshot.levels ?? {}),
  ]);
  const levels = Object.fromEntries(
    [...keys]
      .map((key) => [key, filled(preset.levels?.[key], snapshot.levels?.[key])] as const)
      .filter(([, value]) => value),
  );
  const result: AppearanceSnapshot = {
    ...structuredClone(snapshot),
    defaults: filled<Record<string, unknown>>(
      preset.defaults,
      snapshot.defaults,
    ) as AppearanceSnapshot["defaults"],
  };
  if (Object.keys(named).length) result.named = named as AppearanceSnapshot["named"];
  if (Object.keys(components).length)
    result.components = components as AppearanceSnapshot["components"];
  if (Object.keys(levels).length) result.levels = levels as AppearanceSnapshot["levels"];
  return result;
}

/**
 * The Appearance draft that gives the outline exactly the snapshot's
 * outline-wide appearance: every outline-wide layer back to inherited (as
 * "Restore current preset" does, single components kept), then each of the
 * snapshot's values, its preset and revision, and its numbering. An invalid
 * snapshot gives no draft.
 */
export function snapshotDraft(
  snapshot: AppearanceSnapshot,
  styles: DocumentStyles | null,
  doc: ProseMirrorNode,
  draft: Draft,
): Draft | null {
  if (!appearanceSnapshotSchema.safeParse(snapshot).success) return null;
  let next = restoreOutline(draft, styles, doc);
  const put = (path: Path, value: unknown) => {
    next = setEdit(next, path, value, committedAt(styles, doc, path));
  };
  put({ layer: "preset" }, snapshot.preset);
  put({ layer: "presetRevision" }, snapshot.presetRevision);
  for (const [field, value] of Object.entries(snapshot.defaults ?? {})) {
    put({ layer: "defaults", field }, value);
  }
  for (const name of namedStyles) {
    for (const [field, value] of Object.entries(snapshot.named?.[name] ?? {})) {
      put({ layer: "named", name, field }, value);
    }
  }
  for (const kind of componentKinds) {
    for (const [field, value] of Object.entries(snapshot.components?.[kind] ?? {})) {
      put({ layer: "component", kind, field }, value);
    }
  }
  for (const [key, layer] of Object.entries(snapshot.levels ?? {})) {
    const depth = Number(key);
    if (levelKey(depth) !== key) return null;
    for (const [field, value] of Object.entries(layer ?? {})) {
      put({ layer: "level", depth, field }, value);
    }
  }
  put({ layer: "numbering" }, snapshot.numbering);
  return next;
}
