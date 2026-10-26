# Handoff: A2, Persistence

A2 puts persistence around `SermonWorkspace` (A1 handoff, "Boundary for A2"). It is built in checkpoints. This file records them as they are done.

## A2.0: Production-safe document core (26 October 2026)

**Status:** built, verified, and committed by the owner as `f480456`.

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

## A2.1: Server document persistence (26 October 2026)

**Status:** approved by the owner after the final review. Migration `0020` is applied to development only; production is untouched. Not committed.

**Git:** began on `dev` at `f480456` with a clean tree. Ends on `dev` at `f480456`, with the files below changed or new and nothing staged.

A2.1 stores one complete schema v4 document per outline and reads it back, under the owner and with a revision check. It is backend only. No page, editor, autosave, conversion, offline storage, or synchronization calls it, and the legacy outline works exactly as before.

### What was found

- **Next.js 16.4.0 → 16.4.3, and `experimental.agentUpgrade: "security"`,** both arrived in the A2.0 commit. The A2.0 section above doesn't mention them, so whether they were meant is the owner's to confirm.
  - The installed `next` is 16.4.3, and it agrees with `package.json` and the lock file. So does `eslint-config-next`.
  - `agentUpgrade` is a documented option, added in 16.4.0 (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/agentUpgrade.md`). `"security"` is already its default (`next/dist/server/config-shared.js`), so the line changes nothing.
  - The option only governs upgrade reminders during `next dev` and `next build`, and the policy `next upgrade --agent` uses. It upgrades nothing by itself.
  - Under a coding agent, the first such reminder stops the command until it is retried. That is the default, with or without the line.
  - Compatible, supported, and harmless. Not reverted. Kept for now (owner). The final review found no advisory for `next` (`npm audit`), and 16.4.3 is npm's `latest`.
- **Two project rules decided where the code lives.**
  - `src/features/outlines` is "not a manuscript editor" and alone touches the three outline tables.
  - So the store lives in `src/features/sermon-editor/persistence`, and it never reads `sermon_outlines`. The insert's composite foreign key checks that the outline exists and is the owner's, in the same statement.
- **The migration document's section 10 applies** (approved for every new document table):
  - `owner_id` references `users.id` `ON DELETE RESTRICT`;
  - account deletion is tested;
  - document content is never logged.
- **`describeDatabaseError` would log a document.** Drizzle's `DrizzleQueryError` message holds every parameter of the failed query (`Failed query: … params: …`). So the document actions log only the error's name and SQLSTATE (`failure` in `actions.ts`).
  - The same is true of the existing actions for ideas' and entries' text. That is outside A2.1 and was not changed; it is noted for the owner.
- **Account deletion needed no code change.** It deletes `ideas`, which cascades to `sermon_outlines` and then to the new table, before the `users` row goes.
- **Measured sizes** of canonical v4 JSON, from outlines converted with `legacyToDocument`:

  | Outline                                       | Size                             |
  | --------------------------------------------- | -------------------------------- |
  | 30 points, 400-character notes, 1 passage     | about 36 KB                      |
  | 100 points, 600-character notes, 2 passages   | 165 KB                           |
  | 150 points, 1,000-character notes, 2 passages | 310 KB                           |
  | 500 entries at every legacy limit             | 2.4 MB (1.3 MB without passages) |

  A Server Action's body is refused over 1 MB by default (`serverActions.bodySizeLimit`).

### Decisions

- **Size limit (owner):** 512 KiB of UTF-8, as `documentLimits.bytes` (`persistence/model.ts`). It is the only place the limit lives, and the database has no CHECK for it.
  - It is a starting limit, not a product restriction. A2.3 reassesses it with real editing and autosave.
  - An oversized document is refused as `too_large`, with its size and the limit. Nothing is cut, and the caller still has all of it.
- **Actions (owner):** a service plus thin actions.
- **Revision:** one revision for the whole document, independent of `sermon_outlines.revision`.
- **A save of identical content:** still written, and still moves the revision on by one, as `updateEntry` does. That keeps the save to one statement. Not sending an unchanged document is the caller's job (A2.3).

### Files

- **New:**
  - `drizzle/0020_sermon_outline_documents.sql` and `drizzle/meta/0020_snapshot.json`, generated;
  - `src/features/sermon-editor/persistence/model.ts`, `documents.ts`, `actions.ts`;
  - `src/features/sermon-editor/persistence/documents.test.ts`, `actions.test.ts`;
  - `src/db/document-migration.test.ts`.
- **Changed:**
  - `src/db/schema.ts` (the table);
  - `drizzle/meta/_journal.json`, generated;
  - `src/features/account/deletion.ts` (a comment) and `deletion.test.ts` (a document seeded and counted);
  - `src/i18n/dictionaries/en/outlines.ts` and `es/outlines.ts` (four strings each);
  - `AGENTS.md`, `docs/DATABASE.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, and this file.

### The persistence contract

`src/features/sermon-editor/persistence/documents.ts`. Every function takes the owner, and every statement has it in its WHERE clause:

| Function                                                         | Answers                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getDocument(db, ownerId, outlineId)`                            | `found` (`{ outlineId, content, revision, createdAt, updatedAt }`); `unreadable` (`revision`, `problems`) when what is stored is no longer accepted, which is not repaired and not returned as a document; `missing` |
| `createDocument(db, ownerId, outlineId, json)`                   | `created` (the document, at revision 0); `exists` (the current `revision`, with the document left exactly as it was); `missing`; `invalid` (`problems`); `too_large` (`bytes`, `limit`)                              |
| `updateDocument(db, ownerId, outlineId, json, expectedRevision)` | `updated` (`revision`, `updatedAt`); `stale` (the current `revision`, nothing written); `missing`; `invalid`; `too_large`                                                                                            |
| `prepareDocument(json)`                                          | The canonical content, or why it is refused. Exported for tests and for A2.2.                                                                                                                                        |

A failure of the database is thrown. A missing outline and another account's give the same answer.

The actions (`actions.ts`, `"use server"`) are `createOutlineDocument(outlineId, content)` and `saveOutlineDocument(outlineId, content, expectedRevision)`.

- Each answers `{ ok, message, code?, revision?, problems?, bytes?, limit? }`.
- The codes are `invalid`, `too_large`, `missing`, `exists`, `stale`, and `failed`.
- Messages come from the `outlines` dictionary, in the account's language.
- Nothing is revalidated, because no page shows a document yet.

### Revisions and conflicts

- **Create:**
  - one statement, `INSERT … ON CONFLICT (outline_id) DO NOTHING RETURNING`, at revision 0;
  - a second create, or two at once, writes nothing and answers `exists`, so a create can never replace a document;
  - a key violation (the outline is missing or another account's) answers `missing`.
- **Update:**
  - one statement, `UPDATE … SET content, revision = revision + 1 WHERE outline_id = … AND owner_id = … AND revision = expected RETURNING`;
  - when no row matches, a read of the revision says `stale` (with it) or `missing`;
  - no read decides what is written, and newer content is never overwritten.
- **Untouched:** neither writes `sermon_outlines` (not its revision, not its `updated_at`), an entry, the sermon, or `markDeveloped`. What document work counts as development is still open (migration document, open decision 9).

### Authorization

- Both actions begin with `authorize("active")`.
- The owner is always `actor.user.id`; nothing in the input can name another account.
- IDs are parsed with `outlineIdSchema`, and the revision must be a whole number from 0 to 2³¹−1.
- The database repeats the rule: the key to the outline carries the owner, and the owner references `users`.
- A page that reads a document will call `getDocument` behind `requireActiveUser()` (A3).

### Validation

- **Size first, on the raw JSON:** input that is too large is refused before it is parsed. Input that isn't JSON (a cycle, a BigInt) is `invalid`.
- **Then the core:** `restoreSermonDocument(json)`. A refusal is `invalid`, with the core's problems, and is never repaired.
  - A newer version is `unsupported_version`.
  - An older v1–v3 document is migrated by the core, so what is stored is always v4.
- **Size again, on the canonical form:** `doc.toJSON()`, which is what is stored, is measured again.
- **Read back:** what is read is checked again.

### Migration `0020` (applied to development only)

```sql
CREATE TABLE "sermon_outline_documents" (
	"outline_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sermon_outline_documents_content_check" CHECK (jsonb_typeof("sermon_outline_documents"."content") = 'object'),
	CONSTRAINT "sermon_outline_documents_revision_check" CHECK ("sermon_outline_documents"."revision" >= 0)
);
ALTER TABLE "sermon_outline_documents" ADD CONSTRAINT "sermon_outline_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "sermon_outline_documents" ADD CONSTRAINT "sermon_outline_documents_outline_fk" FOREIGN KEY ("outline_id","owner_id") REFERENCES "public"."sermon_outlines"("id","owner_id") ON DELETE cascade ON UPDATE no action;
```

- **Purely additive:** no existing table, column, constraint, or row changes. It uses the existing `sermon_outlines_id_owner_key`.
- **Safe under the code already live,** which never names the table.
- **Rollback:** a Vercel rollback leaves the table in place, which is harmless. Removing it takes a forward migration that drops it. Nothing writes documents in A2.1, so nothing would be lost.
- **To apply it,** the owner approves, and then a production build runs it, with section 9.3's gates (a Neon branch or backup first).
- See `docs/DATABASE.md`, "A2.1 migration".

### Tests

Run:

- `npx vitest run src/features/sermon-editor src/db/document-migration.test.ts src/db/outline-migration.test.ts src/features/account/deletion.test.ts src/features/outlines src/features/sync/apply-outlines.test.ts src/i18n`: **420 passed in 22 files.**
  - Vitest also reported **one unhandled error**: `TypeError: target.getClientRects is not a function`. It comes from ProseMirror's `scrollToSelection` under jsdom, after "keeps focus inside while open and gives it back to the outline when it closes" in `appearance/appearance-dialogs.test.tsx`.
  - It happens on every run of that file by itself (21 passed, 1 error, twice).
  - It is jsdom having no layout. That file loads none of A2.1's code, only the dictionaries, which only gained keys. So by inspection it is not caused by A2.1.
  - **Pre-existing, confirmed:** the unchanged tree of `f480456` (exported with `git archive`) gives the same result for that file: 21 passed, the same error. It is not A2.1's and is left for a UI checkpoint.
- **`persistence/documents.test.ts`** (28 tests):
  - create and read back, canonical, at revision 0, with v3 input stored as v4;
  - stored content that is no longer accepted is `unreadable` and untouched;
  - refusals, with nothing stored and a save keeping what was there: not a document, not an object, version 5, a duplicate ID, a missing ID, a cycle, a BigInt;
  - another account's outline and a made-up one are `missing`, and another account's document can be neither read nor saved;
  - a second create is `exists`, unchanged; one of two creates sent together is made;
  - the revision moves by one;
  - a stale save, behind or ahead, writes nothing;
  - one of two saves at the same revision wins;
  - an identical save still moves the revision;
  - size: exactly the limit is accepted, one byte more is refused with its size, multi-byte characters are counted in bytes, and a save that is too large keeps the document;
  - a failing database throws, and validation comes before the database;
  - the legacy outline:
    - a document changes neither the outline (revision, entries) nor the sermon;
    - a legacy entry save leaves the document alone;
    - deleting the outline, or its sermon, removes its document and no other.
- **`persistence/actions.test.ts`** (6), with `authorize` mocked:
  - a signed-out caller is refused, with nothing written;
  - the owner comes from the session, and another account's outline is `missing`;
  - a bad ID or revision is `invalid`;
  - every code;
  - Spanish;
  - a failing database is `failed`, logged with its SQLSTATE and without the document's text, even when the error's message carries it.
- **`src/db/document-migration.test.ts`** (6): described in `docs/DATABASE.md`.
- **`src/features/account/deletion.test.ts`:** an account's document goes with it, and another account's stays.
- **Also run:** `npx tsc --noEmit` clean. ESLint and Prettier clean on the changed source files; Prettier was also applied to the changed docs.
- **Not run:**
  - the full unit suite;
  - a production build;
  - end-to-end tests;
  - any migration against the development or production database;
  - a race on two real connections. PGlite is one connection, so requests "at once" run in turn. The guarantee rests on each write being one statement whose own conditions decide it. The race can be run once against development, as in 2E.1 and 3A, after the owner approves migrating it.

### Remaining risks

- The concurrency guarantee hasn't been exercised on real parallel connections (above).
- `describeDatabaseError` puts query parameters in existing logs (above). This is outside A2.1.
- **Revisions are a 32-bit integer.** That's 2.1 billion saves, which is not a practical limit, and the CHECK refuses a negative revision.
- **Reading pulls in the dictionaries.** `getDocument` validates on every read, which is CPU on the server but no extra database work. The core loads every dictionary (A2.0's note).
- **Large legacy outlines don't fit.** An outline whose converted document is over 512 KiB cannot be stored until A2.3 changes the limit. A2.2 must report it, not cut it.
- **The actions aren't wired up.** Nothing imports them, so Next builds no endpoint for them yet. The first caller (A2.3) is where they become reachable.

### For A2.2 (conversion and cutover)

- **The rule:** once a v4 document is authoritative for an outline, legacy entry writes must no longer change that outline on their own.
- **Where the guard goes:**
  - It goes in `lockForWrite` (`src/features/outlines/entries.ts`), after the outline's row is locked `FOR UPDATE`. Every online entry write and every `outline.*` sync handler passes through it.
  - It refuses with a new outcome. Over sync, that becomes a conflict that waits for the person, never a drop.
  - Do not remove or narrow an `outline.*` handler while old clients may still queue them.
  - Taking the outline `FOR UPDATE` there already serializes it against a document insert, whose key takes `KEY SHARE` on the same row.
  - It needs one indexed read of `sermon_outline_documents` by primary key. That read belongs to the outlines module or to a function exported from `persistence`, which A2.2 decides.
- **Whether a row is enough:** whether a document row by itself means "authoritative", or a separate flag or setting does (migration document §9.3 step 4, a reversible switch per account), is A2.2's decision.
- **Conversion:**
  - It takes the sermon's row and then the outline's (`lockForWrite`'s order), and reads the entries.
  - It runs `legacyToDocument`, then `createDocument` in the same transaction. A2.2 adds a variant that takes a transaction. Today's `createDocument` catches a key violation, which aborts a transaction, so the variant must check the outline under the lock instead.
  - It records the outline and entry revisions it was made from (§8.2), so a rerun changes nothing and a changed outline is converted again.
  - It is never hidden inside `migrate deploy`.
- **Offline:**
  - Work queued on a device for an outline that has since been converted must reach the person as a conflict, with their text kept.
  - `/api/offline/outlines` must say that the outline is converted, so a device stops offering legacy edits.
  - `createDeviceOutlineApi` must not take new edits for it.
- **Oversized outlines:** report them and leave them as legacy outlines. Never cut them.
- **Nothing is deleted:** legacy rows are never deleted in the release that converts them (§8.2, §7.3).

### For A2.3 (autosave and recovery)

- Save through `saveOutlineDocument`, coalesced and never per keystroke, naming the revision last acknowledged.
- `stale` means read the document again, and then merge or ask; never overwrite. `too_large` means keep everything and say so.
- Don't send a document that hasn't changed. An identical save still moves the revision.
- Reassess `documentLimits.bytes` and `serverActions.bodySizeLimit` together. A 512 KiB document plus the action's envelope stays under 1 MB.
- Once a page shows documents, decide what to revalidate.
- An editor or saving hook that holds a save in flight must register it with `hasUnsavedWork()`.

### For A3 (the production route)

- The page reads with `getDocument` behind `requireActiveUser()`.
- `unreadable` is shown as a recoverable state, never repaired silently.
- The page mounts `SermonWorkspace` with a `documentKey` that is stable for each outline.

### Ready for owner review

**Yes.** Every requested part is built and tested as listed. To be decided:

- whether the Next.js changes were meant;
- approval to apply `0020` to development, after which the two-connection race can be run once;
- the A2.2 decisions above.

### Final review (26 October 2026)

- **Unreadable is never missing, and can't be replaced by a create.**
  - A stored document the core no longer accepts reads as `unreadable` with its revision. A create answers `exists` and writes nothing.
  - Sending a future-version document is refused (`invalid`), whether by create or by save.
  - New test: "never lets a create replace an unreadable document, or call it missing".
  - A save naming the current revision can replace it. That is a deliberate save by someone who has read that revision; A3 shows `unreadable` as a recoverable state.
- **Logs:**
  - `failure` now logs a name only if it is a plain word, and a code only if it is a five-character SQLSTATE. Anything else logs as `Error`.
  - New test: an error whose name, code, and message hold document text logs exactly `["Sermon document save failed:", "Error"]`.
  - The service logs nothing. Every error in an action is caught after `authorize`, so Next never logs one of them itself.
- **Baseline:** the `getClientRects` error was confirmed pre-existing (see Tests).
- **Advisories (`npm audit --omit=dev`):**
  - none for `next`;
  - outside A2.1, for a separate dependency checkpoint before release:
    - `zod` 4.6.5, a direct dependency, has GHSA-mrhx-c7xc-m3w5, fixed in 4.6.6;
    - `@vercel/blob` 2.8.2 brings in `undici` 6.29.0, which has advisories;
    - the rest (`undici` 7, `body-parser`, `fast-uri`, `ip-address`, `@shadcn/registry`) come through `shadcn`, a CLI listed in `dependencies`.
- **The race test.** Nothing in the code blocks it: the service takes any `Database`, and `.env.local` names a development `DATABASE_URL`. Before it can run:
  - the owner approves;
  - `npm run db:status` against development (read-only) confirms `0000`–`0019` are applied;
  - `npm run db:migrate:dev` applies `0020`;
  - a temporary test opens two pooled connections, makes a throwaway account, races two creates and two saves at one revision, removes everything it made, and is deleted (as in 3A).
- **Previews:** they share the development database. That is harmless: nothing reads the table.
- **Checks run in this review:**
  - `vitest run src/features/sermon-editor/persistence`: 36 passed, then 7 passed in `actions.test.ts` after its last assertion was added;
  - `deletion.test.ts` and `document-migration.test.ts`: 11 passed;
  - the baseline run of `appearance-dialogs.test.tsx`;
  - `tsc --noEmit`, clean;
  - ESLint and Prettier on `persistence/`.

### Development migration and two-connection race (26 October 2026)

**Done with the owner's approval, on the development database only.** Production was not touched.

1. **`npm run db:status`** reported the target as the development branch:
   - host `ep-rough-frost-b79xswkz-pooler…/neondb`, declared `development`, stamped `development`;
   - 20 migrations applied (`0000`–`0019`), and only `0020` pending;
   - Check `ok`.
2. **Before migrating,** a read-only fingerprint was taken: the row count and an md5 of every row of `users`, `ideas`, `sermon_outlines`, `outline_entries`, `outline_entry_scripture_references`, and `sync_operations`.
3. **`npm run db:migrate:dev`** applied 1 migration. Status then showed 21 applied, 0 pending, Check `ok`.
   - The catalog shows the table exactly as generated: the primary key, both foreign keys (`ON DELETE CASCADE` to `sermon_outlines (id, owner_id)`, `ON DELETE RESTRICT` to `users`), and both CHECKs.
4. **The race,** from a temporary test file (now deleted) that refused to run unless the database was declared and stamped `development`:
   - **Connections:** two single-connection pools, with different backend PIDs, and a third that only watched `pg_stat_activity`. It made a throwaway account.
   - **Overlapping creates:**
     - A created the document inside an open transaction.
     - B's create was then seen **waiting on A's lock**.
     - After A committed, B answered `exists` at revision 0. One row was left, with A's content.
   - **Saves at the same revision:**
     - A saved at revision 0 inside an open transaction.
     - B's save at revision 0 was seen **waiting on A's row lock**.
     - After A committed, B answered `stale` at revision 1, and wrote nothing. The row held A's content at revision 1: the loser never overwrote the winner.
   - **Unforced races, 10 rounds:** two creates and then two saves at revision 0, sent at once on the two connections. Every round had exactly one `created` and one `exists`, then one `updated` and one `stale`, with the winner's content stored at revision 1.
   - **3 of 3 passed.** Cleanup ran in `afterAll` and asserted that no user, idea, outline, or document of the test account was left.
5. **Afterwards:**
   - every fingerprinted table was unchanged in count and checksum;
   - `sermon_outline_documents` holds 0 rows;
   - no test account remains;
   - the temporary test file and the scratch scripts are deleted.

**Found:** the pooled URL (`DATABASE_URL`, through PgBouncer) gave both test clients the **same** backend PID, so the race used `DATABASE_URL_UNPOOLED` (the same branch and database) to get two real sessions.

- This doesn't affect the application: every document write is one statement, and a transaction holds its own server session while it runs.
- A later design must never rely on a session lasting from one statement or request to the next over the pooled URL.

### Tracked for later checkpoints (owner, 26 October 2026)

- **A3:** prevent accidental replacement of an `unreadable` document. A save naming its current revision can replace it today, so the page must show it as a recoverable state and never offer a blind save over it.
- **Before public release:** correct the Drizzle error logging. `describeDatabaseError` logs query parameters, which are people's text, in the existing idea and outline actions.
- **Before public release:** a separate, targeted security update for `zod` (4.6.5 → at least 4.6.6, GHSA-mrhx-c7xc-m3w5) and the transitive advisories through `@vercel/blob` (`undici` 6) and `shadcn`.
- **Editor testing checkpoint:** the pre-existing `getClientRects` unhandled error in `appearance-dialogs.test.tsx` under jsdom.
- **A2.2** is not begun.
