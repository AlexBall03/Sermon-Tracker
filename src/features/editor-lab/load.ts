import type { Editor, JSONContent } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";

import { legacyToDocument, type ConversionIssue } from "./legacy";
import { legacyFixtures, powerOfGodsWord, type LegacyFixtureId } from "./fixtures";
import { restoreDocument, type Restored } from "./validate";

/** The documents the lab can open: the mixed sermon, and each legacy fixture converted. */
export const labFixtureIds = [
  "powerOfGodsWord",
  ...(Object.keys(legacyFixtures) as LegacyFixtureId[]),
] as const;
export type LabFixtureId = (typeof labFixtureIds)[number];

export type LabFixture = { doc: JSONContent; issues: ConversionIssue[] | null };

/** A fixture as a document, with what converting it reported (null for the native one). */
export function labFixture(id: LabFixtureId): LabFixture {
  if (id === "powerOfGodsWord") return { doc: powerOfGodsWord, issues: null };
  const result = legacyToDocument(legacyFixtures[id]);
  if (!result.ok) throw new Error(`Fixture ${id} cannot be converted`);
  // An empty outline still needs a place for the cursor.
  const doc = result.doc.content?.length
    ? result.doc
    : { ...result.doc, content: [{ type: "paragraph" }] };
  return { doc, issues: result.issues };
}

/**
 * Loads JSON into an editor as a fresh document: validated first, then a new
 * state with the same plugins, so its history starts empty and its numbering
 * and identity are worked out from it. Nothing is sent anywhere.
 */
export function loadDocument(editor: Editor, json: unknown): Restored {
  const restored = restoreDocument(json, editor.schema);
  if (!restored.ok) return restored;
  editor.view.updateState(EditorState.create({ doc: restored.doc, plugins: editor.state.plugins }));
  // Let the toolbar and anything else following the editor see the new state.
  editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  return restored;
}

/** The UTF-8 size of a document's JSON. */
export const jsonBytes = (json: JSONContent) =>
  new TextEncoder().encode(JSON.stringify(json)).length;
