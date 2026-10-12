# Roadmap

Status as of 12 October 2026: **Phase 1 through 1C.1, Phase 2A, and Phase 2B (2B.1 and 2B.2) are implemented. Phase 2B.2 added no migration. Its signed-in pages were checked with unit and component tests and a visual preview on sample data, but not in a signed-in session: the signed-in end-to-end test is written and needs a development test account to run ([handoff](HANDOFF-2B.2.md)). Phase 2C.1A, the Bible reader, is implemented with one migration (`0004_bible_psalm_titles`); its signed-in end-to-end test is written and waits on the same test account ([handoff](HANDOFF-2C.1A.md)). Phase 2C.1B, favorites and highlights, is implemented with one migration (`0005_bible_favorites_and_highlights`); it too was checked with unit, component, and database tests and a visual preview on sample data, and its signed-in end-to-end test waits on the same test account ([handoff](HANDOFF-2C.1B.md)). Phase 2C.1C, from the Bible to an idea, is implemented with no migration; it was checked the same way, and its signed-in end-to-end test waits on the same test account ([handoff](HANDOFF-2C.1C.md)). That completed the King James Bible. The bilingual milestone, English and Spanish with the RVG beside the KJV, is implemented as Phase 2C.2 with one migration (`0006_scripture_translations_and_languages`); it was checked with unit, component, and database tests, lint, type checking, and a production build, and by the owner in a signed-in development session while it was built, but its end-to-end suite was not run and it was not given the measured visual pass earlier phases had ([handoff](HANDOFF-2C.2.md)). Phase 2D.1, the classification data model (development status, intended format, sermon type, and archiving), is implemented with one migration (`0007_idea_classification`); it was checked with unit and database tests, lint, type checking, and a production build, and adds no interface of its own ([handoff](HANDOFF-2D.1.md)). Phase 2D.2, the creation and editing experience for those classifications, is next. The live checks listed for Phase 1C.2 are still outstanding ([handoff](HANDOFF-1C.1.md)).**

Work stays inside the current phase. Do not implement later-phase functionality early.

## Phase 1 — Foundation, Architecture & Branding

- **1A: Foundation, branding, public experience** — complete
- **1A.1: Visual redesign and design-system refinement** — complete ([handoff](HANDOFF-1A.1.md))
- **1A.2: "Lit glass" visual revamp** — superseded by 1B.1 before it was committed
- **1B: Database, authentication, administration** — implemented; live Clerk and Neon verification outstanding ([handoff](HANDOFF-1B.md))
- **1B.1: Premium design overhaul and UI/UX refinement** — complete; neutral editorial system, landing page recomposed, all shells restyled ([handoff](HANDOFF-1B.1.md))
- **1B.2: Final design polish and UX quality assurance** — complete; hero and spacing refined, interaction states, touch targets, and the Clerk form brought in line ([handoff](HANDOFF-1B.2.md))
- **1C: Authenticated dashboard, deployment, hardening** — in progress
  - **1C.1: Dashboard, custom account management, navigation** — implemented; live Clerk behaviour unverified ([handoff](HANDOFF-1C.1.md))
  - **1C.2: Live authentication and database verification, deployment, hardening** — next

## Phase 2 — Core Idea Tracker

- **2A: Data model, idea CRUD, quick capture, King James Bible and Scripture components** — implemented ([handoff](HANDOFF-2A.md)). Sermon, point, and undecided ideas; statuses; structured Scripture references; the Scripture preview and panel; Bible text search (brought forward at the owner's request)
- **2B: Idea library** — implemented
  - **2B.1: Library data, search, filtering, tags, pagination** — implemented ([handoff](HANDOFF-2B.1.md)). The paged, searchable, filterable library query; reusable tags and their actions; the URL query contract. `/library` is paged with Previous and Next
  - **2B.2: Library interface** — implemented ([handoff](HANDOFF-2B.2.md)). Search box, expandable filters with several values per filter and tags matched by any or all, active-filter chips, sort menu, card and list views with a remembered preference, numbered pages, a tag management dialog, tag selection in the idea editor, and returning to the same place in the library. Deferred: tag selection in quick capture, and bulk actions
- **2C: Bible reader and associations**
  - **2C.1: Dedicated King James Bible page**
    - **2C.1A: Reader foundation** — implemented ([handoff](HANDOFF-2C.1A.md)). `/bible` in the main navigation; book, chapter, and verse navigation with a sidebar that can be put away and a sheet on narrow screens; the existing text search and typed references; selecting one verse, a passage, verses that are apart, or a whole chapter; a selection toolbar that copies the text, the reference, or a link; shareable addresses; the reading position remembered on the device; the 116 psalm titles restored
    - **2C.1B: Favorites and highlights** — implemented ([handoff](HANDOFF-2C.1B.md)). Saving a verse, a passage, or verses that are apart as one favorite, with an optional label and notes, never twice; highlighting in yellow, green, blue, or red, one color to a verse; both from the reader's selection toolbar, with Shift-click to select a run; a Saved Scripture section inside the library, with search, book and color filters, three orders, and pages; all of it per account and per translation, without copying or changing the shared text
    - **2C.1C: From the Bible to an idea** — implemented ([handoff](HANDOFF-2C.1C.md)). Adding a selection (a verse, a passage, or verses that are apart) to an existing sermon or point idea from the reader, found by name in one dialog, never twice; beginning a new sermon or point idea from a selection; the same from a saved passage in the library; references on an idea's page as rows that open their text in place; opening a reference in the Bible with the passage pointed out and a way back to the idea
  - **2C.2: English and Spanish, and the RVG** — implemented ([handoff](HANDOFF-2C.2.md)); see "Bilingual milestone" below
- **2D: Sermon classification**
  - **2D.1: Classification architecture and data model** — implemented ([handoff](HANDOFF-2D.1.md)). Four development statuses (Idea, Developing, Ready, On Hold), changed by hand only; four intended formats (Full-Length, Mini Sermon, Flexible, Not Specified); three sermon types (Topical, Textual, Expository) and Not Specified, with a definition and an example of each in both languages; archiving as a date of its own, apart from status; validation, defaults, saves that leave an unnamed classification alone, and owner-checked actions to classify, archive, and restore. No new interface
  - **2D.2: Sermon creation and editing experience** — next. The controls that choose a status, a format, and a type, with the definitions shown; archive and restore from an idea
  - **2D.3: Classification in the library** — not started. Filters for format and archived ideas, and whatever views of status the library gains. Its scope is the owner's to set
- **2E: Preaching history** — not started. Preaching occurrences (when, where, in what context, the format actually used, duration, notes, recordings), configurable venues and preaching contexts. A sermon keeps one identity however often it is preached, and nothing about an occurrence is stored on the idea

## Bilingual milestone — English and Spanish (Phase 2C.2)

Implemented ([handoff](HANDOFF-2C.2.md)).

- Interface in English and Spanish, with a preferred language per account, and a Bible translation chosen independently of it
- A second Bible text, shown to people as **RVG** (the revision is RVG 2023, from the publisher's own file), beside the King James; switching translation in the reader
- Side-by-side reading in any pairing of the two, where the window is wide enough for two columns
- A switch an administrator can use to turn Spanish off for everyone, which deletes nothing
- What a person wrote (ideas, notes, labels) is never translated for them
- The owner reviewed the RVG's published terms before the text was added; the source and attribution are in `data/bible/README.md`
- Still in English: the public landing page, Clerk's own sign-in form, and the profile and security forms inside Settings

## Phase 3 — Structural Outlines

- Sermon-point associations: linking reusable point ideas to sermon ideas, with order and relationships (this was listed as 2C.3; it is not started, and no table for it exists)
- Ordered sermon outlines
- Optional introductions and conclusions
- Main points and subpoints
- Reusable point associations
- Sermon-specific customisations
- The outline page joins the main navigation

## Phase 4 — Onboarding

- First-time account onboarding and private profile setup
- General preferences, with the interface language and Bible translation that already exist
- Preaching-class participation preferences
- An interactive product tour that can be dismissed and started again

## Phase 5 — PWA & Offline Support

- Installable application
- Offline capture and editing
- Synchronisation
- Conflict handling

## Later, not yet numbered

These were Phases 5, 6, and 8 before the phases were renumbered on 12 October 2026, and have no number in the new order yet.

- **Productivity and insights**: reminders, idea resurfacing, statistics (a dedicated Analytics page, and the dashboard's four summary figures: sermon ideas, point ideas, in development, times preached), enhanced discovery
- **Sharing and data portability**: user-to-user sharing with an accept/reject workflow and independent copies, import and export
- **Public launch readiness**: security review, performance, accessibility, monitoring, operational readiness
