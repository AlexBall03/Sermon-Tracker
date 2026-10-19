import type { Editor, JSONContent } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";

import { documentFixtures, type DocumentFixtureId } from "./documents";
import { legacyToDocument, type ConversionIssue } from "./legacy";
import { legacyFixtures, powerOfGodsWord, type LegacyFixtureId } from "./fixtures";
import { restoreDocument, type Restored } from "./validate";

/**
 * The documents the lab can open: the schema v2 documents, PS-1A's mixed
 * sermon (a v1 document, migrated as it loads), and each legacy fixture
 * converted.
 */
export const labFixtureIds = [
  ...(Object.keys(documentFixtures) as DocumentFixtureId[]),
  "powerOfGodsWord",
  ...(Object.keys(legacyFixtures) as LegacyFixtureId[]),
] as const;
export type LabFixtureId = (typeof labFixtureIds)[number];

export type LabFixture = { doc: JSONContent; issues: ConversionIssue[] | null };

/** A fixture as document JSON, with what converting it reported (null when it was not converted). */
export function labFixture(id: LabFixtureId): LabFixture {
  if (id === "powerOfGodsWord") return { doc: powerOfGodsWord, issues: null };
  if (id in documentFixtures)
    return { doc: documentFixtures[id as DocumentFixtureId], issues: null };
  const result = legacyToDocument(legacyFixtures[id as LegacyFixtureId]);
  if (!result.ok) throw new Error(`Fixture ${id} cannot be converted`);
  return { doc: result.doc, issues: result.issues };
}

/**
 * Loads JSON into an editor as a fresh document: validated (and migrated)
 * first, then a new state with the same plugins, so its history starts empty
 * and its numbering and identity are worked out from it. A document that is
 * refused leaves the editor exactly as it was. `documentKey` names the
 * document for copy and paste (`clipboard.ts`); it is never stored in it.
 * Nothing is sent anywhere.
 */
export function loadDocument(editor: Editor, json: unknown, documentKey?: string): Restored {
  const restored = restoreDocument(json, editor.schema);
  if (!restored.ok) return restored;
  editor.view.updateState(EditorState.create({ doc: restored.doc, plugins: editor.state.plugins }));
  if (documentKey !== undefined) editor.storage.documentClipboard.documentKey = documentKey;
  // Let the toolbar and anything else following the editor see the new state.
  editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  return restored;
}

/** The UTF-8 size of a document's JSON. */
export const jsonBytes = (json: JSONContent) =>
  new TextEncoder().encode(JSON.stringify(json)).length;
