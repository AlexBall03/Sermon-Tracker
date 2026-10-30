# Preacher Studio Migration

The central document for the controlled evolution of Sermon Tracker into **Preacher Studio**. Written in Phase PS-0B (19 October 2026) from a read-only audit of the repository at commit `d005bbf` on `dev`.

[ARCHITECTURE.md](../ARCHITECTURE.md) remains the technical source of truth for what is built. This document says where the application is going, what must be preserved on the way, and what has not been decided. Nothing here describes functionality that exists unless it is marked **Implemented**.

**Status labels** used throughout:

| Label             | Meaning                                                                    |
| ----------------- | -------------------------------------------------------------------------- |
| **Implemented**   | In the code today, verified by reading it in PS-0B                         |
| **Approved**      | Decided by the owner; binding on later phases                              |
| **Proposed**      | A recommended design that a named phase must validate before it is adopted |
| **Deferred**      | Deliberately left to a later phase                                         |
| **Open Decision** | Not decided; the phase named must decide it, with evidence                 |

**Phase numbering.** Preacher Studio phases carry the prefix `PS-` (PS-0B, PS-1A, …) and their handoffs are `docs/HANDOFF-PS-<phase>.md`. Sermon Tracker's own phases (1A to 6A and the unnumbered milestones) keep their numbers and handoffs; `docs/HANDOFF-1A.md` is the historical foundation phase, not the editor prototype. **Approved.**

---

## 1. Product vision and scope

- **Evolve, do not rebuild.** Preacher Studio is the existing application, its data, its accounts, and its stack, developed further. **Approved.**
- **Stack retained:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS v4, Clerk, Neon PostgreSQL with Drizzle, Vercel, Vercel Blob, Resend, IndexedDB, the hand-written service worker, Web Push, Vitest, and Playwright. A change needs a documented reason in this file. **Approved.**
- **Future domain:** `preacherstudio.com`, replacing `sermontracker.com`. **Approved** as the destination; the transition (section 11) is **Deferred** to PS-7. Nothing has been renamed.
- **One sermon, one workspace.** A sermon is one persistent identity that moves through idea capture, research and Scripture study, outline development, full manuscript writing when wanted, preparation and readiness, preaching history, and later revision, without a second record for an outline or a manuscript version. **Approved** as the direction.
- **Infrastructure efficiency is a first-class requirement** of every phase (section 4). **Approved.**

---

## 2. Current architecture summary

**Implemented.** See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full account; the parts this program depends on:

- **Ideas** (`src/features/ideas`): one `ideas` table, kinds `sermon`, `point`, `undecided`; uuid IDs the browser may generate; `revision` (migration `0016`) counts changes to what an idea says; `last_developed_at` set only by real content work (`markDeveloped`).
- **Related ideas** (`src/features/ideas/relations.ts`): `sermon_relations` and `sermon_points`, plain associations, owner in both foreign keys, `ON DELETE CASCADE`. Not tied to outlines.
- **Outlines** (`src/features/outlines`): `sermon_outlines` (one per sermon, `UNIQUE (sermon_id)`, `numbering_config` JSON, shape `revision`), `outline_entries` (introduction, point, conclusion; `parent_id`, `position`, `title` ≤ 200, `notes` ≤ 2000, `source_point_id`, word `revision`), `outline_entry_scripture_references`. Writes take locks in one order (`lockForWrite`) and change shape only through `planInsert`/`planMove`/`planRemove` and `place` (`tree.ts`, `entries.ts`). Numbers are computed (`numbering.ts`), never stored. Limits are `outlineLimits` (500 entries, 10 passages an entry).
- **Scripture references:** five numbers (`book`, `chapterStart`, `verseStart`, `chapterEnd`, `verseEnd`) validated by `src/features/scripture/reference.ts`; no text and no translation stored.
- **Preaching history** (`src/features/preaching`): `preaching_occurrences` references the sermon (`ideas`) only, `ON DELETE RESTRICT`. It knows nothing of outlines.
- **Offline and sync** (`src/features/offline`, `src/features/sync`): one IndexedDB database `sermon-tracker` (two migration steps), a durable mutation queue, one sync engine under a Web Lock per owner, `syncMutation` → `applyMutation` with an idempotency ledger (`sync_operations`).
- **Deployment:** `npm run build` is `next build && node scripts/db/cli.mjs migrate deploy`; the second step migrates only inside the Vercel production deployment (section 9).
- **Support** (`src/features/support`, migration `0017`) and **notifications** (`src/features/notifications`, migration `0019`).

---

## 3. Target architecture

### 3.1 Unified sermon document

**Approved** (PS-1B.1, 19 October 2026): the unified document is adopted, and the coexistence fallback below is not needed. Its canonical structure (schema v2) is **Proposed** in `docs/HANDOFF-PS-1B.1.md` §B and validated in PS-1B.2.

- One sermon (`ideas.id`, kind `sermon`) has one rich-text document that holds both a hierarchical outline and manuscript prose, in any proportion. A person may work in structured outline form, free-form manuscript, or both, in the same workspace.
- The sermon's identity, its related sermons and points, its passages, its classifications, and its preaching history are unchanged by the document's arrival.
- **Fallback, not preferred:** legacy outlines kept permanently beside a separate manuscript document. Chosen only if PS-1A or PS-1B shows the unified model cannot preserve the outline system's guarantees (section 8).

### 3.2 Candidate editor

**Approved** (PS-1B.1): Tiptap on ProseMirror is the canonical editor foundation, on PS-1A's evidence.

- Packages are pinned exactly.
- A paid or Pro extension needs the owner's approval.
- The extensions PS-1B.2 needs (`@tiptap/extension-text-style`, `-highlight`, `-text-align`) were approved by the owner on 19 October 2026. Their version, peer dependencies, and licence are verified when they are installed in PS-1B.2.

### 3.3 Candidate document schema

**Superseded** by schema v2 (`docs/HANDOFF-PS-1B.1.md` §B.2, **Proposed**), which adds:

- free block ordering;
- an optional introduction and conclusion anywhere (at most one each);
- rich point titles;
- block Scripture passages with print presentation;
- preacher notes and page breaks.

The table below is the PS-1A candidate, kept for history (names are working names):

| Node                 | Purpose                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `sermonIntroduction` | At most one, first, never numbered, never contains points (as today's section)                         |
| `outlinePoint`       | A point at any depth: a heading, optional notes, optional passages, and nested `outlinePoint` children |
| `sermonConclusion`   | At most one, last, never numbered, never contains points                                               |
| Manuscript blocks    | Paragraphs, headings, lists, quotations, emphasis: free prose, anywhere the schema allows              |
| `scriptureReference` | An inline or block node carrying the five reference numbers as attributes, validated by `reference.ts` |

Point labels are derived from the nested structure with the existing numbering engine (section 8.3), never stored in the text.

### 3.4 Decisions added in PS-1B.1

**Approved by the owner** (the PS-1B.1 brief and its follow-up; details in `docs/HANDOFF-PS-1B.1.md`):

- **Sections.** The introduction and conclusion are optional semantic sections, not document boundaries. Prose may stand anywhere.
- **Formatting.** Text colors and highlighting are standard capabilities. Default text follows the theme. Inline formatting is kept apart from Outline Layout.
- **Outline Layout** is first-class:
  - per-level markers, including the introduction and conclusion;
  - spacing and presets;
  - no configuration text shown to the person;
  - labels never stored in the text.
- **Scripture** has three separate concerns:
  - canonical content, which is in the document;
  - editor expansion, which is view state, never in the document and never a save;
  - print presentation: per passage `full`, `reference`, or `hidden`, plus temporary document-wide overrides.
- **Full passages.** A full Scripture block in a sermon document is not bound by the 6/12 preview caps and is never truncated. The caps keep governing previews and rows.
- **Translation** may be overridden per document and per passage. Verse text is never stored.
- **Expansion preferences.** The defaults and whether states are remembered are account preferences (Settings → Editor). Remembered states are device-local.
- **Two editable layouts** on one document: Regular (pageless, the default) and Print (paginated). True editable pagination is validated, not approximated.
- **Separation.** Five kinds of state are kept apart: the canonical document, editor view, Workspace Panel, account preferences, and print/export options. A view change never makes a document revision or a server write (handoff §J).
- **Workspace Panel.** One application-wide panel of tabbed tools, owned by the authenticated shell rather than the editor.
  - It is docked on the right, resizable, closable, and a sheet on small screens.
  - Its state is kept across navigation.
  - It is reached through one contextual-opening API.
  - No tab appears before its tool works. A split view of two tools is possible later; IDE-style docking is not built.
  - It replaces an editor-only Bible sidebar (handoff §I). It is built in PS-4.
- **Dictionary.** English and Spanish, with lookup between them, on a dedicated page and as a panel tool sharing one domain. Its lookup language is its own setting. It is built in its own later phase, after PS-4. No source is chosen and no dataset is assumed redistributable (handoff §K.1).
- **AI.** The panel can take an AI tool later through the same registry. Nothing about AI is approved for building (handoff §K.2).

**Approved direction, Proposed technique.** The owner approved the PS-1B.1 architecture and design direction (19 October 2026). These techniques stay Proposed until PS-1B.2 validates them or the phase that builds them decides them (handoff §B.1, "Before PS-2"):

- schema v2;
- the node-ID rules (§6.3);
- `OutlineLayout`, wrapping `NumberingConfig` verbatim;
- color serialization as preset keys or `#rrggbb`;
- snapshot persistence with revision checks;
- the source-point side table;
- the schema-version rules (an older client never saves a newer document).

---

## 4. Infrastructure efficiency

### 4.1 The principle

**Approved** (19 October 2026), in the owner's words:

> Preacher Studio must be designed for efficient operation at every layer. Features should consume only the computing resources reasonably necessary to deliver their intended functionality, reliability, security, and user experience. Performance and infrastructure cost are architectural concerns, not merely post-development optimization tasks.

It applies to every PS phase, not to a later optimization effort. Data integrity, security, and the reliability of offline work come first: no phase may make saving less safe to save a request.

### 4.2 Requirements by layer

**Approved** as requirements. How each is met is decided in the phase that builds it.

**Vercel execution.** Minimize function invocations, CPU time, repeated Server Component rendering, redundant API requests, server-side transformation, proxy work, repeated authenticated lookups, unnecessary dynamic rendering, and scheduled execution. Render statically and cache where it is safe for private data. Prevent duplicate requests from client effects and refresh behavior. Add no caching layer without evidence it is needed.

**Neon compute.** Minimize compute wake-ups, request frequency, redundant and N+1 queries, slow or unindexed queries, connection churn, unnecessary transactions, repeated aggregates, and over-fetching rows or columns. Use indexes, pagination, batching, query plans, connection management, deliberate transaction boundaries, and incremental retrieval. Neon compute is billed while the compute is awake, not only while SQL runs: an application that touches the database every minute keeps it awake even if each query is fast.

**Rich-text editor.**

1. Editing is local and immediate; no server request per keystroke.
2. Unsaved work is protected promptly on the device (durable local draft).
3. Cloud saves are debounced or coalesced.
4. Unchanged content is never written again (change detection).
5. Saves are revision-aware.
6. Sync operations are idempotent.
7. Conflicts are detected and recoverable.
8. Behavior is safe across tabs and devices.
9. Synchronization is incremental or bounded where practical.
10. No background activity when there is nothing to do.

**Local draft durability and cloud synchronization are separate concerns** and are designed separately. Whether cloud saves are whole-document snapshots or incremental patches is an **Open Decision** for PS-1B/PS-3, to be made on measured payload size, save frequency, complexity, and reliability; patches are not assumed to be better.

**PWA and offline.** Static assets cached appropriately; service-worker update checks efficient; no redundant refreshes or polling; bounded IndexedDB storage; efficient sync after reconnecting; exponential backoff; protection against duplicate requests and sync loops. Offline reliability is never reduced to save resources.

**Notifications and background work.** Event-driven over polling. No scheduled database checks without a demonstrated need, no constant refresh of counts, no background work when nothing is queued. Reuse the existing notification system. Workers, cron jobs, queues, Redis, or new services only for a demonstrated requirement.

**Administration and analytics.** Paginated tables, indexed filters, on-demand reports, cached or precomputed aggregates only where justified, bounded date ranges, lazy loading of expensive sections, retention policies. No large aggregates on every dashboard visit.

**Observability.** A practical way to see Vercel invocations, CPU, and duration; Neon compute activity, query patterns, connections, and storage growth; bandwidth; error rates; sync request frequency; editor save frequency. Prefer the built-in Vercel and Neon dashboards before adding a service. Logging must not itself be a cost, and never records sermon content or authentication secrets.

### 4.3 Existing patterns relevant to the migration

From the PS-0B audit. **Verified** means read in the code; **Potential** means suspected and not confirmed. None was measured; none is changed in PS-0B.

| Pattern                                                                                                                                                                                           | Status    | Why it matters                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| The notification bell polled `GET /api/notifications` every 60 s while a tab was visible, and on focus. **Implemented in PS-0C.1:** event-driven refresh with a 15-minute fallback (`refresh.ts`) | Verified  | Each request is an invocation, an access lookup, and two queries; an open tab kept Neon from idling |
| The `(app)` shell runs `requireActiveUser()` and `getPreferences()` on every render (`src/app/(app)/layout.tsx`); `getAccess` is cached per request only                                          | Verified  | Every signed-in page reads the user row; a document workspace must not add per-request lookups      |
| Outline autosave sends one transactional, locking action per pause in typing (about 0.9 s) (`src/features/outlines/editor/store.ts`)                                                              | Verified  | A rich-text editor saving at that rate would multiply writes; section 4.2's editor rules apply      |
| The dashboard reads about seven bounded queries per visit (`ARCHITECTURE.md`, "Dashboard")                                                                                                        | Verified  | Acceptable today; new workspace sections must not add unbounded reads                               |
| `OfflineAgent` refreshes ideas at most every 5 minutes on focus or reconnect (`offline-account.tsx:35`); the worker checks for updates at most every 30 minutes (`pwa.ts:83`)                     | Verified  | Bounded already; document sync should follow the same discipline                                    |
| The daily account-deletion cron (`vercel.json`) does nothing without pending work                                                                                                                 | Verified  | Acceptable; an example of the bar for scheduled work                                                |
| Old tabs whose Server Action IDs no longer exist after a deployment may retry `syncMutation` until marked failed                                                                                  | Potential | Wasted invocations and stuck work; skew behavior on Vercel is unverified (section 7)                |

Replacing the bell's polling was not in scope for PS-0B. PS-0C.1 reduced it (`docs/HANDOFF-PS-0C.1.md`): the bell asks on mount, focus, the tab shown again, reconnecting, opening the panel, after a read, and when the service worker reports a push, with a 15-minute fallback only while it is on screen, visible, and online (about 4 interval requests per visible tab-hour, down from about 60; estimated, not measured). Removing the fallback entirely and the generalized notification architecture remain PS-6.

### 4.4 Performance acceptance criteria

**Approved** as the method; **no numerical targets yet.** Baselines are measured first (in development and, where safe, from production dashboards), then targets are set from them. No phase may invent figures or promise Vercel or Neon costs without measurements.

For each scenario a phase that touches it records: network requests, database queries, database writes, server execution (invocations, duration), payload sizes, client responsiveness, and correctness and recovery.

| Scenario                               | First phase to measure it | Particular attention                                               |
| -------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| Opening the dashboard                  | PS-4                      | Query count; no new unbounded reads                                |
| Opening an existing sermon             | PS-3                      | Document payload size; one read, not N                             |
| Writing continuously for 15–30 minutes | PS-1A (local), PS-3       | Writes per minute; payload per save; no write when nothing changed |
| Switching between sermons              | PS-4                      | No duplicate fetches; local drafts kept                            |
| Browsing a large sermon library        | PS-4                      | Pagination holds; no document bodies loaded for a list             |
| Searching Scripture                    | PS-4                      | Unchanged or better than today                                     |
| Editing while offline                  | PS-3                      | No network attempts in a loop; local durability                    |
| Synchronizing after reconnecting       | PS-3                      | Requests proportional to changes, not documents; backoff           |
| Updating an installed PWA              | PS-6                      | No unsaved work lost; no repeated update checks                    |
| Loading administrative dashboards      | PS-6                      | Paginated; no aggregates over all data on each visit               |
| Viewing support conversations          | PS-6                      | Bounded message loads; no polling while idle                       |

---

## 5. Architectural decisions

| Decision                                                                                                  | Status                       | Reason                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| Evolve the existing application; do not rebuild                                                           | Approved                     | Users, data, offline installs, and a verified architecture already exist                    |
| One sermon identity with one unified document                                                             | Approved (direction)         | Avoids duplicate records; PS-1A/1B confirm feasibility                                      |
| Infrastructure efficiency is an architectural principle                                                   | Approved                     | The owner's experience of excessive Vercel and Neon usage elsewhere                         |
| Preacher Studio phases are prefixed `PS-`; handoffs `HANDOFF-PS-*`                                        | Approved                     | Historical Phase 1A and `HANDOFF-1A.md` already exist                                       |
| The editor prototype is development-only and persists nothing                                             | Approved                     | A feasibility experiment must not reach users or data                                       |
| Stable identity, uniqueness, provenance, and relational integrity of document content                     | Approved                     | Requirements; the techniques are Proposed (section 6)                                       |
| Keep `sermon-tracker*` IndexedDB, BroadcastChannel, and Web Lock names                                    | Approved                     | Renaming orphans data on devices and splits coordination between tabs of different versions |
| Never remove or narrow a legacy `idea.*` or `outline.*` sync handler while old clients may hold such work | Approved                     | A removed handler leaves queued work permanently failed on old devices                      |
| A new kind of change is a new sync type with a strict schema                                              | Approved                     | Non-strict schemas silently drop unknown fields (section 7)                                 |
| Schema changes are additive first (expand, then contract)                                                 | Implemented, Approved for PS | `docs/DATABASE.md`, "Ordering with deployments"                                             |
| No production migration because of the prototype                                                          | Approved                     | PS-1A has no schema                                                                         |
| The existing numbering engine is preserved or reused                                                      | Approved                     | Ordinary rich-text lists cannot express it (section 8.3)                                    |

---

## 6. Document model: requirements, proposals, and open decisions

### 6.1 Requirements (Approved)

- Every structural node that other data or the editor must find again (a point, the introduction, the conclusion, a Scripture node) has a **stable ID** that survives saves, moves, and reloads.
- Node IDs are **unique within a document**. Whether they must also be unique across documents is an Open Decision (6.4).
- **Provenance** is kept: a node converted from a legacy outline entry can be traced to that entry, and a node made from a saved point can be traced to that point.
- **Relational integrity** is kept: an identity that today is a foreign key (the source point) is not moved into JSON without an equivalent guarantee of integrity and deletion behavior.
- Sermon IDs, related sermons, point ideas, passages, and preaching occurrences are preserved unchanged.

### 6.2 Three identities kept apart

These are related but not interchangeable.

| Identity                | What it is                                                    | Today                                                         |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| Legacy outline entry ID | The uuid of an `outline_entries` row                          | **Implemented**; made in the browser                          |
| Document node ID        | The identity of a node inside a sermon document               | Does not exist                                                |
| Source-point ID         | The `ideas.id` of a reusable point an entry or node came from | **Implemented** as `source_point_id`, FK `ON DELETE SET NULL` |

### 6.3 Proposed identity behavior (pending PS-1A and PS-2)

**Proposed.** Each rule is a design for PS-1A to try in the editor and PS-2 to settle for storage; none is final.

- **Conversion:** a node converted from an entry takes the entry's ID as its node ID, and records it as provenance (for example a `legacyEntryId` attribute), so identity and provenance survive even if a later rule must re-key the node.
- **Paste and duplicate:** a pasted or duplicated node whose ID already exists in the document is given a new ID by a step that enforces uniqueness on every transaction. Provenance and `sourcePointId` are copied; whether a duplicate should keep `legacyEntryId` is Open.
- **Split:** the first part keeps the ID; the second part gets a new one.
- **Merge:** the surviving (first) node keeps its ID; the absorbed node's ID is retired.
- **Move, indent, outdent:** the ID is kept, with everything under it.
- **Reusing a saved point:** creates a new node with a new ID and `sourcePointId` naming the point; the point is never written to.
- **Copy between sermons:** an Open Decision (keep IDs when unique there, or always re-key).

**Tried in PS-1A** (`docs/HANDOFF-PS-1A.md` §8; still **Proposed**, nothing here is decided):

- Every rule above held in the lab's tests: conversion, paste and duplicate (including a pasted subtree and HTML carrying IDs), split, merge, move, undo, and reusing a saved point twice.
- The prototype's choice for the Open question is to clear `legacyEntryId` on a copy and record `derivedFrom`. The handoff sets out the trade-off for PS-1B.
- `sourcePointId` was carried as a node attribute only. That is not a replacement for the foreign key, so the integrity mechanism stays a PS-2 decision.

**Recommended in PS-1B.1** (`docs/HANDOFF-PS-1B.1.md` §B.6; **Proposed**):

- **Scope.** Node IDs are random UUIDs. They are unique within a document by enforcement and across documents by generation. Nothing relies on cross-document uniqueness.
- **Copy.** A copy clears `legacyEntryId` and records `derivedFrom` (PS-1A's choice, adopted).
- **Paste from another document.** It always re-keys, keeps `sourcePointId`, and drops legacy provenance and `derivedFrom`.
- **Split and merge.** A split's second part has no `sourcePointId`. A merge keeps the survivor's.
- **Source-point integrity.** A side table (`document_point_sources`) is written from the snapshot in the save's transaction and is authoritative over the JSON attribute (§B.6, §E.3).

### 6.4 Open decisions

| Question                                                                                                                                                                                 | Decided in  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Unified document adopted, or the coexistence fallback. **Decided in PS-1B.1: unified (Approved)**                                                                                        | PS-1B       |
| Editor library (Tiptap/ProseMirror or other). **Decided in PS-1B.1: Tiptap/ProseMirror (Approved)**                                                                                      | PS-1B       |
| Canonical stored form. **Recommended in PS-1B.1: validated ProseMirror JSON plus derived relational side tables (Proposed)**                                                             | PS-1B       |
| How source-point integrity is kept: **Proposed** side table (node ID → point ID, owner, FK with `SET NULL` semantics) beside the document, or another mechanism with the same guarantees | PS-2        |
| Node-ID scope. **Recommended in PS-1B.1: random UUIDs, enforced unique per document (Proposed)**                                                                                         | PS-1B       |
| Snapshot saves versus incremental patches. **Recommended in PS-1B.1: snapshots with revision checks (Proposed); cadence measured in PS-3b**                                              | PS-1B, PS-3 |
| Editable pagination: built in PS-4/PS-5, or a dedicated PS-5a Print Layout milestone                                                                                                     | PS-1B.2     |
| A bounded chapter-range endpoint for long Scripture passages, if per-chapter requests prove too costly                                                                                   | PS-4        |
| Where the editor preferences live (account columns or a validated preference object)                                                                                                     | PS-2        |
| Revision granularity: one document revision, or shape and words apart as outlines do today                                                                                               | PS-2, PS-3  |
| Character limits for headings, notes, and prose (today 200 and 2000 per entry; 500 entries)                                                                                              | PS-2        |
| What counts as development (`markDeveloped`) for document edits                                                                                                                          | PS-2        |
| Whether `ideas.notes` and the document relate, and how the idea editor shows a sermon with a document                                                                                    | PS-4        |
| Whether a passage on a node also appears among the sermon's passages                                                                                                                     | PS-4        |
| Printing and export formats                                                                                                                                                              | PS-5        |

---

## 7. Offline synchronization strategy

### 7.1 What exists (Implemented)

- Queued record (`src/features/offline/model.ts`): `opId`, `owner`, `type`, `entityType` (`idea` or `outline`), `entityId`, `payload`, `schemaVersion` (1 for every type, `mutationSchemaVersions`), `baseRevision`, status, attempts, conflict.
- Types: `idea.create|update|archive|restore|delete` (`src/features/sync/model.ts`), `outline.entry.add|update|references|move|remove`, `outline.numbering` (`src/features/sync/outlines.ts:62`). Every outline change's `entityId` is the outline's ID, so `sendable` sends one outline's changes in order.
- Engine (`src/features/offline/sync/engine.ts`): Web Lock `sermon-tracker-sync:<owner>`, 30 s timeout, backoff 2 s to 10 min, `maxAutoAttempts` 6.
- Server: `syncMutation` (`src/features/sync/actions.ts`) parses the envelope with `z.enum(syncTypes)`; `applyMutation` (`apply.ts`) writes the change and its `sync_operations` row in one transaction, so a repeat is `duplicate`.
- Cross-tab: BroadcastChannels `sermon-tracker-queue|ideas|outlines`; Web Locks for sync and the two refreshes; `hasUnsavedWork()` per tab (`src/lib/unsaved-work.ts`).

### 7.2 High-priority risks

All **High**. Each is verified in code; none is a fault in today's single-version operation, but each becomes one once versions of the client and server differ, which a document model guarantees.

| Risk                                                                                                          | Evidence                                                                                                    |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Envelopes carry `schemaVersion`, but the server only checks it is a positive integer and never branches on it | `src/features/sync/model.ts:38`                                                                             |
| Unknown fields in an outline payload are silently stripped, and the change can still be answered `applied`    | Non-strict `z.object` schemas, `src/features/sync/outlines.ts:94–124`; `outline.numbering` is `z.unknown()` |
| No client/server version negotiation; the only version check is service worker against page (`GET_VERSION`)   | `src/features/pwa/pwa.ts`                                                                                   |
| An unknown conflict reason offers the person only "discard"                                                   | `outlineChoicesFor`, `src/features/offline/outlines/sync.ts`                                                |
| An unknown outcome status is retried and then marked failed                                                   | `src/features/offline/sync/engine.ts:167`                                                                   |
| Old tabs keep running old code: an update reloads only the tab that asked                                     | `applyUpdate`, `src/features/pwa/pwa.ts`                                                                    |
| Old installed PWAs may hold queued operations indefinitely                                                    | The queue never drops work without the person or an acknowledgement (by design)                             |
| Downloads are cast, not validated, on the device                                                              | `ask<T>` in the offline `refresh.ts` files                                                                  |
| `onApplied` routes any `entityType` other than `outline` to the ideas handler                                 | `src/features/offline/sync/agent.tsx:123`                                                                   |
| Persistence and coordination names carry the historical name                                                  | IndexedDB `sermon-tracker` (`db.ts:29`), the channels and locks above; intentionally kept (section 5)       |
| Whether a Server Action ID from an old deployment still resolves after a new one                              | Potential; Vercel skew protection not verified                                                              |

### 7.3 Prerequisites before persistent document synchronization

**Approved.** PS-3 does not ship document sync until all are met, in this order where they depend on each other (PS-3a before PS-3b):

1. Explicit protocol compatibility rules, written in `ARCHITECTURE.md`.
2. Strict validation (`.strict()` or equivalent) for every new mutation type.
3. Safe rejection of incompatible operations: never acknowledged as `applied` when anything was dropped.
4. Recoverable pending work preserved: an old client's queued work is never answered in a way that leads it to discard.
5. Legacy `idea.*` and `outline.*` operations keep working against the server for as long as old clients may hold them.
6. Explicit, document-specific conflict handling, with choices that never default to discarding.
7. Client/server version negotiation where justified (for example an additive `clientVersion` on the envelope and an answer an old client already treats as "keep and retry").
8. Tests across old and new client versions (old payloads against the new server; new answers against old clients).
9. Cross-tab behavior validated with tabs of different versions.
10. A safe path for old PWA installations to synchronize before any domain migration (section 11).

Further rules (**Proposed** for PS-3): new types such as `document.*` with their own `schemaVersion`; the server switches on `schemaVersion` before any existing payload changes; a new `entityType` gets its own branch in `onApplied`; IndexedDB changes only as a third or later step of `migrations` in `db.ts`; download responses validated before they are stored; new download endpoints rather than changed shapes of existing ones.

No synchronization change is made in PS-0B. PS-1B.1 adds the compatibility invariants the document must meet (`docs/HANDOFF-PS-1B.1.md` §E.7); they do not replace this list.

---

## 8. Legacy outline conversion invariants

**Approved** as invariants for any conversion (PS-2 design, PS-7 production run). The technique is **Proposed**.

### 8.1 Structure

- **Order:** the document's order is exactly `orderEntries` (`src/features/outlines/tree.ts`): the introduction, each point depth-first by `position` then `id`, the conclusion. The converter calls `orderEntries`; it does not reimplement it.
- **Edge case:** the database does not prevent a point whose parent is a section; `orderEntries` shows such a point (or an orphan) as a main point at the end, and the conversion reproduces what the person sees today.
- **Introduction and conclusion:** at most one each, pinned first and last, never numbered, holding no points. The database enforces one of each at the root (`section_key`, `section_root_check`); the service alone enforces that they hold no children, so verification checks it.
- **Content:** heading, notes, and passages (in their order) carried exactly. Passages revalidated with `reference.ts`.
- **Identity and provenance:** section 6.

### 8.2 Process

- **Idempotent:** keyed by the outline's ID and the outline and entry revisions it was made from; running it again changes nothing, and a changed outline is converted again rather than merged by guesswork.
- **Non-destructive:** legacy rows are never deleted in the release that converts them. Retirement is a separate, later contract step after verification and after old clients have drained (section 7.3).
- **Verified:** counts of entries, points, sections, and passages; labels under each numbering configuration identical before and after; source-point links identical; round trip back to entries identical under `orderEntries`.

### 8.3 Numbering

- `numbering_config` is carried verbatim. Built-in styles are stored by name; custom ones are validated by `numberingConfigSchema` (`src/features/outlines/numbering.ts`).
- Labels are derived from the document's nested structure with `entryLabel`/`numberOutline`. Ordinary rich-text ordered lists are not relied on to reproduce custom levels, prefixes, suffixes, joining, or overflow. **Approved.** (The provisional schema v4, section 15.10, derives the same labels from order and depth instead of nesting; whether this wording is amended is an Open Decision.)
- A stored configuration that cannot be parsed reads today as the default, silently. Verification lists such rows before conversion.

### 8.4 Relationships that must not change

- `sermon_points` and `sermon_relations`: untouched by conversion (they have no tie to outlines).
- Source-point attribution: preserved with relational integrity (section 6.4).
- Preaching history: references the sermon only; untouched.
- Routes: `/outlines`, `/outlines/<id>`, `/outlines/new?sermon=<id>`, the reader's `outline` way back, and `/api/offline/outlines` keep working while `sermon_outlines.id` exists or is redirected to the sermon's document.

### 8.5 Questions to answer with production evidence (read-only, in PS-2 or PS-7)

- How many points have a section or a missing entry as their parent; how many positions are duplicated or gapped.
- How many `numbering_config` values fail to parse.
- How many `source_point_id` values name an idea no longer filed as a point.
- How many outlines approach `outlineLimits.entries`.
- The production PostgreSQL major version (the `0013` clause needs 15 or later).

---

## 9. Data migration and recovery

### 9.1 How production is migrated today (Implemented)

- `npm run build` runs `next build`, then `node scripts/db/cli.mjs migrate deploy`. The second step acts only when `VERCEL_ENV=production` (`scripts/db/cli.mjs`); anywhere else it prints that migrations were skipped. In production it checks the declaration and the stamp, applies pending migrations without a prompt (pushing to `master` is the confirmation), and loads Bible text whose checksum differs.
- If it fails, the build fails and the previous deployment keeps serving. While a build runs, and after a rollback, the previous code serves against the new schema: every migration must work with the code already live.
- Recovery documented today: fix forward with a new migration, or Neon point-in-time restore (`docs/DATABASE.md`, "Production migrations").

### 9.2 Gaps found

| Gap                                                                                                | Status   |
| -------------------------------------------------------------------------------------------------- | -------- |
| No lock against two production builds migrating at once (acknowledged in `docs/DATABASE.md`)       | Verified |
| No automatic backup or Neon branch before migrating                                                | Verified |
| Pending migrations are found by journal timestamp; an out-of-order entry would be skipped silently | Verified |
| Previews share the development database and never migrate it                                       | Verified |
| `docs/DATABASE.md` has no sections for migrations `0015`–`0019`                                    | Verified |
| No automatic check that a new user-owned table is cleared by account deletion (section 10)         | Verified |

### 9.3 Required procedure for PS schema and data changes

**Approved.** Each step is its own checkpoint, verified before the next:

1. **Additive schema** (expand): new tables or nullable/defaulted columns, safe under the code already live. Migrations come through `npm run db:generate` and are reviewed and committed.
2. **Backfill** (legacy content to documents): an idempotent script run deliberately, not hidden inside `migrate deploy`, resumable, bounded in batches, and owner-scoped.
3. **Verification:** the checks in section 8.2 and 8.5, recorded in the phase's handoff.
4. **Read-path switch:** controlled (per account or by a setting), reversible while legacy data is intact.
5. **Synchronization compatibility:** section 7.3 met before any client writes documents offline.
6. **Recovery:** the forward fix and the point-in-time restore path written down and rehearsed before step 2 in production.
7. **Contract:** retiring legacy structures only in a later release, after verification and after old clients have drained.

**Production gates (Approved):** a verified Neon branch or backup made immediately before any production schema or data change; one release with migrations building at a time; the migration reviewed against the deployment ordering; the owner's explicit go. No production migration happens because of PS-1A.

**Rollback versus forward recovery:** a deployment can be rolled back on Vercel, but its schema cannot; that is why every migration must be backward compatible. Data damage is recovered with point-in-time restore to a branch, compared, then promoted or copied back deliberately. **Proposed:** add a migration lock and a check for out-of-order journal entries to `scripts/db/cli.mjs` in PS-2, and document `0015`–`0019` in `docs/DATABASE.md` before PS-2's first migration.

---

## 10. Authentication and authorization requirements

**Implemented** today and **Approved** for every new document table and revision table:

- An `owner_id` referencing `users.id` (`ON DELETE RESTRICT`, as `ideas` does), and child rows tied to their parent with composite `(id, owner_id)` foreign keys so a cross-account row cannot exist.
- The owner in the WHERE clause of every statement; a missing record and another account's are indistinguishable.
- Pages call `requireActiveUser()`; actions and route handlers call `authorize("active" | "admin")` (`src/features/auth/access.ts`). The proxy is routing only.
- Deletion: the table is cleared in `processDeletion` (`src/features/account/deletion.ts`), in foreign-key order and before the `users` row, with a seed added to `deletion.test.ts`. A table that is missed makes deletion fail and retry forever on the `RESTRICT` key; **Proposed** for PS-2: a test that compares the tables referencing `users` with those deletion clears.
- The last-active-administrator protection (`lockAdministration`, `pg_advisory_xact_lock(712001)`, in `updateUser` in `src/features/admin/users.ts` and `requestDeletion`) is not changed by any PS phase.
- Document content is never logged.

---

## 11. PWA and domain transition

**Deferred** to PS-7. Nothing is renamed before then. Recorded now so that earlier phases do not make it harder.

### 11.1 What is tied to the current origin (Verified)

| Thing                                  | Where                                                                                                                   | On a change of domain                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| IndexedDB queue and offline copies     | `sermon-tracker` database, per origin                                                                                   | Stay on the old origin; the new origin starts empty                                  |
| localStorage preferences               | `st-locale`, `st-launched`, library view, folding, install notice                                                       | Reset on the new origin                                                              |
| Service worker and cache               | `/sw.js`, `st-<version>`                                                                                                | Old worker keeps controlling the old origin                                          |
| Installed applications                 | Manifest `id` and `start_url` `/dashboard`, `scope` `/`                                                                 | Cannot move; people reinstall                                                        |
| Push subscriptions                     | `push_subscriptions` (no origin column); the old worker shows them                                                      | Keep arriving through the old worker; devices must subscribe again on the new origin |
| Clerk sessions and production instance | Production instance on `sermontracker.com` (`docs/ENVIRONMENTS.md`)                                                     | Everyone is signed out; OAuth redirects and any passkeys need attention              |
| Canonical URL                          | `siteConfig.url`, a constant in `src/lib/site.ts`                                                                       | Feeds `metadataBase`, robots, sitemap, mail links and images, production origins     |
| Mail senders                           | `CONTACT_EMAIL_FROM` and the others (environment)                                                                       | Need a verified sending domain                                                       |
| Brand words                            | About 187 occurrences of "Sermon Tracker", mostly the en/es dictionaries; the push default title in `service-worker.ts` | Rebrand in one phase                                                                 |

### 11.2 Proposed transition

**Proposed** for PS-7, split so that the risky step comes last:

- **PS-7a, coexistence and drain:** the new domain serves the same application. The old origin keeps serving the application, not a blanket redirect, so its devices can still send their queues. A notice on the old origin says where to go once nothing is queued on that device (`hasUnsavedWork()` and the queue both empty), then signs the person in on the new origin. Push asks to be turned on again on the new origin. The old worker stays installed and functional.
- **PS-7b, redirect:** only after a published notice period, navigation on the old origin is redirected permanently, except what a device needs to finish draining (an agreed, documented set of paths). Old push subscriptions are left to expire through 404/410 as `sendPush` already handles.
- **Throughout:** keep the `sermon-tracker*` storage, lock, and channel names; keep `/support/<id>` and `/admin/feedback/<id>` working on both origins for the life of old mail links; change `siteConfig.url` and `metadataBase` in one release with the redirect plan.
- **User communication:** advance notice in the app and by mail; the notice says to open the application while online before the date so queued work reaches the account.

**Open Decisions for PS-7:** Clerk's handling of the domain change (a new primary domain or a migration of the instance); whether old-origin installs can be prompted to reinstall; the drain period's length; the exact paths kept on the old origin.

---

## 12. Help Center and administration direction

**Implemented** (Phase 6A and the Condensed Public Release): `support_tickets` (kinds contact, bug, feature, feedback; source public or app; statuses by kind through `statusesFor`), `support_messages` (public replies and internal notes), `support_status_events`, `support_attachments` (private Vercel Blob, served only through `/api/support/attachments/<id>`), read only through `src/features/support/tickets.ts`. Routes `/contact`, `/support`, `/support/new`, `/support/<id>`, `/admin/feedback`, `/admin/feedback/<id>`. Notifications with `UNIQUE (recipient_id, event_key)`. Mail through Resend with idempotency keys.

**Preserve (Approved):** ticket uuids; the `/support/<id>` and `/admin/feedback/<id>` addresses that notifications and mail link to; the `#XXXXXX` reference in mail subjects (`ticketReference`, the uuid's first six characters); notification `event_key` formats; the kind and status lists and their CHECKs; the public/app source rule; internal notes never shown to requesters; read markers; private Blob pathnames; rate limits; the account's email and push preferences.

**Direction (Proposed for PS-6):**

| Capability                       | Reuse                                      | New                                                                                                    |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Unified Help Center              | `/support`, the ticket model               | One entry point combining help articles and reporting                                                  |
| Searchable knowledge base        | i18n dictionaries for chrome               | Article storage, search, en/es content; Open Decision whether in the database or in the repository     |
| Contextual issue reporting       | `page_url`, `area` on tickets, screenshots | A report action from any page that fills context                                                       |
| Administrative support inbox     | `/admin/feedback`                          | Saved views                                                                                            |
| Assignment and triage            | Statuses, internal notes                   | An assignee column (additive) and filters; none exists                                                 |
| Knowledge-base management        | Admin shell                                | Editing and publishing articles                                                                        |
| Release notes                    | Notifications, `UpdateNotice`              | A release-note record and its display                                                                  |
| Platform notification management | `notify`, `dispatch.ts`, Web Push          | Administrator-sent announcements; remove the remaining fallback poll (section 4.3, reduced in PS-0C.1) |

---

## 13. Phased roadmap

**Approved** structure; the content of each phase may change with evidence. The core sermon experience comes first, but infrastructure safety comes before any feature that depends on it. Each phase owns its verification.

| Phase                           | Name                                                                                                                    | Status       | Depends on                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| **PS-0B**                       | Architecture Reconciliation & Migration Readiness                                                                       | Complete     | —                                                          |
| **PS-0C.1**                     | Notification Efficiency Optimization (section 4.3)                                                                      | Complete     | PS-0B                                                      |
| **PS-1A**                       | Rich-Text Editor Feasibility Prototype (section 15)                                                                     | Complete     | PS-0B; package approval                                    |
| **PS-1B.1**                     | Product Experience & Flexible Document Architecture (documentation)                                                     | Complete     | PS-1A                                                      |
| **PS-1B.2A**                    | Canonical Document Architecture Validation (section 15.9)                                                               | Complete     | PS-1B.1 (approved and closed); owner's go                  |
| **PS-1B.2B**                    | The rest of the lab validation of PS-1B.1 (section 15.9); PS-1B.2B.1 (pagination) complete                              | In progress  | PS-1B.2A; owner's go to start                              |
| **PS-2**                        | Document Data Model, Additive Schema & Legacy Conversion Foundation                                                     | Planned      | PS-1B.2 (its completion criteria, handoff PS-1B.1 §H)      |
| **PS-3a**                       | Synchronization protocol compatibility (section 7.3, items 1–9)                                                         | Planned      | PS-1B.1                                                    |
| **PS-3b**                       | Document Persistence, Revisioning & Offline Synchronization                                                             | Planned      | PS-2, PS-3a                                                |
| **PS-4**                        | Unified Sermon Workspace, Research, Scripture Integration & Lifecycle, including the Workspace Panel and its Bible tool | Planned      | PS-3b                                                      |
| **PS-5**                        | Advanced Editing, Templates, Printing, PDF/Word Export & Related Features                                               | Planned      | PS-4                                                       |
| **Dictionary** (to be numbered) | English/Spanish Dictionary page and Workspace Panel tool (handoff PS-1B.1 §K.1)                                         | Planned      | PS-4 (the panel)                                           |
| **AI** (to be numbered)         | A Workspace Panel AI tool, only once its scope is approved (handoff PS-1B.1 §K.2)                                       | Not approved | Owner approval; PS-4                                       |
| **PS-6**                        | Help Center, Administration, Notifications, PWA Updates & Platform Improvements                                         | Planned      | Independent of PS-2–5 where it touches nothing they change |
| **PS-7a**                       | Production Migration: conversion of legacy outlines in production                                                       | Planned      | PS-2, PS-3b, section 9.3                                   |
| **PS-7b**                       | Final Branding & Domain coexistence and drain (section 11)                                                              | Planned      | PS-3a (item 10)                                            |
| **PS-7c**                       | Domain redirect and retirement of legacy structures (contract)                                                          | Planned      | PS-7a, PS-7b                                               |

Phases may be subdivided where dependencies or rollout risk justify it. This list is not an instruction to build them now.

**Integration program (20 October 2026).** The owner moved from lab-only validation to integrating the editor for the product, in checkpoints A1, A2, and so on. A1 (unified editor workspace, §15.10; [handoff](HANDOFF-PS-A1.md)) is integrated but not yet accepted: its UI/UX checkpoints (A1-UI.1, .2A–.2D, .3, .4; §15.10) come first. A2 then adds persistence around it. The PS-2/PS-3b/PS-4 rows above still govern the data model, synchronization, and the workspace shell those checkpoints reach.

---

## 14. Acceptance gates

| Gate                      | Before                                    | Must hold                                                                                                                              |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Prototype isolation       | PS-1A is reported done                    | The lab returns 404 outside development (tested); no import of `@/db`, actions, `features/offline`, or `features/sync`; no schema      |
| Editor decision           | PS-2 starts                               | PS-1B records adopt/revise/reject against PS-1A's criteria, with evidence (done in PS-1B.1), and PS-1B.2 meets `HANDOFF-PS-1B.1.md` §H |
| Schema                    | Any PS migration                          | Additive; reviewed against live code; deletion and owner rules (section 10); `0015`–`0019` documented                                  |
| Sync compatibility        | Any document change queued offline        | Section 7.3 complete and tested across versions                                                                                        |
| Efficiency                | Each phase that touches a scenario in 4.4 | Baseline measured; measurements recorded in the handoff; no regression without a written reason                                        |
| Production data migration | PS-7a in production                       | Section 9.3 checkpoints; fresh verified Neon branch or backup; recovery rehearsed; owner's go                                          |
| Domain transition         | PS-7b redirect                            | Drain path proven on a real installed device with queued work; communication sent; Clerk and mail verified                             |

---

## 15. Phase PS-1A specification: Rich-Text Editor Feasibility Prototype

**Approved** scope; techniques marked otherwise are Proposed.

### 15.1 Purpose

Enough evidence to adopt, revise, or reject the unified document direction and the candidate editor (Tiptap/ProseMirror) in PS-1B. It is an experiment: nothing it builds is reachable by users or touches their data.

### 15.2 Route and isolation

- **Route:** `src/app/(app)/lab/editor/page.tsx`, inside the authenticated shell, so the experiment runs with the application's real layout, tokens, providers, and access check.
- **Access:** the page calls `notFound()` outside development first, then `requireActiveUser()`.
- **Development-only, enforced on the server, in two guards:**
  - **Proxy guard** (`src/proxy.ts`): a request whose path is exactly `/lab` or begins with `/lab/` is answered 404 unless `process.env.NODE_ENV === "development"`, before Clerk or any database work. It is needed because the `(app)` layout's own `requireActiveUser()` would otherwise send a guest on a preview or production deployment to sign-in, revealing the route instead of returning a genuine 404. Matching is restricted to that one prefix; nothing else in the proxy changes.
  - **Page guard:** `notFound()` before anything else in the page, as defense in depth.
  - Preview and production deployments are production builds (`NODE_ENV=production`), so both answer 404 there. PS-1A verifies the behavior: unit tests of both guards, and a check against a local production build served without a database (`next start`), never with `npm run build`, which includes the migration step.
- Not in `routes`, `appRoutes`, `app-links.ts`, the sitemap, or the tour; `robots: noindex` (inherited from the `(app)` layout).
- **Trade-offs of the `(app)` placement, accepted:** it needs Clerk keys and the development database (`npm run dev`, not `npm run dev:next`); the shell reads the signed-in user and preferences on render (reads only; `provisionUser` writes only for an identity it has never seen); the shell's existing agents (offline refresh, notification bell, sync engine) run as on any page. The lab itself adds no read, write, or queue use.

### 15.3 Code boundaries

- Code in `src/features/editor-lab/`: client components, fixture documents, pure converters.
- **Must not import:** `@/db`, any server action, `src/features/offline`, `src/features/sync`, `src/features/outlines/editor/store.ts`, or anything that reads an account's data.
- **May import (read-only reuse):** `src/features/outlines/tree.ts`, `src/features/outlines/numbering.ts`, `src/features/outlines/model.ts`, `src/features/scripture/reference.ts`.
- Does not modify the legacy outline editor, its store, `tree.ts`, `numbering.ts`, or any outline table.
- Fixture documents only: temporary, in code or memory; never read from or written to a database or IndexedDB queue. Local draft durability may be prototyped in browser storage under a key distinct from every existing one, holding fixture content only.
- Interface words in a new `editorLab` dictionary in both languages (the i18n rule holds); fixture sermon text is test data, not interface.
- Design tokens only, as everywhere.

### 15.4 Prerequisites

- **Owner approval to install** the candidate packages at exact versions (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, and only the extensions the tests need), checked for React 19.3 and Next 16.4 compatibility. The owner commits the lockfile.
- A development Clerk account and development database, as for any signed-in page.
- Approval of a separate, narrow Playwright configuration (15.6).

### 15.5 What the prototype must test

1. **Manuscript:** paragraphs, headings, emphasis, lists, quotations; formatting commands; undo and redo.
2. **Hierarchical outline:** introduction, nested points to depth, conclusion; introduction and conclusion pinned and unnumbered; indent and outdent from the keyboard without taking Tab; moving a point with its children.
3. **Mixed document:** prose and outline in one document.
4. **Scripture:** a reference node with five-number attributes validated by `reference.ts`, surviving edit, copy, paste, and round trip.
5. **Numbering:** labels drawn from the node path with `entryLabel`, for a built-in style and a custom configuration, updating on move.
6. **Identity:** the section 6.3 proposals, including duplicate-ID prevention on paste and duplicate, split, and merge.
7. **Round trip:** a legacy outline fixture converted to document JSON and back is identical under `orderEntries` (IDs, order, parents, headings, notes, passages, `sourcePointId`); `getJSON` → `setContent` → `getJSON` is stable.
8. **Copy and paste:** within a document, from outside (plain and rich text), and of nested points.
9. **Usability:** desktop and phone widths; keyboard access; the virtual keyboard and touch selection on a real phone.
10. **Efficiency (local):** that typing causes no network requests; how often a coalesced save would fire over 15–30 minutes of writing; document JSON size for a long manuscript; the lab chunk's bundle size and that it is absent from other pages.

### 15.6 Testing

- **Vitest:** the converters, the round trip, numbering, identity rules, and both 404 guards.
- **Playwright, development server:** **Proposed** a separate `playwright.lab.config.ts` that starts `npm run dev` (or reuses one) and runs only `tests/e2e/lab/*.spec.ts`, signed in through the existing `@clerk/testing` helper, at a desktop and a phone viewport. The existing `playwright.config.ts` and its production-build behavior are not changed. Coverage: editing, formatting, keyboard, indentation, undo/redo, serialization and restore, Scripture nodes, copy and paste, duplicate-ID prevention. Production-route exclusion is tested by the unit tests and the local production check in 15.2.
- **Manual, on a real device:** touch editing, the virtual keyboard, selection handles, and behavior inside the installed application.
- Built in PS-1A, not before.

### 15.7 Deliverable

`docs/HANDOFF-PS-1A.md`: what was built, what was run and what it showed, what was not run, the measurements in 15.5 item 10, and a recommendation (adopt, revise, or reject) against these criteria: every test in 15.5 passes or its failure is explained; the outline guarantees of section 8 can be kept; identity rules hold under paste, split, and merge; numbering needs no ordinary-list workaround; usable on a phone; acceptable bundle cost.

### 15.8 As built (19 October 2026)

**Implemented** as a development-only prototype. Details, measurements, and exact results are in `docs/HANDOFF-PS-1A.md`. Nothing in this subsection approves the prototype's schema or identity rules; they remain **Proposed** for PS-1B.

- **Packages.** `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, and `@tiptap/starter-kit` are pinned at 3.31.4. All are MIT, with one copy of each ProseMirror package.
- **Guards.**
  - The proxy guard (`labGuard`) and the page guard are both built and unit-tested.
  - The **production gate was run against a real local production build** (`npx next build` + `next start`). Every `/lab` address answered HTTP 404, both to a guest and to a signed-in active account.
  - That build loaded the development `.env.local` (there is no production environment file here). The 404 is answered before Clerk or any database work.
- **Deviations from 15.6, for the reasons given:**
  - The lab specs live in `tests/lab/`, not `tests/e2e/lab/`. The main configuration's `testDir: ./tests/e2e` is recursive and would have swept them into the production suite.
  - There are two configurations: `playwright.lab.config.ts` (development) and `playwright.lab-prod.config.ts` (the production gate).
  - The development configuration accepts `LAB_BASE_URL` to reuse a development server already running for the folder, because Next allows only one per folder.
- **Results against 15.5.**
  - Items 1–8 and 10 pass, with copy and paste tested through ProseMirror's own clipboard handlers using synthetic clipboard events.
  - Item 9 passes at desktop size and in phone emulation. **The real-phone check is outstanding (owner).**
- **Recommendation:** adopt Tiptap/ProseMirror, and revise the candidate schema in PS-1B. The conditions and the structural restrictions to decide are in the handoff.

### 15.9 PS-1B.2: the lab widened (Approved scope, after PS-1B.1)

PS-1B.2 validates the PS-1B.1 architecture in the same lab, under the same isolation (sections 15.2 and 15.3):

- development only;
- fixtures only;
- no database, action, sync, or offline import;
- the legacy outline editor untouched.

Two boundaries widen:

- **Read-only reuse.** The lab may also import client Scripture code and `src/features/outlines/editor/moves.ts`. The Scripture code is `loadChapter` in `src/features/scripture/use-chapter.ts`, `ScriptureBrowser` through `ScriptureHost`, and the passage building blocks. Loading chapter text is a read through the existing `/api/bible` route.
- **Browser storage.** The lab may keep device-local view state (Scripture expansion memory, the layout per tab, panel width) under lab-only keys.

PS-1B.2 does not build the Workspace Panel and does not change the shell: an editor beside a docked panel is tested with a lab-local stand-in only. Its scope, order, and completion criteria are `docs/HANDOFF-PS-1B.1.md` §G and §H. The three Tiptap extensions it needs are approved; their version, peer dependencies, and licence are verified at install. A subdivision of PS-1B.2 needs the owner's authorization.

**Subdivided by the owner (19 October 2026):**

- **PS-1B.2A, Canonical Document Architecture Validation: complete** ([handoff](HANDOFF-PS-1B.2A.md)).
  - Schema v2 and its validator, with a pure v1 → v2 migration.
  - Legacy conversion and a projection that reports its losses.
  - The §B.6 identity rules, cross-document paste included.
  - Rich titles and the §B.5 structural commands.
  - The three extensions installed at 3.31.4 (MIT). §H items 1, 2, 5, 11, and the isolation half of 10 are met.
  - The techniques stay Proposed; their open points are the handoff's §13.
- **PS-1B.2B: in progress, in parts.**
  - **PS-1B.2B.1, Editable Pagination Feasibility: complete** ([handoff](HANDOFF-PS-1B.2B.1.md)). §G item 2: every criterion P1–P11 has a recorded result, and the verdict is that Print Layout is built with PS-4/PS-5 (the owner's real-phone, screen-reader, and Safari/Firefox print checks outstanding). §H item 8 is met.
  - **The owner's decisions of 19 October 2026** recorded there (§8) and Approved by the owner:
    - Print Layout only on a desktop (no Regular Layout, no toggle); on a phone, Regular by default with a toggle to Print; the default chosen in Settings. This amends handoff PS-1B.1 §C.9.
    - A sermon keeps its own paper and margins, and the account's default for new sermons follows the last choice. This amends §J for that one value.
    - Page numbers at the bottom right.
    - Backspace removes, unwraps, and then joins points, as a word processor does with list items. This supersedes PS-1B.2A's rule.
    - A title and subtitle on every page; a text-styles menu; Google Docs–like shortcuts; typing `1.`, `I.`, `i.`, or `*` to start points and bullets; the phone editor's reading and editing modes; printing that suits black-and-white printers; an Outlines home with the account's own templates and card and list views; an editor page that puts the editor first. These are requirements for the next parts and phases, not built.
  - **PS-1B.2B.2B, Rich Text, Fonts, Typography & Named Styles: implemented in the lab** ([handoff](HANDOFF-PS-1B.2B.2B.md)), covering §G item 4 for text:
    - the formatting toolbar and the shared formatting commands;
    - the 14 registry fonts, loaded on first use;
    - named styles, with Document Styles (preview, Apply, Cancel) in the inspector;
    - adaptive colors for text and highlights.
  - **Approved by the owner (20 October 2026):** in the lab, schema v3's color value is widened to Adaptive (a preset or `#rrggbb`, unchanged), Exact, and Per theme. Readers older than the change refuse the new values. No production migration.
  - Component appearance (B.2C) and the print color modes (B.2F) are not built.
  - **Next:** §G items 3, 5, 7 (with the owner's requests above), 8, and 9, component appearance, and the rest of §H.

### 15.10 Editor redesign: document-first, schema v4 (Provisional; prototype validated in the lab)

**Approved by the owner (20 October 2026) as the direction:** the editor becomes _freeform first, structure on demand_, by Option C, a selective hybrid. **Provisional:** nothing below is approved for production, persistence, or a migration of stored data; the full implementation needs its own approved phase.

- **The model (schema v4).**
  - The document is a flat sequence of ordinary blocks.
  - A point is one textblock (`point`) with a semantic `depth`, not a container. Every top-level block carries a `depth`.
  - Who owns what is derived from order and depth alone (`v4/ownership.ts`); nothing stores a parent.
  - Notes and scripts stay bounded containers. Lists and quotations keep their usual structure.
  - The introduction and conclusion are roles on a main point. They can hold prose, Scripture, notes, and subpoints, and stand anywhere.
  - Depth is meaning, not indentation. Outline and manuscript presentations draw the same document.
- **Where it lives.**
  - `src/features/editor-lab/v4/` and the development-only `/lab/editor/v4`, beside the v3 lab, which is unchanged as the baseline.
  - The shared files changed only additively and are inert for v3: `identifiedTypes` knows `point`; the style sheet, style resolution, and style attributes can draw a v4 point.
  - No dependency, database, persistence, sync, or production code changed.
- **Validated** (unit tests in `v4/*.test.ts`; a desktop browser check in `tests/lab/v4.spec.ts`):
  - ownership of the owner's scenario (writing that belongs to Point I between its subpoints) before and after moving A and B, every level change, and converting headings, each undone and redone exactly;
  - Enter, Backspace, Delete, and Shift+Enter as specified, with a point's identity always staying with its content;
  - no edit outside a structural command may end a point while any of its heading survives (a guard refuses it; typing, pasting, and cutting over such a selection delete what was selected and keep the point);
  - outdent in place (reported when it changes ownership) and move out (takes nothing over);
  - paste lands at the level where it is put;
  - v3 → v4 → v3 round trip exact for every lab fixture;
  - numbering label for label with v3 under every preset and the custom style;
  - irregular levels accepted, shown, and never repaired;
  - Print Layout unchanged.
- **PS-ER1, Interaction Hardening (20 October 2026; lab only; [handoff](HANDOFF-PS-ER1.md)).** The integrity guard is the last line, not the editing experience. **Approved by the owner:**
  - **D1, Tab:** context-sensitive. In a list it moves the item and nothing else. On a point it increases the level in place. In writing it moves the block (or a run with one owner and depth) into the open point above, only when no other block changes owner by it. Otherwise the key is not taken and focus moves on: never a keyboard trap.
  - **D5, Shift+Tab:** Move Out on a point (its whole group, to just after its parent's; consecutive siblings together; nothing adopted). Writing outdents in place only when no other block changes owner by it, and is never moved. Otherwise focus moves back. The adopting outdent stays a toolbar action only; Alt+Shift+← is still Move Out.
  - **D2:** Enter over a selection across blocks that touches a heading deletes it without joining a heading to another block. The boundary is the break, and identities and block types survive.
  - **D3:** typing or Backspace over a selection from a heading into writing keeps the conventional join (the point survives).
  - **D4:** deleted points and reparented blocks are reported; a refused change says so, never during a composition or for the editor's own follow-up changes.
  - Implemented: modifier Backspace/Delete at a point's edge, drops within the document (same nodes and IDs), IME composition over a selection into a heading (checked in desktop Chromium), deletions the browser makes itself (`beforeinput`, plus a text check in the guard), and the depth limit on every command. Deleting a parent never repairs what survives it: depths stay, owners follow from order, and the change is reported.
- **A1, Unified Editor Workspace Integration (20 October 2026; [handoff](HANDOFF-PS-A1.md)).** The first checkpoint of the integration program.
  - **Implemented:** schema v4 and the PS-ER1 hardening are integrated into v3's workspace as one editor, `SermonWorkspace`, in `src/features/sermon-editor/`. It is production-intended, but runs only at the development route `/lab/editor/v4`, persists nothing, and changed no production route or table.
  - **Reused from v3:** the full-window workspace, the whole formatting toolbar, fonts, colors, named styles and Document Styles, numbering, page setup, the margin ruler, Regular and editable Print Layout, Scripture nodes, identity, and the clipboard.
  - **Changed for v4:**
    - the toolbar's outline actions are v4 commands, labelled by whether they act on the point alone or on its content;
    - a point takes a named style's look, alignment, and spacing from the ordinary controls;
    - the introduction and conclusion are framed as v3 framed its sections;
    - new `insertPassage` (ownership-checked) and `duplicatePointGroup`.
  - **Owner's decisions in A1:**
    - **Always an outline.** A sermon is always drawn as an outline. The Outline/Manuscript presentation switch is removed from the editor; this settles the open question below for the editor.
    - **No gutter mark.** The caret-group gutter mark is not part of the editor.
    - **Google Docs as the bar.** The editor should be as simple and intuitive as Google Docs.
  - **Superseded:**
    - further feature work in the v3 lab (§15.9 "Next"): v3 is now the frozen baseline;
    - the v4 lab as a validation-only prototype: it is now the integrated editor's development host.
  - **A1's UI/UX checkpoints (owner, 21 October 2026).** A1 is accepted only after them.
    - **A1-UI.1, Component Presentation and Spacing (implemented; [handoff](HANDOFF-PS-A1.md#a1-ui1-component-presentation-and-spacing-21-october-2026)).**
      - **Approved:**
        - three presentation presets, Minimal, Balanced (the default), and Expressive. They are appearance only, never modes or schemas, and change no content or structure.
        - **Precedence:** preset, then the outline's component and named styles, then a node's own overrides, then marks.
      - **Built:**
        - the preset as the resolver's first level;
        - the Balanced typography, rhythm, and component treatments;
        - outline-level component colors drawn for the first time;
        - labels for notes and scripts, given to assistive technology too.
      - The v3 lab keeps the baseline look.
      - **Layout and paper (owner, after reviewing Word mobile):**
        - A desktop uses editable Print Layout only, with no Regular/Print switch.
        - A phone starts in Regular Layout, which fills the width and follows the theme, and can choose Print.
        - Print Layout's paper is white in either theme, while the interface follows the theme. Printed output never depends on the theme.
        - **Approved:** an optional dark-paper display preference, like Word's Switch Background. It is never saved or printed and is independent of the presets; its control is built in A1-UI.2.
    - **A1-UI.2, split by the owner (21 October 2026) into four parts.** Nothing earlier assigned to A1-UI.2 was dropped; the mapping is in the [handoff](HANDOFF-PS-A1.md#checkpoint-plan-reconciled).
      - **A1-UI.2A, Balanced visual refinement (implemented; ready for visual review; [handoff](HANDOFF-PS-A1.md#a1-ui2a-balanced-visual-refinement-21-october-2026)):**
        - a realistic benchmark sermon;
        - hanging point numbers that adapt to long and custom labels;
        - indentation aligned with the outline;
        - one structural face for labels;
        - fixes: the phone Print Layout pagination defect, and an introduction or conclusion rule lost at a page top.
        - The header and footer feasibility review found them feasible in principle, not verified.
      - **A1-UI.2A.1, Balanced color refinement, numbering, and pagination review (approved by the owner for checkpoint completion, 21 October 2026, subject to its unrun verification; [handoff](HANDOFF-PS-A1.md#a1-ui2a1-balanced-color-refinement-numbering-and-pagination-review-21-october-2026)).**
      - **Approved requirement (owner, 21 October 2026):** a first-time user can create a complete, attractive sermon outline from a blank editor, with no prior use and no tour. It is spread over the checkpoints below; details in the [handoff](HANDOFF-PS-A1.md#first-time-user-requirement-owner-21-october-2026).
      - **A1-UI.2B:**
        - Minimal and Expressive, and the preset chooser;
        - outline-wide and per-component customization, and drawing a node's own appearance;
        - formatting inheritance, reset and restore, and saved personal styles;
        - appearance controls discoverable and understandable without knowledge of presets, semantic styles, or component schemas.
        - **Open decision:** where a chosen preset is kept.
      - **A1-UI.2C:**
        - the dedicated sermon header with a directly editable Sermon Title and optional Subtitle (basic header editing is not postponed to UI.3);
        - a functional optional footer (off by default) with discoverable basic configuration and correct pagination;
        - first-page and later-page treatments, integrated with pagination.
        - **Open decision, made in UI.2C:** canonical title storage, one source, coordinated with A2 and A3 (the handoff lists the options).
      - **A1-UI.2D:**
        - the dark-paper control, final preset refinement, print independence, and print color modes.
    - **A1-UI.3, required for A1:**
      - inserting and converting Preacher Notes, Scripts, and Page Breaks, and Scripture from the editor's own UI;
      - a prominently discoverable Insert workflow for every semantic component, with no reliance on the lab inspector;
      - intuitive creation of main points, subpoints, Scripture references and passages, Preacher Notes, Scripts, and Page Breaks, with contextual actions and sensible keyboard behavior;
      - optional slash commands as an extra convenience, never the primary or only way to insert;
      - the improved desktop toolbar, and a substantially improved mobile editing interface whose insertion and formatting controls work with the virtual keyboard;
      - header and footer interaction polish, context menus, shortcuts, and discoverability.
    - **A1-UI.4:** final visual acceptance, workflow and structural regression checks, long sermons, pagination and print, mobile, browsers, accessibility, and integrity, and a first-time-user scenario from a blank outline to a complete sermon through the real controls, with no tour and no development inspector. A1 is accepted only after it.
  - **Then:**
    - **A2:** persistence around `SermonWorkspace`, mounted on a real sermon route (handoff "Boundary for A2"), with revisions and data protection.
      - **A2.0 (built, 26 October 2026; committed as `f480456`):** the production-safe document core, `src/features/sermon-editor/document` ([handoff](HANDOFF-PS-A2.md)). Nothing persisted; no database change.
      - **A2.1 (built and approved, 26 October 2026; not yet committed):** server document persistence ([handoff](HANDOFF-PS-A2.md)).
        - **Storage:** `sermon_outline_documents` (migration `0020`, applied to development only), one v4 document to an outline, with its own revision.
        - **Status:** approved by the owner on 26 October 2026; the two-connection race passed on development.
        - **Code:** an owner-scoped service with an atomic revision check (`src/features/sermon-editor/persistence`), and thin actions behind `authorize("active")`.
        - **Not yet:** nothing calls it, nothing converts, nothing syncs, and the legacy outline is unchanged.
        - **Decided (owner):** a starting size limit of 512 KiB of UTF-8, reassessed in A2.3. This answers open decision 8 for documents only.
        - **Decided (the A2.1 brief):** one document revision, independent of the outline's. This answers open decision 6 for A2's documents.
      - **A2.2 (built, 26 October 2026; not yet committed):** legacy conversion and content authority ([handoff](HANDOFF-PS-A2.md)). No migration.
        - **Implemented:** a document row is the outline's content authority. That answers §9.3 step 4's "row or switch" question: the row, with no flag or column.
        - **Implemented:** every legacy entry and numbering write is refused once the row exists (`document_authoritative`). Over sync it is a kept conflict (`documentAuthoritative`), discarded only by the person.
        - **Implemented:** one server conversion, `convertOutline`, behind `convertOutlineDocument`.
          - It is atomic and runs once per outline, under the legacy writes' lock order.
          - It is refused unless the result can be read back as exactly the outline.
          - It replaces A2.1's `createOutlineDocument` action (owner's decision).
        - **Not yet:** nothing calls the conversion (A3). Queued legacy changes are not yet carried into the document, and devices are not yet told an outline is converted (A2.3).
      - **A2.3A (built, 26 October 2026; not yet committed):** persistence and local durability contracts ([handoff](HANDOFF-PS-A2.md)). No migration.
        - **Decided (owner):** full-document saves through the existing Server Action; durable local recovery in IndexedDB; at most one save in flight per controller; no automatic merging; manual recovery of legacy offline conflicts; production integration in A3.
        - **Decided (owner), implemented:** the document limit is 3 MiB of UTF-8 (replacing A2.1's 512 KiB), with a 4 MB Server Action body limit. Verified by encoding a save at the limit as the client does.
        - **Implemented:** account-scoped recovery drafts (`persistence/recovery`) with compare-and-set sequences, and the save contract (`persistence/saving.ts`).
        - **Not yet:** the autosave controller (A2.3B), the recovery interface (A2.3C), offline authority integration (A2.3D).
      - **A2.3C (built, 29 October 2026; not yet committed):** recovery resolution contracts ([handoff](HANDOFF-PS-A2.md#a23c-recovery-resolution-29-october-2026)). No migration, no UI, not mounted.
        - **Decided (owner):** a restored original is kept until the restored work's save is confirmed (A); switchable read-only previews, no diff or merge (B, built in A3); restoring needs durable local protection, not a server save (C); an oversized draft can be restored and is never sent until it fits; every other divergent draft is resolved before restoring one.
        - **Implemented:** classification, lineage units, exact-identity guarded restore and discard, confirmation evidence (cleanup markers), and idempotent cleanup.
        - **Not yet:** the recovery dialog and production mounting (A3), offline authority integration (A2.3D).
    - **A3:** full signed-in editor integration.
      - **A3 (built, 29 October 2026; not yet committed):** the production editor on `/outlines/[id]` ([handoff](HANDOFF-PS-A3.md)). No migration.
        - **Decided (owner):** conversion on opening behind a server-side switch that fails closed and stays off in production until A2.3D and A2.2's Vercel checks are done (an outline that has a document always opens in the new editor); a minimal Insert menu in A3 (part of UI.3 pulled forward, not the whole of it); `markDeveloped` on a confirmed save whose stored content changed, in the save's transaction.
        - **Implemented:** `OutlineDocumentHost` (one editor session at a time, Clerk identity, browser connectivity, guarded editing), `ConvertOnOpen`, the save indicator, full-page recovery with switchable read-only previews, read-only tabs with "Edit here", the Insert menu, and the developed rule.
        - **Release dependencies (not A3's):** A2.3D, then the owner's Vercel checks, then `SERMON_DOCUMENT_CONVERSION=on` in production.
        - **Cutover regressions:** restored by A3.1 (below).
      - **A3.1 (built, 29 October 2026; not yet committed):** legacy compatibility in the production editor ([handoff](HANDOFF-PS-A3.1.md)). No migration.
        - **Decided (owner):** a saved point copies its title and `sourcePointId` only; folding and Scripture expansion are separate, view-only controls; folding works in Print Layout too, with the desktop still Print-only; printing is always complete and keeps the `print` settings; the Bible opens in the same tab under the existing leave guard.
        - **Implemented:** Add from Saved Point in the Insert menu, `PointFolding` and the View menu, Print Layout’s screen-only Scripture collapse, print preparation in the Paginator, and the passage’s Open in the Bible.
        - **Release dependencies (unchanged):** A2.3D, the owner’s Vercel checks, then the switch.
        - **Still approved and unbuilt:** UI.2B.3, UI.2C (title and subtitle header, footer), the rest of UI.3, UI.2D, UI.4.
    - **B1:** the Workspace Panel. **B2:** KJV/RVG resources and dictionaries. **B3:** My Outlines and templates.
    - **C1:** advanced printing and export. **C2:** offline and PWA. **C3:** production migration and release.
    - The PS-phase rows above still govern the data model, synchronization, and the workspace shell these checkpoints reach.
- **Open:**
  - §8.3's wording ("derived from the document's nested structure"): the labels are the same engine's, but the structure is no longer nested;
  - how the points under an introduction or conclusion are numbered (a policy, today counted on their own);
  - whether presentation is a document style or view state (for the editor, settled in A1: always an outline; print or export presentations remain open);
  - typing markers (`I.`, `1.`) to make points;
  - production storage and migration of v3 documents.

---

## 16. Known risks

| Risk                                                                            | Severity | Mitigation                                                                                                                                       |
| ------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Version skew in sync silently drops fields or leads to discarded work           | Critical | Section 7.3 before PS-3b; invariants in handoff PS-1B.1 §E.7; register §F                                                                        |
| A legacy outline edit from an old client arrives after its sermon was converted | Critical | Since A2.2 always a kept `documentAuthoritative` conflict, never applied or dropped; carrying it into the document is A2.3 (handoff PS-A2, A2.2) |
| Old PWA installs strand queued work at a domain change                          | High     | Section 11.2 drain before redirect                                                                                                               |
| A conversion loses structure, numbering, or provenance                          | High     | Section 8 invariants; idempotent, verified, non-destructive                                                                                      |
| A production migration damages data with no fresh backup                        | High     | Section 9.3 gates                                                                                                                                |
| Two production builds migrate concurrently                                      | Medium   | One release with migrations at a time; Proposed lock (9.3)                                                                                       |
| A new user-owned table blocks account deletion                                  | Medium   | Section 10 rules and the Proposed test                                                                                                           |
| Editor saves multiply database writes and keep Neon awake                       | Medium   | Section 4.2 editor rules; measured in PS-1A and PS-3                                                                                             |
| Polling keeps Neon awake                                                        | Low      | Reduced in PS-0C.1 (15-minute fallback, event-driven); removal remains PS-6                                                                      |
| The prototype reaches production                                                | Medium   | Two server-side guards, tested (15.2)                                                                                                            |
| JSON storage weakens referential integrity                                      | Medium   | Section 6.1; relational integrity kept                                                                                                           |
| Tiptap or ProseMirror cannot meet the numbering or identity requirements        | Medium   | PS-1A tests them; fallback in 3.1                                                                                                                |
| Editable pagination (Print Layout) cannot split long blocks reliably            | High     | PS-1B.2 spike with measurements; a dedicated PS-5a rather than approximation                                                                     |
| An older client saves a newer document and drops what it cannot read            | Critical | Read-only for a newer `schemaVersion` (handoff PS-1B.1 §B.11), enforced in PS-3a                                                                 |
| Long Scripture passages cost many chapter requests                              | Medium   | Lazy loading, bounded concurrency, local text; measured in PS-1B.2                                                                               |
| Documentation drift (README, `DATABASE.md` 0015–0019)                           | Low      | README in PS-7; `DATABASE.md` before PS-2                                                                                                        |

---

## 17. Open architectural questions

Collected from the sections above, with the phase that decides each.

1. Unified document adopted, or the coexistence fallback: **decided**, unified (Approved in PS-1B.1).
2. Editor library: **decided**, Tiptap/ProseMirror (Approved in PS-1B.1).
3. Canonical stored form of the document: JSON plus side tables (Proposed in PS-1B.1).
4. Node-ID scope, duplicate provenance, and copying between sermons (Proposed in PS-1B.1, §6.3).
5. Snapshot or incremental saves: snapshots (Proposed in PS-1B.1). Save cadence is set in PS-3b.
6. Revision granularity (PS-2, PS-3).
7. Mechanism for source-point integrity (PS-2).
8. Limits on document size and on headings and notes (PS-2).
9. What document work counts as development (PS-2).
10. Protocol versioning mechanism and old-client answers (PS-3a).
11. Whether Vercel skew protection covers Server Actions for old tabs (PS-3a).
12. Relation of `ideas.notes`, the idea editor, and the document (PS-4).
13. Knowledge base storage and authoring (PS-6).
14. Removing the notification fallback poll entirely, after PS-0C.1 reduced it (PS-6).
15. Clerk domain change, drain period, and old-origin paths (PS-7).
16. Editable pagination: built in PS-4/PS-5, or a dedicated PS-5a (decided by the PS-1B.2 verdict).
17. A bounded chapter-range endpoint for long passages (PS-4, on PS-1B.2's measurements).
18. Where editor preferences are stored (PS-2).
19. The Workspace Panel's docking thresholds, and moving docked pages off viewport media queries (PS-4).
20. Dictionary data sources, licensing, attribution, storage, and offline use (the Dictionary phase).
21. Whether and how an AI tool is offered: scope, privacy, authorization, provider, and cost (needs the owner's approval before any phase).

**Flagged for a later phase, not changed in PS-0B:** `README.md` still describes "idea tracking, not manuscript writing" and a status from Phase 2C.1B, under the Sermon Tracker name; update it with the rebrand (PS-7) or when the document model is adopted (PS-1B).
