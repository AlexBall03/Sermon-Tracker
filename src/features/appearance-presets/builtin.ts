/*
 * The built-in presets an account may choose as its default (A4.2B). The
 * same three as the editor's `userPresetIds` (`editor-lab/styles/model.ts`),
 * kept here as a plain list so `src/db/schema.ts` can name them without
 * importing the editor; `model.test.ts` holds the two equal.
 */
export const builtinPresetIds = ["minimal", "balanced", "expressive"] as const;
export type BuiltinPresetId = (typeof builtinPresetIds)[number];

/** What an account that chose nothing gets, new or existing. */
export const fallbackBuiltinPreset: BuiltinPresetId = "balanced";
