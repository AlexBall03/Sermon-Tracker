# Handoff: A2, Persistence

A2 puts persistence around `SermonWorkspace` (A1 handoff, "Boundary for A2"). It is built in checkpoints. This file records them as they are done.

## A2.0: Production-safe document core (26 October 2026)

**Status:** built and verified; awaiting owner review. Not committed.

**Starting point:** branch `dev`, HEAD `cac4c69`, clean tree.

A2.0 makes schema v4 usable by a server: something can check a stored or received document without an editor, a browser, or the editor's runtime. It changes no behaviour of the editor or the lab, and it adds no persistence, route, API, table, or migration.

### What was found

- **The core already ran in plain Node.** `restoreV4` with `labV4Schema()` validated a v4 document and migrated a v3 one, with no `window` or `document`. The problem was what it loaded, not a crash.
- **A client module in the schema.** `schema/scripture.ts` imported `loadChapter` from `@/features/scripture/use-chapter`, a `"use client"` module that brings React hooks and offline IndexedDB with it. Only the passage's node view used it. The validators import `referenceFrom` from that file, so every validation path loaded it.
- **Schemas built from the whole editor.**
  - `labSchema()` was `getSchema(labExtensions())`, and `labV4Schema()` was `getSchema(labV4Extensions())`.
  - So checking a document loaded StarterKit, the clipboard, keymaps, numbering decorations, Print Layout, the v4 guards, the gap caret, and click placement.
  - `restoreV4` also rebuilt the whole v3 editor schema on every call for an older document.
- **What defines the schema.** Only these extensions add nodes, marks, or attributes:
  - StarterKit, the formatting marks, and alignment;
  - the document and component nodes;
  - `DepthAttribute` and `StyleAttributes`;
  - `PageBreak` and the two Scripture nodes.
  - The rest are behaviour.
- **Already sound, and unchanged:**
  - validation (`validate.ts`, `v4/validate.ts`);
  - migration (`migrate.ts`, `v4/migrate.ts`);
  - ownership (`v4/ownership.ts`);
  - identity checks: the validator refuses a missing or duplicate `id`;
  - legacy conversion (`legacy.ts`).

### What was built

1. **The passage's node view has its own file.**
   - `schema/scripture.ts` is now schema only: the attributes, HTML, text, and `referenceFrom`/`numbersOf`.
   - `schema/scripture-view.ts` holds `ScripturePassageNodeView`, which is `ScripturePassageNode.extend({ addNodeView })`, the view's code moved unchanged.
   - The name and spec are the same, so a document is the same either way. Both editors use the view variant.
2. **One schema, with editors built on top of it.**
   - `schema/document-schema.ts`: `documentStarterKit()` (the StarterKit configuration, now written once), `v3SchemaExtensions()`, and `v3Schema()` (built once).
   - `v4/schema.ts`: `v4SchemaExtensions()` and `v4Schema()` (built once).
   - `labExtensions` and `labV4Extensions` spread these lists, with the passage's view swapped in, and add their behaviour after them.
   - `labSchema()` and `labV4Schema()` remain and produce the same schemas as before.
3. **Validation uses `v3Schema()`.** `v4/validate.ts` checks an older document against the cached v3 schema, not the lab editor's. `restoreV4`'s signature and results are unchanged.
4. **The production entry point: `src/features/sermon-editor/document/index.ts`.** Server, persistence, and any code outside the editor use it. It holds no logic of its own; it only names what may be used:
   - `sermonDocumentSchema()` and `restoreSermonDocument(json)`, with the types `RestoredV4`, `DocumentProblem`, and `ProblemCode`;
   - `v4SchemaExtensions`, `v4SchemaVersion`, `maxDepth`, `pointRoles`, `depthTypes`;
   - ownership: `analyze`, `analyzeShapes`, `ownerKeys`, `reparented`;
   - identity: `identifiedTypes`, `duplicateIds`;
   - older documents and legacy outlines: `v3ToV4`, `toV3`, `legacyToDocument`;
   - contracts: `documentStylesSchema`, `referenceFrom`.
5. **Comments.** `v4/model.ts` and `v4/validate.ts` no longer call v4 a lab-only prototype.

The canonical files stay in `src/features/editor-lab`; nothing was moved (the owner's decision, Option 1). `SermonWorkspace` still loads documents through `loadV4`, which uses the editor's own schema, the same one.

### Files changed

- **New:**
  - `src/features/editor-lab/schema/document-schema.ts`
  - `src/features/editor-lab/schema/scripture-view.ts`
  - `src/features/sermon-editor/document/index.ts`
  - `src/features/sermon-editor/document/core.node.test.ts`
  - `src/features/sermon-editor/document/core.test.ts`
  - `docs/HANDOFF-PS-A2.md`
- **Changed:**
  - `src/features/editor-lab/schema/scripture.ts` (node view removed)
  - `src/features/editor-lab/schema/extensions.ts` (built on `v3SchemaExtensions`)
  - `src/features/editor-lab/v4/schema.ts` (`v4SchemaExtensions`, `v4Schema`)
  - `src/features/editor-lab/v4/extensions.ts` (built on `v4SchemaExtensions`)
  - `src/features/editor-lab/v4/validate.ts` (`v3Schema`, comment)
  - `src/features/editor-lab/v4/model.ts` (comment)
  - `AGENTS.md`, `docs/HANDOFF-PS-A1.md`, `docs/PREACHER-STUDIO-MIGRATION.md`

### Tests

- **`core.node.test.ts`** runs under Node (`@vitest-environment node`). It:
  - imports the core with no DOM;
  - walks every runtime import from the entry point and fails if any file is `"use client"`, mentions browser storage, or imports React, `@tiptap/react`, Next, `server-only`, `use-chapter`, offline storage, the database, a `.tsx` file, a component, the passage view, or any editor plugin module;
  - restores every v4 lab document unchanged and migrates every v3 lab document;
  - converts every legacy outline fixture and restores it as v4, each `legacyEntryId` present once and belonging to the outline;
  - works out ownership from depth;
  - refuses duplicate and missing IDs, bad depths, misplaced roles, newer versions, and non-documents.
- **The guard was checked by mutation.** Putting the old `use-chapter` import back in `scripture.ts` made two of its tests fail; the file was then restored.
- **`core.test.ts` checks there is one schema.**
  - The editor-free schema matches the editor's: v4 against `labV4Schema()` and v3 against `labSchema()`, comparing node and mark order, content, groups, flags, and attributes with defaults.
  - Each schema is built once.
  - Every v4, v3, and converted legacy document restores to the same JSON, and the same `migratedFrom`, through both schemas.
- **Results:**
  - `vitest run src/features/editor-lab src/features/sermon-editor src/i18n "src/app/(app)/lab"`: **710 passed** (25 files).
  - `tsc --noEmit` clean; ESLint and Prettier clean on the changed files.
- **Plain Node** (`npx tsx`, importing the entry point): a v3 document restored and migrated. Nothing from `use-chapter`, offline storage, the passage view, the editor plugins, or React was loaded.
- **Not run:**
  - the full unit suite;
  - a production build;
  - browser end-to-end tests (`tests/lab/*.spec.ts`).
  - The passage node view's code is unchanged and is still exercised by `typography.test.ts` (jsdom). Loading verses in a real browser, as `tests/lab/pagination.spec.ts` does, was not run.

### Remaining risks and dependencies

- **Production code still imports `editor-lab` paths.** The entry point is the boundary for server code; the editor (`SermonWorkspace`, its appearance windows) still imports lab modules directly. The physical move is a later relocation.
- **`assignIds` (`identity.ts`) is not exported.** On JSON it marks a copied v3 point or section with `derivedFrom`, but not a v4 `point`. The editor's `NodeIdentity` plugin handles v4 correctly. If A2.1 must create or repair v4 documents on a server, that helper needs a v4 rule first (a behaviour change, for the owner).
- **The import walker reads `import`/`export … from` statements with a regular expression.** It does not follow dynamic `import()` or `require`; the core uses neither.
- **`@/i18n` loads every dictionary** (through `scripture/reference`). That is harmless on a server, but it is weight.
- **Still open, not A2.0's:** canonical title storage (UI.2C, with A2/A3), the editor's own dictionary, and how legacy `outline_entries` become documents in production.

### Boundary for A2.1

A2.1 stores one sermon's v4 document and reads it back.

- **Server side:** every document written is first accepted by `restoreSermonDocument`, and the result's `doc.toJSON()` is what is stored. A refused document is never stored or repaired.
- **Conflicts:** a document revision checked in the write's transaction. A stale write writes nothing, as the outline actions do.
- **Saving:** from `onReady`'s `editor.getJSON()`, coalesced and never per keystroke. The `documentKey` is stable per sermon.
- **The owner decides, before it is built:**
  - the table and its migration;
  - whether A2.1 mounts `SermonWorkspace` on a real route (behind `authorize`/`requireActiveUser`) or only provides the storage;
  - how existing outlines are converted (`legacyToDocument`, then `restoreSermonDocument`), and when.
- **Out of A2.1** unless assigned: moving the core's files, the editor's dictionary, offline storage of documents, account presets.
