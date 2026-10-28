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
- **A2.2:** built; see the next section.

## A2.2: Legacy conversion and content authority (26 October 2026)

**Status:** built and verified. Not committed, not deployed, and no migration run anywhere.

**Git:** began on `dev` at `d5eebf6` with a clean tree. Ends there, with the files below changed or new and nothing staged.

A2.2 makes one rule authoritative, refuses every legacy write that would break it, and adds the one way an outline becomes a document:

- **The rule:** an outline's sermon document row is its content authority.
- **The guard:** every legacy write that would break the rule is refused, online and offline.
- **The way in:** an atomic, idempotent, lossless-or-refused conversion.

It adds no table, column, or migration. The legacy editor is unchanged until a document exists, and in production none can exist until A3 calls the conversion.

### What was found

- **`setNumbering` (`outlines.ts`) was one bare `UPDATE`** with no lock. The `outline.numbering` sync handler calls it too. A guard in `lockForWrite` alone would have missed both.
- **The check has to be its own statement.** A write's own `WHERE NOT EXISTS (document)` is unsafe under READ COMMITTED.
  - Such an `UPDATE` waits on a conversion's `FOR UPDATE` lock, then runs on its old snapshot.
  - The conversion only locked the row, so nothing triggers a recheck, and the write proceeds.
  - So the check is a statement of its own, made after the outline is held.
- **`asOutline` reads the numbering through `readNumbering`,** which replaces a stored config that doesn't parse with the default. Converting from that would silently change an outline, so conversion reads the raw column.
- **The numbering schema fills defaults** (`case`, `bullet`, `prefix`, …). A custom config stored before a field existed is still valid. It shows with the default, so conversion keeps it as shown.
- **The database already refuses** `duplicate_section`, `section_with_parent`, `duplicate_position`, and `orphan_parent`. It cannot refuse `cycle`, `section_parent`, `invalid_numbering`, or `too_many_entries`; only the service prevents those.
- **`v3ToV4` keeps all provenance.** On every entry: `id`, `legacyEntryId`, `legacyRevision`, `derivedFrom`, `sourcePointId`, `legacyParentId`, `presentation`, and `appearance`. On the document: `legacyOutlineId` and `legacyRevision`. Asserted in `conversion.test.ts`.
- **A new code would have looped the legacy editor.** Its store answers an unknown code by reloading the outline, and resending against a converted outline would refuse and reload again. It now halts.
- **Sync idempotency needed no change.** `applyMutation` answers `duplicate` from `sync_operations` before any handler runs, and an outcome that isn't `applied` rolls back without writing an op row.
- **The client needed one change.** The engine keeps a conflict and never retries it by itself, and an unknown reason already falls back to "discard". Only the discard needed changing, so it drops one change.
- **Sermon title.** No document holds a title.
  - `ideas.title` is the Sermon Title and its only authority. Conversion copies nothing from it.
  - The optional Subtitle is the document's `doc.attrs.subtitle` (v3 and v4).
  - There is no separate Outline Title. UI.2C builds the header on this contract.

### The authority rule

| State                           | What the outline says          |
| ------------------------------- | ------------------------------ |
| No document row                 | Its legacy entries             |
| A readable document row         | The document                   |
| An unreadable document row      | The stored document, protected |
| A conversion that inserted none | Its legacy entries, untouched  |

Nothing else decides it: no flag, setting, or column.

### Locks and transactions

- **Every legacy write:** `lockForWrite` = `lockOutlineRows` (sermon `FOR NO KEY UPDATE`, then outline `FOR UPDATE`, unchanged), then `hasDocument` (new, `persistence/authority.ts`) as a separate statement.
  - Covers `createEntry`, `updateEntry`, `setEntryReferences`, `moveEntry`, and `deleteEntry`.
  - The refusal comes before the retry and stale checks, so nothing is written.
- **`setNumbering`:** now a transaction that holds the outline `FOR UPDATE`, then asks `hasDocument`, then updates. It takes no `ideas` row, so it never waits on a sermon while holding an outline.
- **`convertOutline`:** one transaction.
  1. `lockOutlineRows`.
  2. Read the document row. If there is one, readable or not, return it as is.
  3. Read the outline as stored (`readStoredOutline`, raw numbering).
  4. `legacyToDocument`.
  5. `prepareDocument`: the core's restore and v3→v4 migration, then the size limit.
  6. The fidelity proof.
  7. `insertPreparedDocument`, at revision 0.
- **What that ordering guarantees:**
  - A legacy write that held the outline first commits before conversion reads anything.
  - One that comes after waits, then is refused.
  - A second conversion waits, then answers `exists`.
- **No session affinity.** Nothing relies on a session lasting beyond its own transaction, so Neon's pooler is fine.
- **Untouched:** `deleteOutline`. An explicit delete of an outline or its sermon still cascades to the document.

### Conversion outcomes (`ConvertOutlineOutcome`, `persistence/model.ts`)

| Outcome      | Meaning                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `converted`  | The first document, at revision 0. It is now the authority.                                                        |
| `exists`     | A readable document was there. Untouched.                                                                          |
| `unreadable` | A stored document the core no longer accepts. Untouched and never converted over (with its revision and problems). |
| `missing`    | No such outline among the owner's.                                                                                 |
| `unsafe`     | Converting could lose or change something (`problems`: codes, entry IDs, field names; never words).                |
| `invalid`    | The core refused the converted document.                                                                           |
| `too_large`  | Over `documentLimits.bytes`, with its size. Nothing cut.                                                           |

**The action.** `convertOutlineDocument(outlineId)` (`persistence/actions.ts`) begins with `authorize("active")` and takes the owner from the session.

- **Replaces:** A2.1's `createOutlineDocument`, removed (owner's decision), so no content sent from a browser can become an outline's authority.
- **Codes:** `exists`, `unreadable`, `missing`, `unsafe` (with `conversion`), `invalid`, `too_large`, and `failed`.
- **Messages and logs:** the messages are in both languages, and failures are logged content-safe through `failure()`.
- **Kept:** the `createDocument` service, for tests and internal use.
- **Called by:** nothing yet.

An empty outline converts to a valid document (one empty paragraph), so a new outline can become a document without any legacy editing.

### Fidelity policy

- **What is preserved, and tested:**
  - the introduction and conclusion;
  - main points and subpoints at any depth, in shown order;
  - entry IDs, entry revisions, and `sourcePointId`;
  - passages in stored order (as `print: "reference"`, no translation);
  - notes exactly, a paragraph per line, with blank lines and leading and trailing spaces;
  - built-in and custom numbering, in `layout.numbering`;
  - the outline's ID and shape revision.
- **What is refused (`unsafe`):**
  - any issue `legacyToDocument` reports, including `ok: true` with issues. None of them can be shown to keep everything, and the database rules out most of them anyway.
  - stored numbering that doesn't parse, or that parsing would drop or change (an unknown key, for example).
- **The proof at runtime.** The canonical stored form is taken back through `toV3`, then `documentToLegacy`. It must report no loss, give the same outline ID, revision, and numbering, and give every entry exactly once and equal to the original as `shownOutline` shows it. Otherwise the answer is `unsafe` with `not_lossless`.
- **Never:** a partial conversion, a repaired document, or a deleted, truncated, or rewritten legacy row.

### Size

- **The limit stays as it is:** 512 KiB, `documentLimits.bytes`.
- **Measured (A2.1):** a typical outline converts to about 36 KB, and 150 points with 1,000-character notes to about 310 KB, so both fit. An outline at every legacy limit (500 entries) is about 2.4 MB.
- **Anything over is `too_large`** and stays a working legacy outline, whole. Tested with 300 entries of 2,000-character notes.
- **Not measured:** the real distribution in production. Reading production was not authorized.
- **Options for A2.3:**
  - raise the stored limit, since conversion runs on the server and has no request-body limit;
  - but saves go through a Server Action, refused over 1 MB (`serverActions.bodySizeLimit`). So either raise that together with the stored limit (to 2–3 MB), save through a route handler, or save step-based patches instead of whole documents.
  - No chunked storage was built; nothing has shown it is needed.

### Offline

- **The server.** Every `outline.*` handler maps the refusal to the conflict `{ reason: "documentAuthoritative" }` (`sync/model.ts`).
  - Nothing is written, neither the document nor legacy content.
  - No `sync_operations` row is written, so no change is falsely acknowledged.
  - An operation applied before the conversion still answers `duplicate`, and the same change under a new op ID is refused.
- **The device** (`offline/outlines/sync.ts`).
  - The conflict is kept, never retried by itself. The only choice offered is "discard".
  - Discarding drops **that change only**. Changes queued behind it stay, each refused in turn and kept. The device's local copy keeps what they say until the last is discarded.
  - A download never touches `local` while any change is queued (tested).
  - The Pending Changes note is `offline.conflicts.documentAuthoritative`, in both languages.
- **The online legacy editor.** `document_authoritative` stops the queue: no reload, no automatic retry. The message is shown and the unsaved text stays on the page, held as unsaved work.
- **Old clients.** A device on an older build gets an unknown conflict reason, and it is kept: no message text, with "discard" only. An older online editor would reload and resend in a loop. That's why A3 must route converted outlines away from the legacy editor (rollout below).

### Files

- **New:**
  - `src/features/sermon-editor/persistence/authority.ts`
  - `src/features/sermon-editor/persistence/conversion.ts`
  - `src/features/sermon-editor/persistence/conversion.test.ts`
- **Changed (source):**
  - `src/features/outlines/entries.ts`: `lockOutlineRows`, the guard, and the outcomes;
  - `src/features/outlines/outlines.ts`: `setNumbering`, `readStoredOutline`;
  - `src/features/outlines/actions.ts` and `editor/store.ts`;
  - `src/features/sync/model.ts` and `apply-outlines.ts`;
  - `src/features/offline/outlines/sync.ts`;
  - `src/features/sermon-editor/persistence/actions.ts`, `documents.ts`, `model.ts`;
  - `src/features/sermon-editor/document/index.ts`: exports `documentToLegacy` and `shownOutline`;
  - the `outlines` and `offline` dictionaries, in English and Spanish.
- **Changed (tests):** `outlines/actions.test.ts`, `outlines/outlines.test.ts`, `editor/store.test.ts`, `sync/apply-outlines.test.ts`, `offline/outlines/outlines.test.ts`, `persistence/actions.test.ts`, `persistence/documents.test.ts`.
- **Changed (docs):** `AGENTS.md`, `docs/DATABASE.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, and this file.

### Verification

- **PGlite (one connection).**
  - `conversion.test.ts`, 15 tests:
    - normal, empty, nested, saved-point, passage, numbering, and whitespace fidelity, and provenance;
    - converting once, including two at once;
    - `unreadable` protected, and a legacy write before conversion included;
    - a foreign or missing outline;
    - `cycle` and `section_parent` refused;
    - three kinds of bad raw numbering refused, and a pre-default custom config kept;
    - `too_large`;
    - rollback, forced by a test trigger: no row, and the legacy outline goes on;
    - all seven legacy write paths refused, with nothing written;
    - delete still cascading;
    - other outlines unaffected.
  - Also:
    - `apply-outlines.test.ts`: each `outline.*` type gives the conflict with no op row, and duplicate replay still works;
    - `outlines.test.ts` (offline): choices, the one-change discard, and a download keeping `local`;
    - `store.test.ts`: halts, keeps the text, no reload or retry;
    - `actions.test.ts` (outlines): every action's code, in both languages, and no revalidation;
    - `persistence/actions.test.ts`: the convert action;
    - updated for the new contracts: the A2.1 test in `documents.test.ts` that expected legacy writes to continue after a document, and the two `setNumbering` tests in `outlines/outlines.test.ts`.
- **Two real connections (development, with the owner's approval).**
  - **Setup:**
    - `npm run db:status` (read-only) reported the database declared and stamped `development`, with 21 migrations applied and 0 pending.
    - A temporary test refused to run unless `.env.local` declared development and the stamp said so.
    - It used `DATABASE_URL_UNPOOLED` with one-connection pools, verified to have different backend PIDs, plus a third watcher.
    - It used a throwaway account.
  - **Forced, each observed waiting in `pg_stat_activity` (`wait_event_type = 'Lock'`):**
    - two conversions: one `converted` and one `exists`, one row;
    - a legacy word change held open, then a conversion: the conversion waited, and the document contains the change;
    - a conversion held open, then a word change, and separately a numbering change: each waited, then answered `document_authoritative`, and the outline row and entries were unchanged.
  - **Unforced:** 10 rounds of two conversions and a word change sent together. Every round was consistent: one `converted`, one `exists`, and the document agreeing with whether the write landed.
    - In all 10 rounds the conversion won the lock, so the "write first" order was covered by the forced test, not by chance.
  - **Run twice, both passing.** Cleanup asserted no user, idea, outline, entry, or document of the account remained. A count and md5 fingerprint of `users`, `ideas`, `sermon_outlines`, `outline_entries`, `outline_entry_scripture_references`, `sermon_outline_documents`, and `sync_operations` matched before and after.
  - The temporary file is deleted.
- **Also run:**
  - `tsc --noEmit`, clean;
  - ESLint and Prettier on the changed source;
  - `vitest run src/features/sermon-editor src/features/outlines src/features/sync src/features/offline src/i18n src/db/document-migration.test.ts src/features/account/deletion.test.ts`: 546 of 547 passed in 33 files. `core.node.test.ts` still holds the core boundary with the two new exports.
- **The one failure is timing, not A2.2.** "says a save failed, keeps the text, and saves it when asked again" (`outline-editor.test.tsx`) uses fake timers that also advance with real time. In a 155-second loaded run more than 2 s passed before its click, so the store's own 2 s retry fired first (3 calls, not 2).
  - It passes alone, and 3 of 3 times with the whole outlines suite (276 tests).
  - The store change can't cause it: a network failure never reaches the new branch.
- **The unhandled error:** the same pre-existing `getClientRects` error from `appearance-dialogs.test.tsx` (A2.1).
- **Not run:** the full unit suite, a production build, end-to-end tests, and any migration. No UI changed visibly beyond two new message strings, so no screenshots.

### Deployment and rollout (verified against the build, 26 October 2026; not executed)

**How a production deployment migrates.** `npm run build` is `next build && node scripts/db/cli.mjs migrate deploy`.

- **Where it runs.** Only where `VERCEL_ENV=production`. Everywhere else it prints that it skipped; previews use the development database, which already has `0020`.
- **What it does.** It checks the target's declaration and stamp, then applies every pending migration through Drizzle's migrator.
- **One transaction.** The migrator runs all pending migrations in one transaction (`drizzle-orm/pg-core/dialect.js`, over the Neon WebSocket pool, which supports interactive transactions). A failing statement in `0020` leaves no table and no record of it.
- **A failure stops the deployment.** A refusal or failure exits 1 (`process.exit(1)`). Through `&&` that fails the build, so Vercel never makes the deployment live, and the previous one keeps serving.

**What that means for A2.2:**

- **The table comes before the code that needs it.** `0020` and the A2.2 code reach production in the same deployment, and the table is created during its build, before it serves anything.
- **Nothing reads the table at build or render time.** `hasDocument` is called only inside legacy writes (outline actions and the `outline.*` sync handlers). No page, layout, route, static generation, or `generateStaticParams` reads it.
- **The window during the build is safe.** The previous deployment serves against a database that already has the table, and its code never names it.
- **It fails closed.** If the A2.2 code were ever served without the table (for example, a hand-made prebuilt deploy that skipped the migration), a legacy write would fail and write nothing. No data would be corrupted.
- **No separate manual migration is needed.** Nothing in the automated workflow was changed.

**Old deployments.** These can still write after A2.2 is live:

- in-flight requests on the old deployment while Vercel switches over: seconds;
- an Instant Rollback, or promoting an older deployment;
- if Skew Protection is on, an open tab's Server Action and RSC requests, which go to the deployment that served it until the configured maximum age;
- an old deployment's generated URL, if it can authenticate.

Not one of these matters before the first conversion, and A2.2 has no caller for one. Each matters once A3 converts. This checkout isn't linked to the Vercel project (`.vercel/project.json`), so the Skew Protection and Deployment Protection settings were not read here.

**Rollout:**

1. **Merge to `master`.** Its production build applies `0020`, then the deployment goes live with the guard. That's one step, not two, and no conversion can happen.
2. **Check** the build log ("applied 1 migration(s) to production"), then run `npm run db:status -- prod`, which is read-only.
3. **Before A3 enables conversion**, the owner confirms in Vercel:
   - no rolling release is in progress, and no older deployment is promoted;
   - Skew Protection is off, or its maximum age has passed since the last pre-A2.2 deployment, so no tab still reaches unguarded code;
   - Deployment Protection covers generated deployment URLs, or Clerk's production session cannot be used on them.
   - Optional: a DB trigger refusing legacy writes for converted outlines makes the above independent of Vercel. It is a migration, offered and not built.
4. **A3 enables conversion,** after A2.3's device-side flag is in production, so devices stop offering legacy edits.

**Rollback:**

- **Before the first production conversion:** any rollback is safe. The table stays, and older code never names it.
- **After it:** roll back, or promote, only a deployment that has the A2.2 guard (`b141037` or later). An older one would accept legacy writes to converted outlines, and their entries would drift from their documents. Instant Rollback doesn't run the build, so it would not reapply anything (`docs/DATABASE.md`).
- **If an older build must be restored anyway:**
  1. Stop new conversions first, by deploying a build in which A3's conversion call is off.
  2. Accept that legacy edits made meanwhile to converted outlines are recovery work (A2.3).
  3. Never drop `sermon_outline_documents` to "undo" A2.2. That would delete the authoritative copy, and the conversion is the only place its later edits exist.

### For A2.3

- **Recovery for `documentAuthoritative` conflicts:** carry the queued words, passages, and points into the document, or show them for the person to copy. Then discard.
- **`/api/offline/outlines`** says an outline is converted. `createDeviceOutlineApi` and the offline editor stop offering legacy edits for it.
- **The size limit:** decide it together with the save transport (above). Decided in A2.3A: 3 MiB, with a 4 MB Server Action body limit.
- **Autosave** on `saveOutlineDocument` (A2.1's notes still apply).

### For A3

- **Opening a converted outline** shows `SermonWorkspace`, never the legacy editor. That also ends any old client's reload loop.
- **Converting** calls `convertOutlineDocument` when a legacy outline is opened in the new editor. `unsafe` and `too_large` are shown as "stays a legacy outline", with that editor kept.
- **`unreadable`** is a recoverable state, never a blind save.
- **The header** is `ideas.title` plus `doc.attrs.subtitle` (UI.2C).

### Ready for owner review

**Yes.** Every safety property in the brief is built and tested, and the concurrency claims are proved on two real connections. Nothing is committed, deployed, or migrated.

## A2.3A: Persistence and local durability contracts (26 October 2026)

**Status:** built and verified with focused tests. Not committed, not deployed, and no migration run anywhere.

**Git:** began on `dev` at `a5009f7` with a clean tree. Ends there, with the files below changed or new and nothing staged.

### Approved by the owner (binding)

Full-document schema v4 saves; durable local recovery in IndexedDB; no more than one server save in flight per controller; no automatic merging of conflicting sermons; a 3 MiB target for the canonical document; manual recovery of legacy offline conflicts; production editor integration in A3.

### What was found

- **`accountData` already fits.** Key `[owner, kind, id]`, indexes `owner` and `ownerKind`.
  - Every bulk removal there (`removeKeptIdeas`, `removeKeptOutlines`, the downloads' `keep`) is limited to its own kinds.
  - Only `forgetAccount` removes every kind of an owner, and only `delete-account.tsx` calls it, after a confirmed deletion. Signing out only forgets the active account.
  - So a new kind needs no IndexedDB migration and no change to `forgetAccount`.
- **The transport.** No `serverActions` configuration existed, so Next's 1 MB default applied (`action-handler.js` counts the raw body and answers 413 above it). The proxy buffers up to 10 MB (`proxyClientMaxBodySize`). Vercel refuses a request body over 4.5 MB.
- **The editor's JSON cannot be sent as it is.** ProseMirror's `toJSON` (and so `editor.getJSON()`) gives `attrs` objects with a null prototype, and React's action encoder throws on them: "Only plain objects, and a few built-ins, can be passed to Server Functions." A save must send a plain copy (`prepareSave`). Without it, A2.3B's first save would have thrown in the browser.
- **This handoff** had the A2.2 section twice, and the first copy also repeated A2.1's final review. Consolidated after review (see "Review follow-up" below).

### Size and transport

- **`documentLimits.bytes` is 3 × 1024 × 1024** (3,145,728) UTF-8 bytes of JSON. `prepareDocument` still checks it twice (raw input, then canonical form) around `restoreSermonDocument`. Validation is unchanged.
- **`experimental.serverActions.bodySizeLimit` is `"4mb"`** (4,194,304 bytes, `next.config.ts`):
  - 1 MiB above the document limit, so a document a little over it still reaches the service and is answered `too_large`, rather than refused by the framework;
  - under Vercel's 4.5 MB cap and the proxy's 10 MB;
  - it applies to every Server Action. Each still validates its own input; no other takes large bodies.
- **Measured** on this machine (Node, vitest; indicative), on a realistic document of 4,550 points and paragraphs, 3,144,670 bytes:

  | Step | Time |
  | --- | --- |
  | `JSON.stringify` | 8 ms |
  | plain copy (`prepareSave`'s parse) | 14 ms |
  | `restoreSermonDocument` + `toJSON` | 21 ms |
  | `prepareDocument` | 25 ms |
  | `encodeReply` (the client's action encoding) | 50 ms |
  | `createDocument` / `updateDocument` on PGlite | 201 / 144 ms |
  | fake-indexeddb put / get of the same | 33 / 19 ms |

  - The encoded body was **43 bytes** larger than the document.
  - `transport.test.ts` proves the same at exactly the limit for ASCII, accented, emoji, and quote-heavy text: under 4 KiB of overhead each, and under the body limit.
- **Conversion.** Every ASCII legacy outline now fits (about 2.4 MB at every legacy limit). `too_large` on conversion is reachable only with multi-byte text, since the notes CHECK counts characters; its test now uses 400 entries of 2,000 emoji.
- **The `too_large` message** now says "3,072 KB".
- **Not measured:** a real browser's structured clone and IndexedDB write of 3 MiB, Neon's latency for a 3 MiB `jsonb` write, and a deployed function's memory. A2.3B measures in the browser.

### Recovery drafts (`persistence/recovery`)

**The record.** One `accountData` record per draft: `[users.id, "documentDraft", "<outlineId>:<draftId>"]`.
- Both IDs are lowercase UUIDs, so one outline's drafts are one key range.
- `draftId` is a UUID the controller makes for its own session, so two tabs never overwrite each other.
- The record's own `updatedAt` is the update time. Its `data`:

| Field | Meaning |
| --- | --- |
| `format` | `1`. A higher number is `unsupported`; anything else is `malformed`. |
| `content` | The newest snapshot this session kept: v4 JSON as the editor gave it. |
| `sequence` | The client's sequence of `content`, rising per session. |
| `confirmedSequence` | The highest sequence of this session the server confirmed (0: none since the draft began). Always below `sequence`. |
| `baseRevision` | The document revision the next save of `content` names. Never goes back. |
| `refusal?` | `{ code, sequence, revision?, at }`, `code` one of `stale`, `missing`, `invalid`, `too_large`: the server refused that snapshot's save. |
| `createdAt` | When the draft began. |

The outline and session are not repeated in `data`; they are the key. One snapshot is kept per draft: no history, no second copy.

**Status.**
- `pending`: content the server is not known to have.
- `conflict`: a refusal, waiting for the person.
- "Confirmed" is never stored: a draft whose snapshot the server confirmed is deleted.
- A draft another session finds is a **recovery candidate**. Its relationship to the server is **uncertain** by definition, since its last save may have landed. A2.3C settles that by comparing with `getDocument`, never by assuming.

**Operations** (`store.ts`), each one IndexedDB transaction that reads and decides under it:

| Function | Result |
| --- | --- |
| `writeDraft(owner, { outlineId, draftId, content, sequence, baseRevision })` | `written`, or `superseded` when the draft holds this sequence or a later one (nothing written). Keeps `createdAt`, `confirmedSequence`, and a refusal; `baseRevision` is the larger of the given and the stored. |
| `confirmDraft(owner, { …, sequence, revision })` | `cleared` (held exactly that snapshot: deleted); `advanced` (holds a newer one: kept, `confirmedSequence` and `baseRevision` move, and a refusal of that snapshot or an older one is lifted); or `ignored` (no draft, already counted, or a snapshot never kept). |
| `refuseDraft(owner, { …, sequence, code, revision? })` | `refused` (content untouched), or `ignored` (no draft, a snapshot not kept, or one already confirmed). |
| `discardDraft(owner, { …, sequence })` | The person's choice: `discarded` only if it still holds that snapshot, `kept` if a newer one was written since. |
| `discardUnreadableDraft(owner, id)` | The person's choice for a `malformed` or `unsupported` record. Never removes a readable draft. |
| `readDraft`, `listDrafts(owner, outlineId)`, `listAccountDrafts(owner)` | `DraftRead`s: `ok`, `unsupported`, or `malformed`. |

**Atomicity.** IndexedDB runs read-write transactions over one store one at a time, in the order they began, so a write and an acknowledgment that overlap are each decided against what the other left.
- Tested: write 10, write 11, confirm 10 keeps 11.
- Tested: a write of 11 and a confirmation of 10 started together end with 11 kept, at the new revision.

**One contract for A2.3B.** A controller issues its writes for one draft in sequence order, and updates the revision it holds before writing a later snapshot. An older snapshot written late, *after* the draft was cleared, would start a new draft from old content. That loses nothing (its save would be `stale`), but it would be a false recovery candidate.

**Account isolation.**
- Every key is built from the owner the caller passes.
- A record whose owner field, kind, or ID disagrees with how it was asked for is `malformed`, and its content is never returned.
- The module decides nothing about who is signed in. The server authorizes every save; the owner is a scope, not a lock.

**Lifecycle.**
- A draft survives a reload, a closed tab or browser, signing out, a lost session, and another account signing in.
- It is removed only by an exact confirmation, the person's discard, or account deletion (`forgetAccount`, unchanged; tested).
- Turning off "Keep my outlines on this device", or removing downloaded outlines, does not touch it.

**Errors.** Every failure is a `DraftStorageError` with a `kind`:
- `invalid`: an argument refused before storage is touched (an empty owner, an ID that is not a UUID, a sequence that is not a positive integer, a negative revision, content that is not a `doc`);
- `unavailable`: IndexedDB missing or refused;
- `quota`: out of space; the stored draft is left as it was;
- `unreadable`: a write to a record that cannot be read, which is never written over;
- `failed`: anything else.

Nothing is swallowed, nothing is cut, and nothing is size-capped on the device: words are never refused locally.

**What it does not guarantee:**
- that the server has a draft: a draft is never a save;
- protection from anyone using the same browser profile: IndexedDB is not encrypted;
- survival of the browser clearing or evicting site storage (`requestPersistence` asks; the browser may refuse);
- that `content` is still a document the schema accepts: recovery restores it through the core first.

### The save contract (`persistence/saving.ts`)

- **`DocumentSaveRequest`:** `{ outlineId, content, expectedRevision, sequence }`. `sequence` is never sent; it matches the answer to the snapshot.
- **`prepareSave(content)`:** `{ ok: true, content, bytes }` with a plain copy, or `{ ok: false, bytes, limit }` over `documentLimits`. An oversized document is never sent: much larger, the framework's 413 would look like a failure worth retrying.
- **`saveOutcome(sequence, result)`** reads `saveOutlineDocument`'s `DocumentActionResult`:
  - `confirmed`, with the new revision;
  - `conflict`, for `stale` (with the current revision) or `missing`: read again, never overwrite;
  - `refused`, for `invalid` (with problems) or `too_large` (with sizes): keep everything;
  - `unauthorized`, when `authorize` refused (no code): keep the draft;
  - `failed`: `uncertain: false` for `code: "failed"` (the transaction wrote nothing); `uncertain: true` for a success without a revision or an unexpected code.
- **`unansweredOutcome(sequence)`:** `failed` with `uncertain: true`, for a thrown action or no answer. The server may have saved it.
- No competing revision, schema, validator, or server session table. The PostgreSQL revision stays the concurrency control.

### Files

- **New:**
  - `src/features/sermon-editor/persistence/recovery/model.ts`, `store.ts`, `recovery.test.ts`;
  - `src/features/sermon-editor/persistence/saving.ts`, `saving.test.ts`;
  - `src/features/sermon-editor/persistence/transport.test.ts`, with `next-compiled.d.ts` (types for Next's untyped `bytes` and action encoder, used only by that test).
- **Changed:**
  - `next.config.ts`: `experimental.serverActions.bodySizeLimit`;
  - `src/features/sermon-editor/persistence/model.ts`: the limit and its comment;
  - `actions.test.ts` ("3,072 KB") and `conversion.test.ts` (multi-byte notes for `too_large`);
  - `AGENTS.md`, `ARCHITECTURE.md` ("Sermon documents"), `docs/DATABASE.md`, `docs/PREACHER-STUDIO-MIGRATION.md`, and this handoff.

### Verification

- `vitest run src/features/sermon-editor/persistence src/features/offline/offline.test.ts src/features/offline/outlines src/features/account/deletion.test.ts`: 9 files, 113 tests, 1 failed. `actions.test.ts` still asserted "512 KB"; that assertion was updated.
- Then `vitest run src/features/sermon-editor/persistence`: 6 files, 80 passed. That includes `recovery.test.ts` (17), `saving.test.ts`, `transport.test.ts`, `documents.test.ts` (the 3 MiB boundary: exactly the limit accepted, one byte more refused, UTF-8 counted, revision checks unchanged), and `conversion.test.ts`.
- `vitest run src/features/sermon-editor/persistence/actions.test.ts src/features/sermon-editor/document`: 3 files, 20 passed. `core.node.test.ts` still holds the core boundary.
- `recovery.test.ts` runs against fake-indexeddb with the real offline database and its migrations. A deliberate mutation (confirming any sequence at or below the stored one, and dropping the stale-write check) made 4 of its tests fail; it was reverted.
- **Final run, after every change:** `vitest run src/features/sermon-editor/persistence src/features/sermon-editor/document src/features/offline/offline.test.ts src/features/offline/outlines src/features/account/deletion.test.ts`: 11 files, 126 passed, none failed.
- `tsc --noEmit`: clean. ESLint and Prettier on `next.config.ts` and `src/features/sermon-editor/persistence`: clean.
- **Not run:** the full unit suite, a production build, end-to-end tests, a real browser, and any migration. Nothing visible changed, so there are no screenshots.

### Boundaries

- **A2.3A (this):** contracts and storage only. Nothing calls them: no timer, no Tiptap subscription, no automatic save, no recovery interface.
- **A2.3B, autosave:** a controller outside the editor.
  - It owns its `draftId` and sequence, and writes drafts throttled: each write is the whole snapshot, up to 3 MiB.
  - It keeps at most one save in flight: `prepareSave`, then `saveOutlineDocument`, then `saveOutcome`, then `confirmDraft` or `refuseDraft`.
  - It registers unsaved work with `hasUnsavedWork()`, never sends an unchanged document (an identical save still moves the revision), and stops on `conflict`, `refused`, and `unauthorized`.
- **A2.3C, recovery:**
  - On opening, `listDrafts` for the outline. Compare each candidate with `getDocument` (an equal one is discarded), restore it through the core, and offer it to the person.
  - Conflicts are resolved by the person, never merged. `discardDraft` and `discardUnreadableDraft` are the only removals.
  - It carries `documentAuthoritative` legacy conflicts into the document, or shows them to copy (manual, as approved).
- **A2.3D, offline authority:** `/api/offline/outlines` says an outline is converted, and `createDeviceOutlineApi` stops taking legacy edits for it.
- **A3:** the production route, conversion on opening, `unreadable` as a recoverable state, and revalidation.

### Risks

- **Throttling is A2.3B's.** Each draft write and each save is a whole document. On a 3 MiB sermon, a write per keystroke would be wasteful (about 30 ms of IndexedDB each in fake-indexeddb).
- **Little room above 3 MiB.** Vercel's 4.5 MB cap leaves about 1.3 MB. A larger document needs another transport, which was not built.
- **The 4 MB body limit is global** to Server Actions. Any request can now make the server read up to 4 MB before an action's `authorize` runs; the bound was 1 MB.
- **Browser storage** can be cleared or evicted by the browser or the person, and can be unavailable (private windows). Each case is an error the controller sees, never silent loss of what IndexedDB did keep.
- **Two tabs on one outline** each keep their own draft and save against the same revision. The second save is `stale` and waits for the person (no merging, as approved).

### Ready for owner review

**Yes.** To decide:
- the 4 MB body limit, which applies to every Server Action;
- the duplicated A2.2 section: consolidated after review (below);
- approval to begin A2.3B.

### Review follow-up (26 October 2026)

**Accepted.** A2.3A was committed as `578fe23` and accepted after review. The owner approved the 3 MiB document limit and the 4 MB Server Action limit. No code changed in this follow-up.

**1. A deleted draft can be recreated by a late write.** `writeDraft`'s sequence check protects a draft only while it exists. If the controller issues `writeDraft(N)` after `confirmDraft(N)` has deleted the draft, a draft is made again from content the server already has. If it issues an older snapshot's write, the new draft holds content older than the server's. Nothing is lost, but A2.3C would show a false recovery candidate, and the person could choose old words.
- **When it happens:** IndexedDB begins transactions in the order they are asked for (every operation awaits the same `openOfflineDb()` promise, then opens its transaction). So this needs the controller to ask out of order: a throttled draft write firing after its save was confirmed, or a failed write retried later.
- **The fix belongs in the controller, with no new storage.** Only the controller that made a `draftId` ever writes it, and a reload makes a new one. So what the controller holds in memory is enough:
  - **One queue.** Every draft operation (write, confirm, refuse) goes through one promise chain, in the order the controller decides on it.
  - **Write ahead.** A snapshot's save is sent only after its `writeDraft` has finished. So its `confirmDraft` is always queued after its write.
  - **A watermark.** On a confirmation, the controller raises its `confirmedSequence` before queueing `confirmDraft`. Any write still waiting whose sequence is at or below it is dropped instead of run.
  - **One pending write.** The throttle keeps at most one waiting draft write, and when it fires it takes the editor's current state with a new sequence. An older snapshot is never waiting to be written.
  - **When IndexedDB fails** (`unavailable`, `quota`), the save is still sent, and the status says the work is not kept on this device.

**2. `prepareSave` can change content without saying so, and some text cannot be stored.**
- **Lossless today:** every v3 and v4 fixture comes back through `prepareSave` and `restoreSermonDocument` as `eq` to the original. Every attribute the editor writes today comes from validated or finite-checked values: zod for styles and appearance, `Number.isFinite` and integer checks on paste, `JSON.parse` for JSON attributes.
- **Gap 1, latent:** the schema and `restoreSermonDocument` don't check the types of most attributes (`layout`, `page`, `translation`, `subtitle`, a note's kind, a passage's display). If one ever held `NaN`, `Infinity`, `undefined` inside an object, a `Date`, or a function, `JSON.stringify` would change it to `null`, `{}`, a string, or nothing, and the core would accept the result. Probed: a changed document, accepted without a word. No current code path reaches it.
- **Gap 2, reachable:** PostgreSQL `jsonb` refuses text containing U+0000 (`22P05`) or an unpaired surrogate (`22P02`). The core accepts both. `updateDocument` then throws, the action answers `failed`, and `saveOutcome` says `failed` with `uncertain: false`, so an autosave would retry a save that can never succeed. A plain-text paste is one way such text can arrive.
- **Recommended fix** (small, before A2.3B):
  - One walk in `persistence/model.ts` that makes the plain copy and refuses, with a path, anything JSON or `jsonb` would alter:
    - a number that is not finite;
    - an `undefined`, a function, a symbol, or a BigInt;
    - an object that is not plain (a null prototype is allowed, as ProseMirror's attributes have);
    - a hole in an array;
    - a string with U+0000 or an unpaired surrogate.
  - Measured on the 3 MiB document: 6–9 ms, plus 6 ms to stringify the copy, against 14–21 ms for today's `JSON.parse(JSON.stringify(...))`.
  - `prepareSave` uses it and answers a third way, never sending such a document. `prepareDocument` runs it first and answers `invalid`, with new problem codes `not_json` and `unstorable_text`, instead of a database error.
  - Regression tests: fixtures round-trip `eq`; each value above refused with its path; a null-prototype object and a paired emoji accepted; on the server, a save with U+0000 answers `invalid` and leaves the stored document unchanged.
- **For the owner:** whether the editor should also stop U+0000 and unpaired surrogates at input (paste), so a person never ends up with a document that cannot be saved. That is an editor change, not part of A2.3A.

**3. The duplicated A2.2 section** is consolidated. It is one section now:
- the shared body;
- the newer deployment and rollout section, verified against the build;
- A2.2's own "For A2.3", "For A3", and "Ready for owner review";
- the `docs/DATABASE.md` rollback reference from the older copy.

The removed lines were an exact repeat of A2.1's closing sections ("For A2.3", "For A3", "Ready", "Final review", the race, and the tracked items) and the older copy of A2.2's body.

## A2.3A.1: Strict document JSON and the read action (26 October 2026)

**Status:** built and verified with focused tests. Not committed, not deployed, and no migration run anywhere.

**Git:** began on `dev` at `578fe23` (A2.3A), with this handoff's A2.2 consolidation uncommitted, and kept it. Ends there, with the files below changed or new and nothing staged.

### Strict serialization (`persistence/json.ts`)

`toPlainJson(value)` is one walk that makes the plain copy, or refuses with the first problem and its path. The browser and the server use the same function.

- **It accepts:**
  - JSON objects, including ProseMirror's null-prototype attributes, copied to plain objects (`Object.prototype`) as a Server Action and a Client Component require;
  - arrays, strings, booleans, `null`, and finite numbers;
  - a value referenced twice (copied twice, as JSON does);
  - a key named `__proto__` (kept as a property, as `JSON.parse` keeps it).
- **It refuses, as `not_json`:** `NaN` and the infinities; `undefined`, functions, symbols, and BigInts; any object that is not plain (a `Date`, a `Map`, a class); symbol keys; an array with holes or extra properties; a cycle; nesting deeper than the stack.
- **It refuses, as `unstorable_text`:** a string or a key holding U+0000 or an unpaired surrogate, which PostgreSQL's `jsonb` refuses. Paired surrogates, emoji, joiners, BOMs, and noncharacters are ordinary text and pass.
- **What a refusal carries:** `{ code, path, detail }`.
  - `path` is in the document's own style, `/content/1/content/0/text`.
  - `detail` is a kind (`NaN`, `undefined`, `Date`, `cycle`, `nul`, `unpaired_surrogate`, `key_nul`, …), never the value or any text.
- **The one change it makes:** `-0` becomes `0`, which JSON cannot tell apart and which compares equal.
- **It checks only JSON and storage.** Whether the value is a sermon document is still `restoreSermonDocument`'s; nothing about the schema was added.
- **New problem codes:** `not_json` and `unstorable_text`, added to `ProblemCode` (`editor-lab/validate.ts`), a type change only.

**`prepareSave(content)`** (`saving.ts`) now returns `PreparedSave`:
- `{ ok: true, content, bytes }`;
- `{ ok: false, reason: "too_large", bytes, limit }`;
- `{ ok: false, reason: "unsafe", problem }`.

The two refusals are told apart by `reason`. Neither is ever sent; the controller keeps all of the snapshot. `plainDocument`, the permissive copy, is removed.

**`prepareDocument(json)`** (server) runs `toPlainJson` first:
- a refusal is `invalid` with that problem, before the size, the schema, or the database is asked;
- the size and the schema are then checked on the plain copy.

So a save holding U+0000 now answers `invalid` (`unstorable_text`), with its own message ("…contains a character that can't be saved…"), instead of a PostgreSQL `22P05` or `22P02` reported as `failed` (which an autosave would retry forever). The 3 MiB limit and the core's validation are unchanged. A cycle and a BigInt were already `invalid`; they now say `not_json`, with a path.

### The read action (`readOutlineDocument`, `actions.ts`)

- **Access and input:** `authorize("active")`, with the owner taken from the session. The outline ID is parsed with `outlineIdSchema`. It reads through `getDocument` and nothing else.
- **Answers** (`DocumentReadResult`):

  | Answer | When |
  | --- | --- |
  | `{ ok: true, content, revision }` | The canonical document as a plain copy (`toPlainJson`: React refuses null prototypes from server to client too), and the revision a save names. |
  | `{ code: "missing" }` | No document, no such outline, or another account's: the same answer. |
  | `{ code: "unreadable", revision }` | Stored but no longer accepted. Neither the content nor its problems are given. |
  | `{ code: "invalid" }` | An ID that is not a UUID. |
  | `{ code: "failed" }` | The database failed. It is logged as its kind and SQLSTATE only, never with the query's parameters. |
  | `{ ok: false, message }` with no code | Not signed in, or not allowed. |

- **Read only.** It never creates, converts, repairs, or writes, and revalidates nothing. Tested: the row, the revision, and the update time are unchanged after reading, and reading an outline with no document makes none.
- **`readOutcome(result)`** (`saving.ts`) reads it as `found` (content, revision), `missing` (an invalid ID too), `unreadable` (revision), `unauthorized`, or `failed`.
- **Not built:** comparing or merging. That is A2.3B's.

### For A2.3B

- **Before a save:** `prepareSave`. On `unsafe` or `too_large`, keep the draft, send nothing, and say so; never retry it by itself.
- **After a save:**
  - `saveOutcome`, then `confirmDraft` or `refuseDraft`;
  - a refused `invalid` with `unstorable_text` waits for the person, like any refusal.
- **After a save with no answer** (`failed`, `uncertain: true`):
  1. `readOutlineDocument`, then `readOutcome`.
  2. If `found` and the revision is the expected one plus one, compare its `content` with the canonical form of the snapshot that was sent. That form is what the server stores: `restoreSermonDocument(sent).doc.toJSON()`, compared as `JSON.stringify` of both `toPlainJson` copies. If they are equal, the save landed: `confirmDraft` at that revision.
  3. If the revision is the expected one, the save did not land: send it again.
  4. Anything else is a conflict for the person. Never merge.
- **The lifecycle rules** from the A2.3A review follow-up still apply (one queue, write ahead, a watermark, one pending write).

### Deferred: paste handling (UI.3 / A3, approved)

When pasted text contains U+0000 or unpaired surrogates, the editor deals with them at its input boundary:
- ordinary Unicode and paired emoji are kept;
- meaningful content is never changed silently;
- the person is told when anything was normalized.

This is separate from persistence. The server refuses such text by itself, whatever the editor does.

### Files

- **New:** `src/features/sermon-editor/persistence/json.ts`.
- **Changed:**
  - `persistence/documents.ts` (`prepareDocument`), `saving.ts` (`prepareSave`, `PreparedSave`, `DocumentReadOutcome`, `readOutcome`; `plainDocument` removed), and `actions.ts` (`readOutlineDocument`, `DocumentReadResult`, the unstorable message);
  - `src/features/editor-lab/validate.ts` (two `ProblemCode`s);
  - `src/i18n/dictionaries/en|es/outlines.ts` (`documentLoaded`, `documentNotRead`, `documentUnstorable`);
  - tests: `saving.test.ts`, `actions.test.ts`, `documents.test.ts`, `transport.test.ts`;
  - `AGENTS.md`, `ARCHITECTURE.md`, and this handoff.

### Verification

- `vitest run src/features/sermon-editor/persistence src/features/sermon-editor/document src/i18n`: 10 files, 158 passed.
  - `saving.test.ts` (14):
    - every v3 and v4 fixture comes back `eq` and equal to its JSON;
    - every object in the copy is plain;
    - Unicode and emoji are kept;
    - each refused value is refused at its exact path, including a nested `undefined` and a cycle;
    - a value shared twice is accepted;
    - the refusals contain none of the text;
    - `too_large` is told apart from `unsafe`;
    - `readOutcome` reads every answer.
  - `actions.test.ts` (16):
    - unstorable text and `NaN` are `invalid` with paths while the database throws if asked, so it never was;
    - the stored row is unchanged after such a save;
    - the read action: not signed in; another account's is `missing`; `unreadable` without content; read-only; a database failure logged without the document;
    - the content it returns passes React's action encoder.
  - `documents.test.ts` (30): `updateDocument` and `createDocument` answer `invalid` for U+0000 and an unpaired surrogate and keep the row; emoji are stored and read back.
- **A deliberate mutation** (accepting non-finite numbers, skipping the text check) made 5 tests fail; it was reverted.
- `tsc --noEmit`: clean. ESLint and Prettier on everything changed: clean.
- **Not run:** the full unit suite, a production build, end-to-end tests, and any migration.

### Risks

- **The walk costs** about 6–9 ms on a 3 MiB document (measured in the A2.3A review), on both sides of each save. It replaces a round trip that cost more.
- **The comparison after a lost answer is A2.3B's** to build exactly as above. Comparing the editor's JSON with the server's without canonicalizing first would see differences that are not there (defaults written out by the core).
- **A3's page** must also send `getDocument`'s content to the client through `toPlainJson`, or through this action. `getDocument` returns ProseMirror's JSON, which React refuses.

### Ready for owner review

**Yes.** Nothing is committed, deployed, or migrated, and A2.3B has not been started.

## A2.3B.1: Autosave controller foundation (26 October 2026)

**Status:** built and verified with focused tests. Not committed, not deployed, not mounted, and no migration anywhere.

**Git:** began on `dev` at `7be079b` with a clean tree. Ends there, with the files below changed or new and nothing staged.

### What was found

- **Transactions (Tiptap 3.31.4).**
  - `dispatchTransaction` emits `transaction` with `{ transaction, appendedTransactions }` for every applied transaction.
  - `update` fires only when one of them is `docChanged`, `preventUpdate` is unset, and the document is not `eq` to the one before.
  - Every document change is a step, so it is `docChanged`: typing, structure, Scripture, notes, scripts, page breaks, `setDocAttribute` (numbering `layout`, `styles`: the preset and appearance), Undo, and Redo.
  - View state is meta only, so it is not `docChanged`: expansion, Regular or Print and page setup, `setStylesPreview`, the appearance target, presentation, caret sync, selection, and focus.
- **No plugin changes the document by itself.**
  - `NodeIdentity` and `V4Plugins` act in `appendTransaction` only on transactions that already changed it.
  - `loadV4` dispatches one empty, history-less transaction before `onReady`.
- **Teardown.** `onReady` runs only after a successful `loadV4`. `Editor.destroy()` emits `destroy` before it unmounts the view and removes its listeners, so the document can still be read in that handler.
- **The resurrection.** `writeDraft`'s sequence check protects a draft only while it exists. A write issued after `confirmDraft` has cleared the draft makes it again; that is how the store is meant to work, and the controller prevents it.
- **No existing equality helper.** Comparing `JSON.stringify` output depends on key order, so `jsonEqual` was added.

### What was built

- **`persistence/autosave/model.ts`:**
  - `autosaveTiming`: 350 ms debounce, 2 s maximum. The maximum bounds what continuous typing can leave unkept to about 2 s.
  - `DocumentSource`, the `AutosaveState` contract, and `autosaveStatus`.
  - `jsonEqual`: order-independent, and it stops at the first difference.
- **`persistence/autosave/controller.ts`:** `createAutosaveController({ owner, outlineId, revision, source })`.
  - **Identity.** Owner, outline, and revision are validated with `draftInputs`. The `draftId` is the controller's own `randomUUID()` and is never given.
  - **Snapshots.**
    - A change only marks the state changed and arms the timers; it serializes nothing.
    - At the boundary the controller reads once, makes the copy with `prepareSnapshot`, and compares it with `jsonEqual` against the newest snapshot (sequence 0 is the document as attached).
    - Only something new takes the next sequence. An edit undone before its boundary writes nothing.
  - **Ordering.**
    - One promise chain carries every draft operation; each catches its own failure.
    - At most one write waits, and it is always the newest snapshot.
    - `claimSave` hands out a snapshot only once its write has settled, and only one at a time.
    - `confirmSave` accepts only the claimed sequence. Before anything is queued, it raises `confirmedSequence` (the watermark), the revision, and `localSequence`, and drops a waiting write at or below the watermark.
    - Three guards stop a cleared draft being made again: the drain's watermark check, the drop of a waiting write, and `retry`'s check. A mutation test showed each is enough alone, and that removing all three makes the test fail.
  - **Failures.**
    - A failed write sets `storageError` (the `DraftStorageError` kind) and never raises `localSequence`.
    - Nothing retries by itself: only a new snapshot or `retry()` writes again.
    - A failed `confirmDraft` leaves a draft equal to the server's copy, which recovery discards as equal.
  - **`flush()`** resolves with the state once the operations decided so far have finished. It does not rely on unload.
  - **`dispose()`** (also called when the source ends):
    - takes a last snapshot of unkept changes, cancels its timers, and unsubscribes;
    - tells its listeners once, then publishes nothing more;
    - lets decided operations finish, and still accepts the confirmation of a save in flight.
- **`persistence/autosave/editor-adapter.ts`:** `editorSource(editor)`.
  - It uses the public `on`/`off` events only, and a `live` guard means nothing is called after unsubscribing.
  - `read()` throws `SourceGone` once the editor is destroyed.
- **`saving.ts`:** added `prepareSnapshot`, which is `prepareSave` but keeps the plain copy when a document is too large. `prepareSave` now delegates to it; its contract and tests are unchanged.

### Status contract

| Status | Means |
| --- | --- |
| `saved` | The server confirmed exactly the current content (only through `confirmSave`). |
| `unprotected` | The current content is kept nowhere but the editor: a failed write, or content that is not plain JSON. |
| `pending` | Changes not yet kept on this device. |
| `attention` | Kept on this device, but too large for the server. A2.3B.2 adds conflicts here. |
| `local` | Kept on this device, not known to be on the server. |
| `unchanged` | Nothing changed since the document was attached. |

### Attaching (A3)

```ts
onReady={(editor) => {
  controller = createAutosaveController({ owner, outlineId, revision, source: editorSource(editor) });
}}
```

`SermonWorkspace` is unchanged. A refused document never calls `onReady`. The controller disposes itself on the editor's `destroy`, while the document is still readable.

### Decisions for the owner (not blocking)

1. **Content that is not plain JSON** (in practice U+0000 or an unpaired surrogate from a paste) is not written as a draft.
   - The draft format promises schema v4 JSON.
   - The editor keeps the words, the previous draft stays, and the status says `unprotected`.
   - Keeping such content raw on the device instead is possible, if the owner prefers it.
   - The approved paste-boundary fix (UI.3/A3) makes this rare.
2. **A document over 3 MiB is kept on the device**, as "words are never refused locally" requires. It is shown as `attention` and never claimed for a save.
3. **The baseline is the editor's document at attach.** A document migrated on opening (v3 to v4, or defaults written out) is not saved until it is edited. A3 decides whether that should change.

### Measured (vitest, jsdom; indicative)

On a 3.37 MB v4 document:
- `getJSON`: about 3 ms;
- `prepareSnapshot`: about 50 ms;
- `jsonEqual` over equal documents (the full walk): 3–9 ms.

During continuous typing on a document of that size, that is about one 60 ms snapshot every 2 s. A real browser was not measured.

### Files

- **New:** `src/features/sermon-editor/persistence/autosave/model.ts`, `controller.ts`, `editor-adapter.ts`, `controller.test.ts`, `editor-adapter.test.ts`.
- **Changed:** `persistence/saving.ts` (`prepareSnapshot`), `AGENTS.md`, `ARCHITECTURE.md`, and this handoff.

### Verification

- `vitest run src/features/sermon-editor/persistence src/features/sermon-editor/document src/features/editor-lab/v4`: 19 files, 402 passed, none failed. The new files hold 31 tests:
  - `controller.test.ts` (23): timing on fake timers; ordering on the real store in fake-indexeddb; failures, the B.2 boundary, lifecycle, and content safety.
  - `editor-adapter.test.ts` (8): a real v4 editor.
- **Mutations**, each reverted:
  - removing the equality check failed 2 tests;
  - counting a write as kept before it finished failed 3;
  - removing every watermark guard failed the resurrection test.
- `tsc --noEmit`, ESLint, and Prettier on `src/features/sermon-editor/persistence`: clean.
- **Not run:** the full suite, a build, end-to-end tests, and a real browser. Nothing is mounted or visible.

### For A2.3B.2

- **The save loop:**
  1. `flush()`, then `claimSave()`.
  2. Send `content` against `expectedRevision`.
  3. Read the answer with `saveOutcome`.
  4. `confirmSave` on `confirmed`. Otherwise `releaseSave`, plus `refuseDraft` for a refusal or conflict. That refusal has to go through the controller's queue: add an operation there, never a direct call.
- **Its own timing:** the server's 1.5 s idle and 10 s maximum, kept separate from the local timers. Never send while `refusal` is set.
- **An unanswered save:** the reconciliation in A2.3A.1 above, comparing with `jsonEqual` against the canonical form of what was sent.

### For A2.3B.3

- `holdUnsavedWork` while the status is not `saved`, `local`, or `unchanged`.
- On `pagehide` and `visibilitychange`, `flush()` (best effort). Tab coordination and account switching.

## A2.3B.2A: Network autosave coordinator foundation (27 October 2026)

**Status:** built and verified with focused tests. Not committed, not deployed, not mounted, not production-ready, and no migration anywhere. B.2B (reconciliation and conflict safety) and B.2C (retry and hardening) are not started.

**Git:** began on `dev` at `852b508` with a clean tree. Ends there, with the files below changed or new and nothing staged.

### Approved by the owner (binding)

1. A separate, framework-independent coordinator with an injected transport; IndexedDB stays the controller's.
2. The authoritative canonical base is tracked explicitly; revision numbers alone never decide that content matches.
3. The eventual retry: bounded exponential backoff, at most 30 s, manual after repeated failure; an unresolved save is never retried blindly. Only its foundations are here.
4. B.2A, B.2B, B.2C in that order; this is B.2A only.

### What was found

- **The controller's notifications cannot time a server save.** It publishes on the first change after a snapshot, not on each change, so a 1.5 s idle timer cannot be measured from `subscribe()`. Added `onDocumentChange` (below).
- **`claimSave` claims only the latest captured snapshot** and returns null while a draft write waits or runs. A local snapshot can be taken while `flush()` awaits IndexedDB (it awaits the queue as it was when called). The claimed content is an immutable copy, so later edits never leak into it.
- **The server stores `restoreSermonDocument(...).doc.toJSON()`**, not the editor's JSON: a v3 document becomes v4, defaults are written out, and attributes have no prototype. `prepareDocument` was the server's pipeline but lived in `documents.ts`, which imports the database.
- **`confirmSave` accepts any revision at or above the current one.** The server's contract is narrower: an accepted update is exactly `expectedRevision + 1` (`updateDocument`).
- **A B.1 defect (fixed):** after a confirmed save, an unsafe paste (U+0000, an unpaired surrogate) left `autosaveStatus` at `saved`, because the `saved` check came before the `unsafe` one. The editor's words were kept nowhere. `unsafe` is now checked first; regression test in `controller.test.ts`.
- **After an unsafe paste, `claimSave` would still claim the older valid snapshot** if it was not yet confirmed. The B.1 handoff says never send while `refusal` is set, so the coordinator checks the controller's `refusal` before claiming (a mutation test showed this check is the only guard).

### What was built

- **`persistence/canonical.ts`** (pure):
  - `prepareDocument`, moved unchanged from `documents.ts`, which imports and re-exports it (callers unchanged; a test asserts they are the same function).
  - `canonicalDocument(json)`: `prepareDocument` plus the `toPlainJson` step `readOutlineDocument` takes, so the browser predicts with the server's own function what a save stores and what reading it back gives. Compare with `jsonEqual`.
- **`autosave/controller.ts`:** `onDocumentChange(listener)`, called for every change the source reports, until unsubscribed or disposed. It reads and publishes nothing. Nothing else in the controller changed.
- **`autosave/model.ts`:** `serverSaveTiming` (1,500 ms idle, 10,000 ms at most), the `NetworkState` contract, `serverSaveStatus`, and the `autosaveStatus` fix above.
- **`autosave/transport.ts`:** `DocumentTransport` (`save`, `read`; neither rejects) and `actionTransport(actions)`, which takes `saveOutlineDocument` and `readOutlineDocument` as arguments and imports only their types. A throw or something that is not an answer is `unansweredOutcome` (uncertain); answers go through `saveOutcome` and `readOutcome`.
- **`autosave/coordinator.ts`:** `createSaveCoordinator({ controller, transport, base, timing? })` with `getState`, `subscribe`, `saveNow`, `retry`, `getBase`, `getSubmission`, `dispose`.

### Initialization (for A3)

```ts
const controller = createAutosaveController({ owner, outlineId, revision, source: editorSource(editor) });
const coordinator = createSaveCoordinator({
  controller,
  transport: actionTransport({ save: saveOutlineDocument, read: readOutlineDocument }),
  base: { content, revision }, // what readOutlineDocument / getDocument gave: the authoritative document
});
```

- `base.revision` must equal the controller's revision, the controller must not be disposed or hold a claim (an earlier coordinator's unresolved save), and the base must be a document the core accepts; otherwise `SaveCoordinatorError` (`revision`, `disposed`, `claimed`, `base`).
- The base is kept as given, with `canonical: false` if it was not already in canonical form; that is reported, never assumed.
- The editor's document at attach is still the controller's baseline (B.1's decision 3). A document migrated on opening is not treated as persisted canonically, and is not saved until edited; A3 decides.

### State

`NetworkState` holds no document content (that is `getBase()` and `getSubmission()`):

| Field | Means |
| --- | --- |
| `phase` | `idle`, `scheduled`, `preparing`, `saving`, `reconciling`, `blocked`, `failed`, `disposed` |
| `revision` | The revision the next save names |
| `base` | `{ revision, provenance: "server" or "confirmed", canonical }` |
| `submission` | `{ sequence, expectedRevision, bytes }` of the save in flight or unresolved |
| `confirmedSequence`, `due` | The newest confirmed; a save fell due during another |
| `outcome`, `block` | The last answer; `{ reason, origin: "server" or "local" }` when stopped |

`serverSaveStatus(local, network)` gives `saved` (only when the controller's own status is `saved`), `saving`, `waiting`, `unresolved`, `blocked`, `failed`, `disposed`, or the local status (`unprotected`, `attention`, `unchanged`, `pending`, `local`). It never says `saved` with unsnapshotted edits, a newer sequence, an uncertain or refused save, or after a confirmation of only an older sequence. The final indicator is A3's.

### Scheduling

- A change restarts the idle timer (1.5 s) and arms the maximum (10 s) only if it is not armed, so typing never pushes it back. Timers keep running during a save; one that fires then sets `due`, and the next save starts as soon as that one settles.
- It publishes when the phase changes, never per keystroke.
- A save that finds nothing to send goes `idle` and arms nothing: no loop when the content is too large, refused, or unchanged. After a confirmation, the idle timer is armed once if newer work waits and nothing else will start a save.
- Changes are ignored while `reconciling`, `blocked`, or `failed`; the controller still keeps them on the device.

### A save, step by step

1. `controller.flush()`: changes not yet in a snapshot are taken, and queued draft writes finish first (write ahead). A failed draft write does not stop the save.
2. Nothing is sent if the controller has a `refusal` or nothing is newer than the confirmed sequence.
3. `claimSave()`. If a draft write slipped in during the flush, it flushes and claims again, at most 3 times.
4. The claim's `expectedRevision` must be the coordinator's (else `blocked`, `revision_mismatch`).
5. `canonicalDocument(claim.content)`. If it refuses, nothing is sent, the claim is released, and it stops (`blocked`, `refused`, origin `local`). Otherwise its output is kept as `predicted`.
6. `transport.save(...)`, one request; a throw is `unansweredOutcome`.

### Outcomes

| Answer | What happens |
| --- | --- |
| `confirmed`, for the sequence sent, at `expectedRevision + 1` | `confirmSave`. Revision advances; base becomes `predicted` (`provenance: "confirmed"`); newer work stays pending and is sent against the new revision. If `confirmSave` refuses, nothing advances (`reconciling`, `rejected_confirmation`, origin `local`): the server wrote it, so it is unresolved, never a refusal. |
| `confirmed` at any other revision (missing, NaN, same, older, +2) | Nothing confirmed. `reconciling` (`unexpected_revision`), claim held. |
| An answer for another sequence, a throw, `failed` + `uncertain` | Nothing confirmed. `reconciling` (`uncertain`), claim held, submission kept. |
| `conflict` (`stale`, `missing`) | Claim released, submission cleared, `blocked` (`conflict`). The server's revision is not adopted. |
| `refused` | Claim released, submission cleared, `blocked` (`refused`). |
| `unauthorized` | Claim released, submission cleared, `blocked` (`unauthorized`). |
| `failed`, not uncertain (nothing written) | Claim released, `failed`. Only `retry()` sends again. |

`reconciling` and `blocked` are final in B.2A: nothing is sent from them, by timers, `saveNow()`, or `retry()`.

`submission` is set exactly while the controller's claim is held: in flight, or `reconciling`. `blocked` and `failed` hold neither, since nothing of them was written; `block.reason` and `outcome` (with its `code`) say which refusal it was.

### Disposal

- `dispose()` (and the controller's own disposal, when the editor goes) cancels the timers, unsubscribes, tells listeners once, and sends nothing more.
- A request already sent may still be taken by the server. A late `confirmed` is still given to `confirmSave` on the same session's controller, which clears that session's draft correctly; nothing is scheduled. Any other late answer is recorded and starts nothing.
- A claim made while being disposed is released unsent.

### Measured (vitest, jsdom; indicative)

`canonicalDocument` on a 2.7 MB v4 document: about 80–90 ms, once per server save (at most every 1.5 s of idle or 10 s of typing), never per keystroke. A real browser was not measured.

### Files

- **New:**
  - `src/features/sermon-editor/persistence/canonical.ts`, `canonical.test.ts`
  - `persistence/autosave/coordinator.ts`, `coordinator.test.ts`
  - `persistence/autosave/transport.ts`, `transport.test.ts`
- **Changed:** `persistence/documents.ts` (`prepareDocument` moved out), `autosave/controller.ts` (`onDocumentChange`), `autosave/model.ts`, `autosave/controller.test.ts` (2 tests), `AGENTS.md`, `ARCHITECTURE.md`, and this handoff.

### Verification

- `vitest run src/features/sermon-editor/persistence src/features/sermon-editor/document src/features/editor-lab/v4`: 22 files, 457 passed, none failed. The new tests:
  - `coordinator.test.ts` (43): scheduling, the save boundary and write-ahead order, one request at a time, the base, every outcome, and disposal; on fake timers with the real B.1 controller, and two on a real v4 editor (selection and view state; typing, Undo, and Redo during a save).
  - `canonical.test.ts` (6), `autosave/transport.test.ts` (4), `controller.test.ts` (+2).
- **Mutations**, each reverted:
  - accepting any confirmed revision failed 3 tests;
  - accepting an answer for another sequence failed 1;
  - ignoring the controller's refusal failed 1;
  - removing both one-request guards failed 2;
  - releasing the claim on an uncertain answer failed 2.
- `tsc --noEmit`, ESLint, and Prettier on `src/features/sermon-editor/persistence`: clean.
- **Not run:** the full suite, a build, end-to-end tests, and a real browser. Nothing is mounted or visible.

### Limitations

- **Version skew.** A `confirmed` base is the browser's prediction with the browser's schema. If the server was deployed with another schema between load and save, the stored form may differ. B.2B's read-back settles it; until then `provenance` says which it is.
- **No timeout.** A request that never settles leaves the coordinator `saving`, which is safe but stuck (B.2C).
- **An edit back to confirmed content is sent again** (one write, one revision): skipping it means confirming a sequence that was never sent, which needs B.2B's canonical comparison.
- **After a definite failure** the status is `failed` until `retry()`: changes are kept on the device but not sent.

### For A2.3B.2B

- Resolve `reconciling` with `transport.read`: `jsonEqual(read.content, submission.predicted)` at `expectedRevision + 1` confirms; the old base at `expectedRevision` means not saved (release and send again); anything else is a conflict. Never decide from the revision alone.
- Conflicts and refusals: `refuseDraft` through the controller's queue (an operation there, never a direct call), and what the person is offered.
- Whether an edit back to the base can be confirmed without a write.

### For A2.3B.2C

- Bounded exponential backoff from `failed` (at most 30 s, manual after repeated failure), and a request timeout that ends as `uncertain`, never as a retry.

### For A2.3B.3 and A3

- `saveNow()` is the hook for `pagehide` and `visibilitychange`. Which statuses hold unsaved work (`holdUnsavedWork`) is B.3's to settle with `serverSaveStatus`; never `saving`, `unresolved`, `blocked`, or `failed`.
- A3 mounts both, gives `base` from the server read, and builds the indicator from `serverSaveStatus`.

### Post-implementation review (27 October 2026)

Three corrections, each with a regression test written first and seen to fail:

1. **A confirmation the controller refuses is `reconciling`, not `blocked`.** The server wrote that save, so treating it as a definite refusal misfiled a write as nothing written. Reachable only if something else releases the claim; still classified correctly.
2. **A definite refusal clears `submission`.** `conflict`, `refused`, and `unauthorized` released the claim but kept the submission, so `getSubmission()` named a save as unresolved when nothing of it was written. Now `submission` is set exactly while the claim is held.
3. **A controller holding a claim is refused at creation (`claimed`).** A second coordinator on such a controller would have forgotten the earlier coordinator's unresolved save, and re-armed a local timer every 1.5 s without ever being able to claim.

Verified after the corrections: the same `vitest run` as above, 22 files, 459 passed (2 new tests; the five refusal cases now also check `submission` and `outcome`); `tsc --noEmit` and ESLint on `persistence` clean; Prettier clean on the code. This handoff fails Prettier at HEAD already (its tables are not aligned); the review added no new cases.

Found and left as designed (for later phases):

- **`failed` from the server is definite only as far as the driver knows.** It comes from a caught `updateDocument` error; if the statement committed and the connection dropped before the answer, it is still `failed`. `retry()` is still safe: it names the old revision, so the server answers `stale` and never applies a save twice. B.2B should expect that a `stale` conflict right after a retry may be its own earlier save (the failed submission is not kept).
- **`blocked` is final for every reason in B.2A**, including a refusal (`invalid`, `too_large`) that a later edit could clear. The state tells them apart: `block.reason` (`conflict`, `refused`, `unauthorized`), `block.origin`, and `outcome.code` (`stale`, `missing`, `invalid`, `too_large`). With no claim or submission held, B.2B can resume after a refusal by returning to `idle`, without a redesign.
- **`retry()` called from inside a state listener**, while the failing save is still unwinding, schedules the save 1.5 s later instead of starting it at once. B.2C calls it from a timer, where it starts at once.
- **`saveNow()` during a running save** resolves once that save settles; the save it made due (holding the newer words) has started by then but not finished. B.3 should watch the coordinator's state if it needs that save's answer.
- **The base is not compared with the editor's opening document.** A3 must open the editor from the same read it gives as `base`.

### Ready for owner review

## A2.3B.2B.1: Deterministic ambiguous-save reconciliation (27 October 2026)

**Status:** built and verified with focused tests. Not committed, not deployed, not mounted, and no migration. This is the first of three checkpoints in A2.3B.2B. B.2B.2 (the conditional retry) and B.2B.3 (refusal recording and resumption) are **not built**.

**Git:** began on `dev` at `b265b34` with a clean tree. Ends there, with the files below changed and nothing staged.

### Approved by the owner (binding)

1. B.2B.2 retries once, conditionally on the revision, after a read-back shows the original base.
2. B.2B.3 resumes automatically after a new valid snapshot corrects invalid or oversized content.
3. Three checkpoints, each reviewed and committed by the owner. This one is read-back and classification only.

### What was found

- **`confirmSave` needs no change.** It takes the claimed sequence at any revision at or above the controller's.
- **A server `failed` could hide a commit.** The database is a Neon `Pool` over WebSocket. If `updateDocument` committed and the connection then dropped, `saveOutlineDocument` caught the error and answered `failed`, and `saveOutcome` read that as `uncertain: false`, so the coordinator released the claim. **Fixed:** `saveOutcome` now maps `failed` to `uncertain: true`, so such a save is read back. The coordinator's `uncertain: false` branch (`failed`, `retry()`) stays for a transport that can promise nothing was written; no server answer reaches it any longer.
- **`stale` as evidence of an earlier save.** After the fix, B.2B.1 sends nothing while a save is unresolved, so a `stale` answer can no longer belong to an earlier ambiguous save of this session. B.2B.2's conditional retry can meet one: it must read back, not block as a conflict.
- **The base a save was made against was implicit.** It held only because `base` changes only when `submission` clears. It is now recorded in the `Submission`.

### The rule

`updateDocument` writes only where the stored revision is the one named (R0), and revisions only rise. So **a request whose answer was lost can still be written while the server's revision is R0 or lower, and never once it is past R0.** Every classification follows from that:

- Settle only what is proven.
- Release only what can never be written.
- Hold everything else, with the claim and the `submission` kept and nothing sent.

### Classification

Notation: R0 is `submission.expectedRevision`; S is `submission.predicted` (the browser's canonical form of what was sent); B0 is `submission.base.content` (the canonical base it was made against); R1 and D1 are the revision and content read.

D1 is compared with `jsonEqual`, giving `exact`. Failing that, the browser's `canonicalDocument(D1)` is computed once and compared: equal is `normalized`, unequal is `different`, and a refusal by the browser's core is `unknown`. Nothing is compared by string.

| Read | Result | What happens |
| --- | --- | --- |
| R1 = R0 + 1, S `exact`/`normalized`, `confirmSave(seq, R1)` accepted | `saved` (A) | revision R1; base = D1 as read (`provenance: "server"`, `canonical` when `exact`); submission cleared; `idle`; the idle timer armed once if newer work waits |
| R1 = R0 + 1, S `exact`/`normalized`, `confirmSave` refused | `unsettled` | held: still `reconciling`, `block.reason: "rejected_confirmation"`, claim and submission kept, nothing advanced |
| R1 = R0 + 1, S `unknown` | `unverifiable` | held (a server on a newer schema; never called a conflict) |
| R1 > R0 otherwise (other content, or a jump of more than one, even with S) | `conflict` (D, F) | released, submission cleared, `blocked` (`conflict`, server) |
| R1 = R0, B0 matches | `unchanged` (C; `equivalent` when S is B0, case B) | held, for B.2B.2 |
| R1 = R0, B0 does not match (including D1 = S ≠ B0) | `diverged` (E) | held |
| R1 < R0 | `diverged` (F) | held |
| `found` with a bad revision (NaN, negative, fractional) or content that is not an object | `failed` | held |
| `missing` | `missing` (G) | released, `blocked` (`conflict`); nothing created or converted |
| `unreadable`, revision > R0 | `unreadable` (H) | released, `blocked` (`conflict`) |
| `unreadable`, revision ≤ R0 or none | `unreadable` (H) | held; never repaired |
| `unauthorized` | `unauthorized` (J) | `blocked` (`unauthorized`), **claim and submission held**; `reconcile()` refuses from `blocked` |
| `failed`, a throw, an unknown answer | `failed` (I) | held; read again only by `reconcile()` |

**Case B is held, not settled.** S equal to B0 at R0 shows what the server holds now, but the lost request can still commit and move the revision to R0 + 1. Settling at R0 would release the claim, and the next save, made against R0, could then meet a spurious `stale`. B.2B.2's conditional retry resolves it: the retry either commits, or meets `stale` and reads back case A.

**Confirmed and inferred are kept apart.** A read never sets `outcome`, which stays the last answer to a save; a settlement by read is `reconciliation.result === "saved"`. The read shows what the server holds, not which request wrote it.

**Observed is not settled.** What the server was seen to hold is `reconciliation.revision` with `submitted` (`exact` or `normalized` at R0 + 1). Whether the save is settled is the result: `saved` only after `confirmSave` accepted it, the claim is gone, and the phase left `reconciling`. The same evidence with the controller refusing is `unsettled`: not saved, still held. No result ever reads as saved while a claim is held.

### The API

- `reconcile(): Promise<NetworkState>`:
  - It reads once and classifies, and works only while `reconciling` with a `submission`. Anywhere else, or once disposed, it returns the state.
  - It is single flight: a call during a read gets that read's promise. A listener told of the read and asking again gets the same read, since `reading` is set before anyone is told.
  - It never rejects. The read always starts after a tick, so a transport that throws at once is a `failed` read and leaves nothing stuck.
- **Automatic read:** once, when a save's answer leaves the coordinator `reconciling` (`uncertain`, `unexpected_revision`, `rejected_confirmation`). There are no timers and no polling; a failed read waits for an explicit `reconcile()`.
- `Submission.base`: the canonical base the save was made against, taken when sent. The coordinator keeps a canonical copy of its base: the given base's canonical form, then a confirmed save's `predicted`, then a reconciled save's `predicted` (equal to what was read, in the browser's form).
- `NetworkState` gains:
  - `reading`: a read is in flight.
  - `reconciliation`: `{ sequence, result, revision, submitted, base, equivalent }`. It holds no content and is cleared when a new save is sent.
- In held cases, `block.reason` keeps the reason the save was first held; the read's finding is `reconciliation`. `serverSaveStatus` is unchanged: held is `unresolved`, released is `blocked`.
- `saveOutcome`: `failed` is now `uncertain`.

### Disposal

- No read starts after `dispose()`. `reconcile()` starts nothing; while a read is still in flight it returns that read's promise.
- A read already in flight is not cancelled, and nothing on the server is undone. Its answer is classified by the same rules, but nothing is published or scheduled.
- A `saved` read is given to the same session's controller, which clears that session's draft, as B.2A does for a late confirmation. The claim is released by `conflict`, `missing`, and `unreadable` past R0. Anything else holds it, `unauthorized` and `unsettled` included.

### Files

- **Changed:**
  - `src/features/sermon-editor/persistence/autosave/coordinator.ts` (`reconcile`, classification, `Submission.base`)
  - `autosave/model.ts` (`Reconciliation`, `ReconciliationMatch`, `reading`, `reconciliation`, phase docs)
  - `saving.ts` (`failed` is uncertain)
  - `autosave/coordinator.test.ts`, `saving.test.ts`, `autosave/transport.test.ts`
  - `AGENTS.md`, `ARCHITECTURE.md`, this handoff
- No controller, recovery store, server, action, schema, or migration change.

### Verification

- `vitest run src/features/sermon-editor/persistence src/features/sermon-editor/document src/features/editor-lab/v4`: 22 files, 497 passed, none failed.
  - `coordinator.test.ts`: 83, of which 38 are new, covering:
    - cases A–J;
    - a late commit: the automatic read finds the base at R0, the request commits after, and an explicit `reconcile()` settles exactly the sequence sent at R0 + 1, with newer work still pending and nothing sent twice;
    - newer edits during a read;
    - concurrent and re-entrant `reconcile()`;
    - disposal (saved and conflict);
    - controller rejection (`unsettled`, never `saved`);
    - normalization (key order exact, v3 form normalized);
    - a server on another schema;
    - a server `failed` through the real transport (settled, and held);
    - an unexpected confirmed revision read back;
    - malformed reads (7);
    - Spanish and emoji;
    - the submission's own base.
  - The case tests (A–J, the malformed reads, the schema skew, and controller rejection) assert phase, `reconciliation`, `block`, revision, the controller's `confirmedSequence` and `saving`, `submission`, reads, and writes; held and released cases do so through shared helpers (`expectHeld`, `expectReleased`). The narrower tests (the re-entrant listener, normalization, Spanish and emoji, the submission's base) assert what they are about, mostly phase, `reconciliation`, base, and read counts.
  - Existing tests now also assert the single automatic read, and that none follows a dispose.
- **Mutations**, each reverted:
  - settling at any revision past R0 failed 1 test;
  - settling case B failed 1;
  - releasing on a failed read failed 13;
  - settling on a `different` match failed 2;
  - removing single flight failed 2;
  - removing the automatic read failed 41;
  - settling a regression failed 1;
  - recording a refused settlement as `saved` failed 1.
- `tsc --noEmit`, ESLint, and Prettier on `src/features/sermon-editor/persistence`: clean.
- **Not run:** the full suite, a build, end-to-end tests, a real browser, a real database.

### Limitations

- **Held saves stay held.** Without B.2B.2, a save held as `unchanged` (including any transient server failure) sends nothing more until the session ends; the words stay on the device. Nothing is mounted, so no one meets this yet.
- **`unverifiable` and `diverged`** wait for B.2B.3 or A3: what the person is offered, and how a new session takes over.
- **Version skew** is judged only through the browser's own core. A server read the browser normalizes to S counts as S. A newer server's own additions are kept in the base as read, never sent back.

### For A2.3B.2B.2

- From `unchanged` only (C and B), at most once per submission: send the same `submission.content` against the same `expectedRevision`. `confirmed` at R0 + 1 settles as usual; `stale` is read back (expect case A or `conflict`), never a conflict directly; any other ambiguity is held again.
- Keep the claim through the retry. Never resend from `diverged`, `unverifiable`, `unreadable`, or `failed`.

### For A2.3B.2B.3

- Record refusals through the controller's queue (`refuseDraft`, an operation there, never a direct call).
- Resume from `blocked` (`refused`) once a new valid snapshot replaces the refused one.
- Decide what the person is offered for `conflict`, `diverged`, `unverifiable`, `missing`, `unreadable`, and `unauthorized`, and how a new coordinator takes over a claim held after `unauthorized`.

### For A2.3B.2C and A3

- B.2C: a request timeout ends as `uncertain` and so is read back; backoff applies only to a definite `failed`, which no server answer gives now.
- A3: the indicator reads `reconciliation` for detail; `serverSaveStatus` stays the summary. Never show saved from `reconciliation.revision` or `submitted` alone: only `result === "saved"` is settled, and `unsettled` is not.
- A3: never call `reconcile()` from a state listener as a reaction to state. Every read's answer is published, so a listener that reads again whenever it sees `reconciling` without a read in flight would read in a tight loop. Reads are asked by the person or by an explicit, paced trigger (B.2C).

### Ready for owner review


## A2.3B.2B.2 and A2.3B.2B.3: Conditional retry, refusal recording, and resumption (27 October 2026)

**Status:** built and verified with focused tests. Not committed, not deployed, not mounted, and no migration. These are the second and third of the three A2.3B.2B checkpoints, built in one session as the owner approved. A2.3B.2B is complete. B.2C (backoff, timeouts) and A3 (mounting) are not started.

**Git:** began on `dev` at `cfdcc44` with a clean tree. That commit is titled "Phase A2.3B.2B.2 is done!", but it holds B.2B.1 (its handoff section above says B.2B.2 and B.2B.3 are not built). It ends there, with the files below changed or new and nothing staged.

### Approved by the owner (binding)

1. Both checkpoints in one session.
2. The conditional retry is **automatic, once**: sent right after a read finds `unchanged`, with no timer. It is also public as `retryUnchanged()`. (Asked and answered at the start of this session.)
3. A newer valid snapshot resumes saving after an invalid or oversized one (B.2B.1's decision 2).

### B.2B.2: the conditional retry

**When.** Every one of these must hold:
- not disposed;
- `reconciling`;
- the same `Submission` still held;
- its latest read is `unchanged`;
- no read or retry in flight;
- its one retry not spent.

`reconcile()` sends it as part of the same call when its read finds `unchanged`. `retryUnchanged()` sends it when asked. Anywhere else, either call does nothing, or returns the request already in flight.

**What is sent.** `submission.content`, `sequence`, and `expectedRevision` (R0), unchanged, under the claim already held. It never sends the editor's newer content, and the retry is never a new submission. `getSubmission()` returns the same object throughout.

**Budget.** One retry per submission:
- `retried` is compared by object identity, set before anything is sent or told, and never reset;
- `NetworkState.submission.attempts` is 1, or 2 once the retry is sent;
- a later submission has its own budget.

**Single flight.** One slot (`inFlight`) for reads and the retry, never both:
- it is set before the work starts, and the send waits a microtask, so a listener calling either method from inside a state change gets the same promise;
- `NetworkState.retrying` is `true` while the retry is in flight, never together with `reading`.

**The retry's answer:**

| Answer | What happens |
| --- | --- |
| `confirmed`, its sequence, exactly R0 + 1, `confirmSave` accepted | settled as a confirmation (`outcome` confirmed, base `predicted`, provenance `confirmed`); newer work scheduled |
| `confirmed` but `confirmSave` refuses | held, `block: rejected_confirmation`, then read back |
| `conflict` `stale` | **not a conflict**: read back (the original may be what moved the revision) |
| `refused`, `failed`, a throw, another revision, another sequence, or nothing | held, then read back |
| `conflict` `missing` | released, `blocked` (`conflict`), recorded `missing` |
| `unauthorized` | `blocked` (`unauthorized`), the claim **held** (the original may still be written) |

The read back uses B.2B.1's classification unchanged. If it finds `unchanged` again, the save stays held: the budget is spent. At most one save, one read, one retry, and one read back per submission. After that, only an explicit `reconcile()` reads again, and it never resends.

**Why a refusal of the retry is held.** By B.2B.1's rule, only what can never be written is released. The retry's refusal says what the server does now; it does not show the original can never commit (across a deployment, for example). The save stays held with its draft. A3 or B.3 decides what the person is offered.

**Why both attempts cannot be written.** Only the server's `UPDATE … WHERE revision = R0` guarantees it. Nothing in the browser stands in for that. The original's answer always arrives before `reconciling` (that answer is what puts the coordinator there), so only its commit on the server can come late. *(No longer universally true since A2.3B.2C: a save that times out enters `reconciling` while its request may still be pending, and its answer may arrive later or never. The server's condition is still what keeps both from being written; see A2.3B.2C, "The Server Action queue".)* The integration test runs that against a server that writes only at the revision named.

**Disposal.** No read or retry starts after `dispose()`. A retry already sent may still answer:
- a late confirmation at R0 + 1 goes to the same controller;
- a late `missing` releases the claim and records the refusal;
- anything else keeps the claim held.

### B.2B.3: refusals recorded, and resumed from

**Controller (`autosave/controller.ts`):**
- `DraftStorage` now includes `refuseDraft`.
- `refuseSave(sequence, { code, revision? })` is accepted only for the claimed snapshot. It releases the claim and queues `refuseDraft` on the controller's existing queue. That puts it after the snapshot's own draft write (write-ahead) and in order with every other draft operation.
- A revision the store would refuse is dropped rather than losing the record. Like `confirmSave`, it is accepted after disposal.
- `AutosaveState.refusalRecord` is `{ sequence, code, revision?, status: pending → recorded | ignored | failed, error? }`.
  - It is metadata only.
  - It never sets `storageError` and never changes `autosaveStatus`, because the content's durability is reported separately.
  - `ignored` means the draft does not hold that snapshot, for example because its own write failed.
- An oversized snapshot is written with `refusal: "too_large"` in the same `writeDraft`. That is one transaction, not a second 3 MiB write.

**Store and model (`recovery/`), a small deviation from the plan to leave `store.ts` alone:**
- `writeDraft` takes an optional `refusal: "too_large"`. It labels that snapshot's own refusal, but never over a `stale` or `missing` refusal, which belong to the whole line of work.
- `currentRefusal(draft)` says whether a refusal still applies to the content:
  - `stale` and `missing` always do, until a confirmation answers them;
  - `invalid` and `too_large` apply only when they name the draft's own sequence.
- `draftStatus` uses it, so a refusal of an older snapshot is kept as history for A2.3C and no longer counts as `conflict`.
- Recording each oversized snapshot through `refuseDraft` would have rewritten the whole record a second time on every snapshot.

**What the coordinator records** (all through `refuseSave`, never the store):

| Source | Code |
| --- | --- |
| The check before sending (`canonicalDocument`) | `invalid` or `too_large` |
| A first attempt's `refused` | its code |
| A first attempt's `conflict` | `stale` (with the server's revision) or `missing`; definite since B.2B.1 |
| A read that releases | `stale` with the read revision (conflict, or unreadable past R0), or `missing` |

Never recorded:
- an uncertain answer;
- a held read;
- `unauthorized`;
- a retry's `stale` before its read back.

**Resumption:**
- Only `blocked` with `block.reason: "refused"` and no submission can resume.
- A change arms the timers as in `idle`. A newer snapshot that was already waiting when the refusal came is scheduled at once (Scenario F).
- The block is cleared only when a request is actually sent.
- `conflict`, `unauthorized`, `revision_mismatch`, `failed`, and anything `reconciling` never resume, whatever is edited.

**Suppression.** Refused content is not sent again:
- A claim at or below the refused sequence (an edit back to the same snapshot) is released unsent, and the coordinator returns to the same block.
- Content whose canonical form `jsonEqual`s what the server refused, under a new sequence (A→B→A), is foreseen locally. It is recorded for the new sequence and not sent (`origin: "local"`).
- Locally refused content is never sent. Each new snapshot costs one `canonicalDocument` run and no request.
- The memory of a refusal is cleared once a save is settled.

**An oversized document** is held back by the controller (`refusal`, status `attention`) before the coordinator sees it. As in B.2A, it resumes on the first snapshot under the limit.

### Claim ownership

- A claim whose save may still be written is never released because its coordinator went away.
- `createSaveCoordinator` refuses such a controller (`claimed`), so the session's later edits stay on the device and are not sent.
- A definite late answer after disposal (confirmed, `missing`, a first attempt's refusal or conflict) releases or records, after which a new coordinator may be made.
- Taking over an ambiguous claim (a new session, recovery) is A3's and B.3's; nothing here does it.
- Nothing crosses accounts. Every draft operation uses the controller's own owner, outline, and session, which never change.

### Files

- **Changed:**
  - `persistence/autosave/coordinator.ts` (retry, refusal routing, resumption, suppression)
  - `autosave/controller.ts` (`refuseSave`, `refusalRecord`, oversized label)
  - `autosave/model.ts` (`retrying`, `submission.attempts`, `RefusalRecord`, `SaveRefusal`, phase docs)
  - `recovery/store.ts` (`writeDraft`'s `refusal`)
  - `recovery/model.ts` (`lineRefusals`, `currentRefusal`, `draftStatus`)
  - tests: `coordinator.test.ts`, `controller.test.ts`, `editor-adapter.test.ts` (stub), `recovery.test.ts`
  - `AGENTS.md`, `ARCHITECTURE.md`, this handoff
- **New:** `autosave/integration.test.ts`
- No server, action, schema, transport, `saving.ts`, or migration change.

### Verification

`vitest run src/features/sermon-editor/persistence src/features/sermon-editor/document src/features/editor-lab/v4`: 23 files, 566 passed, none failed (497 at B.2B.1, +69). By file:

**`coordinator.test.ts`: 122 (+39).**
- Conditional retry (20): availability before and after `unchanged`; the exact original request with newer edits excluded; confirmation settling only the sequence sent; the original winning (stale, then read back); another writer winning; seven non-settling answers each read back once with no third request; read back unavailable; equivalence and mismatch; equal-to-base at R0 never confirmed; controller rejection; `missing`; `unauthorized`; concurrent and re-entrant callers; disposal during the read and during the retry; a fresh budget per submission.
- Refusals (16): each definite code recorded after its own write; uncertain answers never recorded; a retry's stale recorded only once a read proves the conflict; local invalid never sent; server-refused content never resent under a new sequence; oversized held back then corrected; a still-invalid edit not resuming; Scenario F; a refusal after disposal; a refusal storage failure.
- Five B.2B.1 tests and three B.2A tests changed on purpose, because they asserted "never resent after `unchanged`" and "refusals are final".

**`controller.test.ts`: 38 (+13)**, on the real store in fake-indexeddb:
- refusal after the write, content untouched;
- only the claimed sequence;
- a refusal of N never replacing N + 1;
- a conflict staying current for newer content;
- watermark and baseRevision kept;
- a confirmed snapshot never refused;
- oversized labeling and history;
- precedence over conflicts;
- refusal storage failure reported without touching `storageError`;
- `ignored` when the snapshot's own write failed;
- after disposal;
- a bad revision dropped;
- two accounts kept apart.

**`recovery.test.ts`: 22 (+5).** `writeDraft`'s `refusal`: labeling, precedence, replacing an older invalid, never by an older write, lifted by confirmation.

**`integration.test.ts`: 12 (new).** Scenarios A–H:
- A: the original wins;
- B: the retry wins, and both answers lost;
- C: another writer wins;
- D: invalid, then corrected;
- E: oversized, then shortened;
- F: refusal of N with N + 1 kept;
- G: disposed with a save out, and disposed with a save unresolved;
- H: storage unavailable, and only the refusal failing;
- every operation scoped to the session's own account, outline, and draft.

Each runs against a server that writes only at the named revision and asserts the server's revision and write count.

**Mutations,** each reverted. Run on the coordinator file (1–6) or on all autosave and recovery tests (7–16):

| # | Mutation | Tests failed |
| --- | --- | --- |
| 1 | resetting the budget on each read | 11 |
| 2 | treating the retry's stale as a conflict | 6 |
| 3 | no automatic retry | 26 |
| 4 | accepting any revision past R0 on the retry | 1 |
| 5 | no single flight for the retry | 12 |
| 6 | releasing on the retry's refusal | 1 |
| 7 | resuming from a conflict | 10 |
| 8 | no refused-sequence guard | 1 |
| 9 | recording a refusal on an uncertain answer | 59 |
| 10 | no content suppression | 1 |
| 11 | not arming after a refusal | 2 |
| 12 | no conflict precedence in `writeDraft` | 2 |
| 13 | every refusal current | 6 |
| 14 | `refuseSave` without the claim | 2 |
| 15 | a refusal storage failure reported recorded | 4 |
| 16 | no oversized label | 2 |

**Tooling:** `tsc --noEmit` clean; ESLint and Prettier on `src/features/sermon-editor/persistence` clean.

**Whole unit suite** (`vitest run`): 178 files, 3,112 tests, 3,109 passed, 3 failed. None is this phase's:
- `src/features/preferences/preferences.test.ts` fails to load: its `@/features/admin/clerk` mock has no `deleteIdentity` export. It fails alone too, and neither it nor that module was touched.
- Three `church-ministry-settings.test.tsx` tests timed out under the full run and pass when run alone.

**Not run:** a build, end-to-end tests, a real browser, a real database. Nothing is mounted and no server code changed.

### Limitations

- **A refused or still-`unchanged` retry stays held** until the session ends. The words are on the device, but nothing more is sent. What the person is offered is A3/A2.3C.
- **Oversized from the canonical step only.** A document under the limit whose canonical form is over it is refused locally as `too_large` through the same path as `invalid`. No test builds one; the shared path is tested with `invalid`.
- **Suppression keeps one refused content**, the latest. Refusals of different contents A, then B, then A again would send A once more; the server refuses it again, and nothing loops.
- **A retry needs no fresh claim.** If something else released the controller's claim during the retry, the retry's confirmation is refused by the controller and held (`rejected_confirmation`). Nothing in the application releases claims that way.

### For A2.3B.2C

- Backoff and a request timeout apply to `failed` and, for the timeout, end as `uncertain` (read back). They never add a second conditional retry: the budget is one per submission.
- Pace any explicit `reconcile()`. Never call it or `retryUnchanged()` from a state listener as a reaction to state.

### For A3, A2.3C, and B.3

- **A3:** show `serverSaveStatus`, with `reconciliation`, `submission.attempts`, `retrying`, and the controller's `refusalRecord` for detail. A `failed` `refusalRecord` means the refusal is not on the device; the words may still be.
- **A2.3C:** read a draft's refusal through `currentRefusal`. `stale` and `missing` are conflicts for the person; an older `invalid` or `too_large` is history.
- **B.3:** take over a claim held by a disposed coordinator (a new session through recovery), never by releasing it.

### Ready for owner review


## A2.3B.2C: Network failure, timeout, and retry hardening (27 October 2026)

**Status:** built and verified. Not committed, not deployed, not mounted, and no migration. B.3 (page lifecycle) and A3 (mounting) are not started.

**Git:** began on `dev` at `2060390` ("This phase is now done!", the expected HEAD) with a clean tree. Ends there, with the files below changed or new and nothing staged.

### Approved by the owner (binding)

1. **Automatic retries:** five, after 1, 2, 4, 8, then 16 s. A configured delay is capped at 30 s, and the first attempt is not counted.
2. **Timeouts:** 15 s for a save, 10 s for a read. A timeout proves nothing about the server.
3. **Online again:** one attempt at once, with repeated news coalesced.
4. **Exhaustion:** stop and keep the claim and the draft; recovery is manual. For a held save, manual recovery reads and never writes blindly. The one conditional resend stays one.
5. **Asked this session:** automatic reads also follow a read that found `unchanged` once the conditional retry is spent. A late commit of either request is then settled without the person, and those reads never write. This changes B.2B.2's "only an explicit `reconcile()` reads again" on purpose.

### What was found

- **No server answer is a definite `failed` any longer** (B.2B.1). Backoff therefore matters almost only for reads. The `failed` phase (a transport that promises nothing was written) gets the same bounded schedule, and its retries are saves; no other retry path can write.
- **A request that never settled** left the coordinator in `saving` (or a read in flight) forever. With the timeout, it ends in the established reconciliation path.
- **Disposal and timeouts conflict.** Timing out after `dispose()` would have turned a late confirmation (B.2A delivers it to the same controller) into a synthetic `uncertain`, leaving a claim held that the server had confirmed. So `dispose()` cancels the timeouts, and a request sent before it waits for its own answer.
- **The Server Action queue (found in the final review).** See the section of that name below. Recovery reads through `actionTransport` cannot overtake a save still pending. That limits liveness in production; it is not a known data-integrity defect.

### Operation classification

| Operation | Repeated automatically? | Why |
| --- | --- | --- |
| Read (`transport.read`) | yes, within the budget | read only |
| Save with a definite `failed` (nothing written) | yes, within the budget | the transport says nothing was written; it claims the newest snapshot against the same revision |
| Save timed out, thrown, malformed, or `failed` from the server (uncertain) | **never** | may have committed: held, `reconciling`, read back |
| Conditional retry | once per submission (B.2B.2), only after an `unchanged` read | the budget here is never the retry's |
| `invalid`, `too_large`, `stale`, `missing`, `unauthorized`, conflict, `unverifiable`, `diverged`, `unreadable`, `unsettled` | never | definite or needing a person |

### State machine additions

- **`timed(start, ms, fallback)`**, inside the coordinator:
  - It wraps the three network calls: the save (15 s), the read (10 s), and the conditional retry (15 s).
  - A throw, a rejection, or the timeout gives the fallback: `unansweredOutcome` for a save, `{ kind: "failed" }` for a read.
  - The late value is dropped. The surrounding state machine settles exactly as for no answer.
  - Its timers are kept in a set that `dispose()` clears.
  - There is no abort. Server Actions cannot be cancelled, and an abort proves nothing.
- **Episode** (internal; observable as `NetworkState.recovery`):
  - **Fields:** `{ kind: "read" | "save", retries, limit, status: scheduled | offline | running | exhausted, delayMs }`.
  - **Key:** the held `Submission` object (`read`), or a failure object kept across `retry()` while it keeps failing for certain (`save`).
  - **When it ends:** at any settlement, release, block, local return to idle, or disposal.
  - **Timers:** one at a time. A callback runs only if its episode is still the current one and the coordinator is not disposed.
- **Scheduling.** `afterRecoveryWork()` runs when a read, retry, or save has settled and nothing else is in flight. It schedules only from `running`, so it never makes a second timer and never counts twice. When `retries` reaches the limit, the episode is `exhausted`.
- **Counting:**
  - Counted: an attempt started by the timer or by coming back online.
  - Not counted: the first attempt (including a first read deferred while offline), and an explicit `reconcile()` or `retry()`, which cancel a pending timer and take its place.
  - Nothing gives attempts back except `recover()`, and it does so only after exhaustion.
- **Connectivity** (`autosave/connectivity.ts`):
  - `Connectivity = { online(), subscribe(listener) }` is injected and defaults to `alwaysOnline`. There is no `window` or `navigator` in persistence code; A3 wires the browser's signal.
  - It is advice and never proof, so timeouts and the budget hold either way.
  - **Offline:**
    - a save that falls due, or `saveNow()`, waits (`NetworkState.waiting`);
    - a scheduled attempt waits (`status: "offline"`), with its count kept;
    - the first read of a lost save waits, uncounted;
    - nothing in flight is cancelled;
    - the controller still writes every snapshot to IndexedDB.
  - **Online again:**
    - a waiting attempt goes at once, counted;
    - otherwise a waiting save is sent once;
    - news that repeats the last, and news while something is in flight, starts nothing.
  - The listener is removed on dispose.
- **`recover()`** (new):
  - While `reconciling`, it is one read through `reconcile()`'s path. The conditional retry follows only if it is unspent, and nothing resets `retried`.
  - While `failed`, it is one save through `retry()`.
  - If the episode was `exhausted`, it first sets the count to 0: one new bounded cycle.
  - It is single flight (a call during a read gets that read's promise), keeps every claim, and does nothing elsewhere or once disposed.
  - `reconcile()`, `retryUnchanged()`, and `retry()` keep their contracts. `retry()` also cancels a pending automatic attempt.
- **`NetworkState`** gains `online`, `waiting`, and `recovery`.
- **`serverSaveStatus`** gains:
  - `stalled`: retries exhausted and manual action needed; checked after `blocked`, before `unresolved` and `failed`;
  - `offline`: a save waiting for online; checked after the local `saved`, `unprotected`, `attention`, and `unchanged`;
  - a `refused` block with a corrected save waiting offline reads `offline`, not `blocked`.
  - Nothing new ever says saved.
- **`model.ts`** gains `networkRecoveryTiming`, `recoveryTiming(overrides)` (bad values fall back to the defaults, and the cap is clamped to `maxRetryDelayMs`, 30 s), `retryDelay`, and `NetworkRecovery`.

### Invariants kept

- **Single flight:** one save (`running`), and one read or retry (`inFlight`), as before. Timers, connectivity, `recover()`, and listeners all enter through those two, so no new path overlaps them.
- **Conditional retry:** at most one per submission (`retried`, by identity). The bounded retries call `reconcile()`'s path, where `retryable()` is false once it is spent. So at most two writes of one submission.
- **Revisions:** every save still names the revision it was made against. Nothing writes unconditionally.
- **Claims:** held through timeouts, failed reads, exhaustion, offline, and dispose. They are released only by B.2B's rules.
- **Local durability:** the controller is untouched. `serverSaveStatus` never says saved from a draft, and offline work reads `offline`, `pending`, or `unprotected`, never `saved`.
- **Refusals:** an uncertain or timed-out answer is never recorded as a refusal. Exhaustion records nothing.
- **Disposal:** cancels the save timers, the episode, the timeouts, and the connectivity listener. Late answers follow B.2A and B.2B.
- **Accounts:** the controller's owner, outline, and session are unchanged; nothing new touches storage.
- **No logging**, and no content in any new state.

### Changed tests (deliberately)

These B.2A and B.2B tests asserted "reads nothing more by itself", "waits for `retry()`", or a request held open for 30 s:
- **Unexpected revisions (4), threw or no answer, rejected confirmation:** now 1 + 5 reads, `exhausted`, `stalled`, never a write.
- **A definite `failed`:** now retried after 1 s, and `retry()` still goes at once.
- **Case C, the seven non-settling answers to the retry, the read back unavailable, the same server failure:** their write counts are unchanged; their read counts now include the automatic reads.
- **Test I:** rewritten to the 1 s re-read.
- **The 30 s in-flight test:** passes a 60 s save timeout.

### Files

- **New:** `persistence/autosave/connectivity.ts`
- **Changed:**
  - `autosave/coordinator.ts` (timeouts, episodes, connectivity, `recover()`)
  - `autosave/model.ts` (timing, `NetworkRecovery`, state, status)
  - `autosave/transport.ts` (comment only)
  - tests: `coordinator.test.ts`, `integration.test.ts`
  - `AGENTS.md`, `ARCHITECTURE.md`, this handoff
- **No change** to the controller, recovery, `saving.ts`, the server, actions, schema, or migrations.

### Verification

- **Autosave:** `vitest run src/features/sermon-editor/persistence/autosave`, 5 files, 223 passed (222, then the setup-cleanup test from the final corrections; it fails when the old subscription order is restored).
  - `coordinator.test.ts`: 153, of which 31 are new under "network failures (A2.3B.2C)":
    - timing defaults and clamping;
    - timeouts (a commit after a save timeout, a timeout before the commit, the retry timing out, a read timeout with its late answer dropped, a confirmation 20 s after dispose);
    - bounded retries (exact 1/2/4/8/16 s with exhaustion, fail then succeed, spent-unchanged re-reads settling a late commit, three answered results never retried, `reconcile()` and listener re-entry not multiplying the budget);
    - connectivity (offline before a due save, during a save, during a read, online while already online, online with a timer, an "online" that reaches nothing, unsubscription);
    - manual recovery (after exhaustion with a spent retry, `unchanged`, saved, conflict, failed saves, inert elsewhere);
    - disposal (during backoff, during a read, the controller first).
  - `integration.test.ts`: 22, of which 9 are new. Each runs on the real store in fake-indexeddb with a server that writes only at R0, and asserts writes, revisions, and drafts:
    - a commit after a timeout, settled once;
    - both requests timed out with failing reads, the retry's late commit settled;
    - exhaustion, then `recover()` finding the original's commit;
    - offline editing, sending the newest once;
    - offline during a lost save;
    - reconnecting during a request;
    - a draft write failing offline;
    - invalid content corrected offline;
    - dispose during backoff, with a new coordinator refused.
- **Broader:** `vitest run src/features/sermon-editor/persistence src/features/sermon-editor/document src/features/editor-lab/v4`, 23 files, 604 passed.
- **Mutations** (each reverted from a backup, autosave tests):

| # | Mutation | Tests failed |
| --- | --- | --- |
| 1 | budget reset on online | 1 |
| 2 | no save timeout | 5 |
| 3 | no read timeout | 10 |
| 4 | episode kept on dispose | 1 (0 before a test was added) |
| 5 | `recover()` restoring the conditional retry | 2 |
| 6 | no coalescing of repeated news | 1 (0 before a test was added) |
| 7 | no exhaustion | 16 |
| 8 | every held result re-read | 9 |
| 9 | timeouts kept after dispose | 2 |
| 10 | offline sending anyway | 4 |
| 11 | a lost save's first read not deferred offline | 2 |
| 12 | explicit `reconcile()` counted | 20 |

- **Tooling:** `tsc --noEmit`, ESLint on `persistence`, and Prettier on `persistence`: clean.
- **Whole unit suite** (`vitest run`): 178 files, 3,150 tests, 3,147 passed, 3 failed. None is this phase's:
  - `preferences.test.ts` fails to load (its `@/features/admin/clerk` mock has no `deleteIdentity`; known since B.2B).
  - Two `bible-reader.test.tsx` tests and one `church-ministry-settings.test.tsx` test timed out under the full run. Both files pass alone (161 tests).
- **Not run:** a build, end-to-end tests, a real browser, a real database. Nothing is mounted and no server code changed.

### Limitations

- **The browser's connectivity is not wired.** `alwaysOnline` is the default until A3 passes a real signal. Per this repository's rule, `navigator.onLine` is advice; a device wrongly reporting offline holds saves back, with the words kept on the device.
- **Explicit `reconcile()` is not counted.** A caller that calls it in reaction to every state still reads without pause (B.2B.1's warning stands). `recover()` renews the budget only from `exhausted`, so a `recover()` racing an explicit `reconcile()` begun after exhaustion does not renew it.
- **A late answer after a timeout is dropped even when it would settle the save.** A later read that reaches the server settles it instead. Through today's Server Action transport, that read may not reach the server until the save itself has finished (next section), so nothing guarantees it happens at once after the timeout.
- **`failed`-phase backoff** is reachable only through a transport that promises nothing was written. The real transport never says so.
- **Five automatic attempts take about 31 s plus timeouts.** After that, a held save waits for the person; A3 shows `stalled` and offers `recover()`.
- **The coordinator's own setup.** If `connectivity.subscribe` throws, the coordinator is not made and the error is the caller's. Connectivity is subscribed first, so nothing is registered when it throws; if a controller subscription throws after it, everything registered is undone.

### The Server Action queue (a liveness limit, found in the final review)

The bundled Next.js documentation says Server Functions are dispatched and awaited one at a time per client (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, "Sequential dispatch on the client"; also `01-getting-started/07-mutating-data.md`). `actionTransport` sends both `saveOutlineDocument` and `readOutlineDocument` as Server Actions. So:

1. **A timeout does not stop the server.** A save that times out may still be processed, and may commit.
2. **Recovery reads queue behind it.** While that save is pending, every recovery read waits in the client's action queue behind it. A read cannot learn the save's fate independently.
3. **The read timeout can expire in the queue.** The 10 s deadline is measured from the call, so a read can time out before it reaches the server.
4. **The budget can be spent waiting.** Five automatic reads can each time out in the queue, leaving the save `stalled` although the server may already hold it.
5. **Timed-out requests still run.** Queued requests are sent when the save finishes, after their promises have timed out. That is at most six reads, plus a conditional retry if one had been sent. Their answers are dropped.
6. **Safe, not live.** Every claim and draft stays protected: nothing is said to be saved, nothing is released, and the server's `WHERE revision = R0` still allows only one write of R0. This limits liveness, not data integrity.
7. **B.2B.2's assumption no longer holds universally.** It held that the original's answer always arrives before reconciliation. With B.2C's timeouts, `reconciling` can begin while the original is still pending, and its answer may never be used.

Where a save fails fast (a network error, a thrown action), nothing is left pending and the reads behave as designed. The tests use a transport that does not serialize, so they do not show this queue.

### Approved before A3: a GET Route Handler for recovery reads

The owner approved a dedicated, authenticated GET Route Handler for authoritative recovery reads. It is a **prerequisite to A3** and is **not built in B.2C**: it is built and tested immediately before A3's integration. Its requirements:

- **No queue:** a plain `fetch` GET, never a Server Action, so it bypasses the client's action serialization.
- **Access:** the same owner-scoped authorization as `readOutlineDocument`: `authorize("active")`, the owner from the session, and `outlineIdSchema`. It never returns or reveals another account's document; another account's outline answers `missing`.
- **Logic:** reuses the established canonical reading: `documents.getDocument` (owner in its WHERE clause), then `toPlainJson`, ideally by moving `readOutlineDocument`'s body into one shared function both call. No second reader.
- **Caching:** no response caching anywhere (`Cache-Control: no-store`, a dynamic route, nothing kept by the service worker, which already answers no `/api`).
- **Read only:** never creates, converts, repairs, or writes.
- **Semantics:** the same `DocumentReadOutcome` (`found`, `missing`, `unreadable`, `unauthorized`, `failed`), through the same `readOutcome` mapping or an exact equivalent.
- **Logging:** never logs a document or a database error that may carry one.
- **Interface:** the coordinator's interface is kept. Only the transport's `read` changes, through `DocumentTransport`.
- **Proof:** an integration test with a delayed save proves the read runs independently, completing while the save is still pending.
- **Safeguards:** every revision and reconciliation safeguard is kept: the classification, the conditional retry's limit, claim holding, and the budget.

### For A2.3B.3 and A3

- **Before A3:** build the GET Route Handler above and give `actionTransport`'s `read` (or a new transport) to it.
- **A3:**
  - pass a `Connectivity` built from the browser's `online` and `offline` events (advisory);
  - show `serverSaveStatus` with `recovery` for detail;
  - offer `recover()` on `stalled`;
  - never call `recover()` or `reconcile()` from a state listener.
- **B.3:** `saveNow()` offline marks the save `waiting` and sends nothing. The page lifecycle should treat `offline`, `stalled`, `unresolved`, and `failed` as unsaved work.

### Ready for owner review
