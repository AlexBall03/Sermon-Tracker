# Handoff: Phase 3B — Structured outline editor

13 October 2026. No migration, no schema change, no new package. Two routes, one feature's components and client logic, one end-to-end spec. **Status: implemented and verified: type checking, lint, formatting, the whole unit suite, a production build, and a signed-in end-to-end journey at desktop and phone widths all pass (section 9). Not deployed.**

## 1. What was implemented

An authorized person can open a sermon's outline in its own editor and:

- add, edit, and remove points; nest them to any depth; add and remove the optional introduction and conclusion;
- move a point with everything under it: up and down, in and out, out to the top level, by the row menu, from the keyboard, or by dragging;
- fold and unfold points, and have that remembered in the browser;
- choose one of the seven numbering styles or write a custom one, with a preview before it is applied;
- never press Save: every change is saved by itself, the state of that is always shown, and a failure or a conflict is said and can be recovered from.

All of it goes through the Phase 3A services and actions as they were. Nothing of Phase 3C or 3D was built: no overview of outlines, no navigation item, no link from a sermon's page or the library, no saved-point picker, no passages on an entry, no preview or print view.

## 2. Routes and how the editor is reached

| Address                     | What it is                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/outlines/<id>`            | The editor for one outline                                                                                                                                                                              |
| `/outlines/new?sermon=<id>` | The way in: a sermon with an outline is sent on to it; a sermon without one is offered a "Create outline" button; an idea that is not a sermon is told why it cannot have one. Opening it makes nothing |
| `/outlines`                 | **No page yet.** It is in `routes`, `privateRoutes`, and `appRoutes` so the proxy and `robots.txt` cover everything beneath it; the overview is 3C's                                                    |

Nothing in the application links to either page yet. Until 3C, an outline is reached by typing `/outlines/new?sermon=<the idea's ID>` (the ID is the last part of a sermon's address, `/library/<id>`). **3C should link there from a sermon's page, the library, and the overview**; the page already does the right thing whether or not the sermon has an outline.

The editor's "Back to sermon" goes to `/library/<sermonId>`, a fixed address.

## 3. Architecture

```
src/features/outlines/
  editor/store.ts        The editor's state and autosave. No React.
  editor/moves.ts        Where up, down, indent, outdent, and "top level" put a point.
  editor/drop.ts         Where a dragged point would land (projectDrop).
  editor/collapsed.ts    Which points are folded: a browser preference.
  components/outline-editor.tsx       The editor: toolbar, notices, the three sections.
  components/outline-row.tsx          One point, and the conflict panel.
  components/use-outline-drag.ts      Dragging by the grip, with Pointer Events.
  components/numbering-dialog.tsx     Choosing and customizing the numbering.
  components/save-status.tsx          The save state, in words.
  components/create-outline-button.tsx
src/app/(app)/outlines/  [id]/page.tsx, new/page.tsx, loading.tsx, not-found.tsx
```

**Decisions that were mine to make:**

| Decision                                                                  | Why                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One store outside React owns the outline (`createOutlineStore`)           | Saving has to outlive the page that started it (Next keeps a page it has left, and hides it), and the rules are tested with fake timers and no rendering                                          |
| No second tree: the store plans with `planInsert`/`planMove`/`planRemove` | A change is shown, renumbered, before the server answers, by the code the server will use                                                                                                         |
| No drag-and-drop package                                                  | The menu and the keyboard already move points, so a library would add only the gesture. The gesture is 150 lines over Pointer Events; where a drop lands is a pure function with its own tests    |
| Words are saved without revalidating the page                             | In Next 16 an action that revalidates sends the re-rendered page back with its answer. For a save every second that is the whole outline each time, for a page that already holds it              |
| In-app leaving is held only for a failed save or an open conflict         | A save on its way finishes after the page is left. A dialog at every click within a second of typing would be noise. Closing or reloading the tab still warns while anything is unsaved           |
| Folded points are remembered in `localStorage`, by outline                | A way of looking at an outline is not part of it. This is the library's card-or-list convention                                                                                                   |
| Enter adds a point; Tab is never taken                                    | Tab has to move focus. Indent and outdent are Alt+Shift with an arrow, as in a word processor's outline view                                                                                      |
| A queued change of shape is dropped, not replayed, after a reload         | The plan said queued additions would be re-planned. Dropping is simpler and loses nothing: text typed into a point that did not reach the server is kept as a lost draft, to add again or discard |
| `deleteOutline` is offered in the editor's menu                           | The action existed and an outline had no other way to be removed. It asks first and returns to the sermon                                                                                         |

## 4. Autosave

The rules are in `editor/store.ts` and each has a test in `editor/store.test.ts`.

- **One queue, one request at a time**, in the order the changes were made. (Next also sends server actions one at a time; the queue is what orders them and carries the revisions.)
- **A change of shape** (add, move, remove) is sent at once and names the outline's revision from the answer before it. An addition carries an ID made in the browser, so sending it again adds nothing.
- **Words** (a heading, notes) are sent about 0.9 seconds after the typing stops, and at once when the field is left, the page is hidden, or the page is left. Only the fields that differ from what the server last acknowledged are sent, with the entry's own revision.
- **An answer never writes over a field.** Text typed while a request was away stays, is still unsaved, and is sent next.
- **Save states**: Saved · Saving… · Unsaved changes · Save failed · Needs your attention. "Saved" needs an empty queue, nothing on its way, and no field different from what was acknowledged. Text is compared as the schema tidies it, so a space after a word is neither a change nor taken away while typing; a field is tidied on screen when it is left.
- **A failure** of the network or the database keeps the change at the head of the queue and tries again after 2, 5, and 15 seconds, and when the browser comes back online; after that it waits for "Try again". A refusal with no `code` (signed out, account disabled) shows the server's message and is not retried by itself.
- **A stale or refused change of shape** (`stale`, `missing`, `cycle`, `invalid_parent`, `section`, `section_exists`, `full`) is never sent twice. The store asks the page for the outline again (`router.refresh()`), adopts it, keeps every unsaved word, drops the changes of shape still queued, and shows a notice. If the outline does not come back in 12 seconds that is a failure with "Try again".
- **A stale entry** (`stale_entry`) is merged field by field against the text this browser last knew. Changed only elsewhere: taken. Changed only here: sent again against the new revision. Changed in both to the same text: nothing to do. Changed in both to different text: a conflict on that entry, showing the other text, with "Keep mine" and "Use the other". Nothing is written for it until one is chosen.
- **An entry that is no longer there** leaves its unsaved text as a lost draft: "Add again as a point" or "Discard".
- **A copy of the outline arriving from the page** is taken only when no change of shape is queued and it is not older than what the store knows; words that are unsaved here, or saved here since the copy was made, stand.
- **Leaving**: see the decision above. The store is disposed only when the outline itself is deleted.

Server revalidation: `createOutline`, `deleteOutline`, `setOutlineNumbering`, `addEntry` (when it adds), `moveEntry`, and `removeEntry` call `revalidatePath("/outlines/<id>")`. `updateEntry` and `setEntryReferences` do not. A refused or stale request revalidates nothing. Tested in `actions.test.ts`.

## 5. Structure and moving

- Every move is `store.move(id, parentId, index)`, which is `planMove`. The introduction and the conclusion have no grip and no move controls, and `planMove` refuses them anyway.
- **Row menu** (always visible on each point): add subpoint, add point below, add notes, move up, move down, indent, outdent, move to top level (two or more levels down), delete. The four moves keep the menu open, so a point can be walked several places on a touch screen. A move that cannot be made is disabled.
- **Keyboard, in a heading**: Enter (point below), Ctrl/Command+Enter (subpoint), Alt+Shift+↑ ↓ → ← (up, down, indent, outdent), Backspace on a point that is empty and has nothing under it (removes it, focus steps back). Escape in notes returns to the heading. The focus and the caret stay in the heading through a move, and where the point now is is announced to screen readers.
- **Dragging**: press the grip and move. A line shows where the point would land; how far across the pointer is chooses the level, held between "no shallower than the point below" and "no deeper than one under the point above". What is under the dragged point goes out of sight and moves with it. Near the top or foot of the window the page scrolls. Escape, or a cancelled touch, leaves everything where it was. The grip has `touch-action: none`, so a finger on it drags and a finger anywhere else scrolls; text selection and the fields are not involved.
- **Outdent** puts a point straight after its parent; the points that were after it stay under the old parent.
- **Deleting** a point asks first and says how many points go with it. An empty point with nothing under it is removed without asking.
- **Depth**: no limit but `outlineLimits.entries` (500), which the editor also checks before adding. Indentation is `min(depth × step, 45% of the list)` with a step of 1rem on a phone and 1.75rem from `sm`; from the seventh level a small marker says the level, and every row says its level to a screen reader.

## 6. Numbering

`NumberingDialog`: a panel down the side on a wide screen, a full sheet on a narrow one. The seven built-in styles and Custom as radio cards, each with a line showing its first four levels. Custom starts from the style in force and is written level by level: what it counts with, capitals or small letters, the bullet, text before and after, whether the levels above are included and what joins them, up to 12 levels, and what deeper levels do (repeat from a level, keep the last, or no number). A sample outline is numbered by `entryLabel` as the draft changes. `numberingConfigSchema` is the only validation; an invalid draft says why and cannot be applied. Text around a number is rendered as text. Nothing changes until Apply, which saves `numbering_config` and nothing else.

## 7. Authorization

- Both pages call `requireActiveUser()` and validate the ID before any query. A malformed ID, an outline or sermon that does not exist, and one that is someone else's are the same not-found page; the queries are the owner-scoped ones from 3A.
- The editor calls only the 3A actions, each of which authorizes itself and takes the owner from the session. No action was added.
- `/outlines/new` cannot make an outline for an idea that is not a sermon: the page offers no button, and `createOutline` refuses under the idea's row lock as before.
- Nothing in the editor writes to `ideas`: no status, no `updated_at`, no `last_developed_at`, no archive.

## 8. Localization

The `outlines` dictionary gained `page`, `create`, `editor`, and `numbering` in English and Spanish ("Bosquejo"). No string is written in a component. The loading placeholder's screen-reader text is English, as the other loading files' are.

## 9. Verification

Everything below was run on the final code unless it says otherwise.

| Check                                                                       | Result                                                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                                         | **Pass**                                                                                        |
| ESLint on the files touched                                                 | **Pass**                                                                                        |
| `prettier --check --end-of-line auto` on the source files touched           | **Pass**                                                                                        |
| The whole unit suite (`npx vitest run`)                                     | **Pass**: 96 files, 1,647 tests. Run once, before the documentation and one comment were edited |
| `npm run build`                                                             | **Pass**; "not a production deployment, migrations skipped"                                     |
| `npx playwright test tests/e2e/outline-editor.spec.ts` (desktop and mobile) | **Pass**: 2 of 2, signed in, against the development database                                   |
| The rest of the end-to-end suite                                            | **Not run**                                                                                     |
| Spanish in a browser                                                        | **Not run** (see below)                                                                         |
| Dragging with a finger on a real phone                                      | **Not run**                                                                                     |

New tests: `editor/store.test.ts` (25), `editor/moves.test.ts` (11), `components/outline-editor.test.tsx` (22), `components/numbering-dialog.test.tsx` (7), `app/(app)/outlines/page.test.tsx` (11), and one added to `actions.test.ts`: 77 in all.

**Why the whole unit suite.** `src/lib/site.ts` (the proxy and robots read it) and the dictionaries are shared, which `ARCHITECTURE.md` names as reasons for one.

**What the end-to-end journey did**, at 1280px and at a Pixel 7's width: captured a sermon; was refused an outline while it was not a sermon; met the not-found page for an unknown and a malformed address; created the outline and was sent to it again on asking twice; added points with Enter and Ctrl+Enter; added notes, an introduction, and a conclusion; reloaded and found all of it; moved by the menu and by Alt+Shift+arrows; dragged a point with its subpoint to the top; applied Decimal and then a custom style and found both after a reload; folded a point and found it folded after a reload; checked for sideways overflow in light and dark and with the numbering dialog open; had its save requests cut off, saw "Save failed", was held by the leave dialog, and saved with "Try again"; typed and left at once and found the text saved; deleted a point with one under it; and deleted the sermon, which took the outline with it. Screenshots of both widths in both themes were looked at.

**Not verified in a browser:** Spanish (covered by component and page tests; the journey would have had to change the development account's language), dragging with a real finger (the journey drags with a pointer at phone width; the grip's `touch-action` is the part a real finger would test), a screen reader, and two tabs editing one outline (the store's rules for it are unit-tested against a stand-in server).

### Database and deployment

No migration, no schema change, nothing run against the development database but the end-to-end journey, which removed what it made. Production and preview were not touched. Nothing was deployed. The release note from 3A stands: a release from here applies `0009` through `0013`.

## 10. Known limitations

- **Nothing links to the editor.** That is 3C's, and until then the address has to be typed.
- **`/outlines` is a 404**, signed in.
- **A lost answer to a move looks like a stale outline.** Sent again, the move finds the revision already moved; the outline is read again (it holds the move) and anything queued behind it is dropped. Text is kept; a second move made in that moment has to be made again.
- **A save that fails after its page was left** is tried again three times and then waits. If that page is never returned to, the person is not told. It needs a failed request and a departure in the same few seconds.
- **Deleting the outline** revalidates the page it is on, so its not-found page may show for an instant before the sermon's page.
- **Outdent does not take the following points along**, as some word processors do.
- **The row menu holds every action.** There is no always-visible toolbar for the focused row; on a phone, moving is menu, tap, tap.
- **Passages on an entry are not shown.** None can exist yet without calling the action by hand.
- **The Spanish wording is the agent's** and was not reviewed by a Spanish reader.
- **Notes are capped by `maxLength`**, which counts UTF-16 units; the database counts characters. A note full of emoji is stopped a little early in the browser, never late.
- Carried and unchanged: the rest of the end-to-end suite and the signed-in browser passes for Phase 2E.2 onward.

## 11. For Phase 3C

**Decisions still open, and nothing here assumes an answer:**

- **Whether working on an outline counts as developing the sermon** (`last_developed_at`, and so the dashboard's "revisit" list). Today it does not: nothing in `features/outlines` writes to `ideas`. If it should, it is one write in the services, and `needsAttention` needs no change.
- What is copied when a saved point is placed (today its title and notes; not its passages).
- Whether a point idea can be made from an entry.
- When the overview exists: whether saving words should then revalidate it (its "last worked on" order moves with every save), or whether it should simply be read fresh.

**What 3C can use as it is:**

- Link to `/outlines/new?sermon=<id>` from anywhere a sermon is shown; it resolves to the editor or to the create page.
- `store.addPoint(parentId, index, { title, notes })` already takes words. Placing a saved point needs `sourcePointId` passed through the store's `add` operation to `addEntry`, and a picker; `createEntry` already copies the point's words when none are sent, so send none.
- The row has room under the notes for passages. `setEntryReferences` exists and is a change of words (the entry's revision): give it its own operation in the store's queue, beside `words`, and keep it out of revalidation.
- Add the overview to `appLinks()` and give `/outlines` its page; `routes.outlines` is already private and behind the proxy.
- The sermon's delete confirmation should say that the outline goes too (carried from 3A).

**What 3C must keep:** the rules added to `AGENTS.md` in this phase: one store, moves only through `store.move`, an answer never over a field, no revalidation on words, no drag-and-drop package, Tab left alone.

## Process

No Git command that changes anything was run. No package was installed. No server was left running: the only servers were Playwright's own, on port 3100, which it stopped. Prettier was run with `--write` only on named files that this phase wrote or edited, never on a directory. The development database was touched only by the end-to-end journey, through the application, as the signed-in test account.
