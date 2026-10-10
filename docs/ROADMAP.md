# Roadmap

Status as of 10 October 2026: **Phase 1 through 1C.1, Phase 2A, and Phase 2B (2B.1 and 2B.2) are implemented. Phase 2B.2 added no migration. Its signed-in pages were checked with unit and component tests and a visual preview on sample data, but not in a signed-in session: the signed-in end-to-end test is written and needs a development test account to run ([handoff](HANDOFF-2B.2.md)). Phase 2C.1 is next. The live checks listed for Phase 1C.2 are still outstanding ([handoff](HANDOFF-1C.1.md)).**

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
  - **2C.1: Dedicated King James Bible page** — a full reader with book, chapter, and verse navigation, added to the main navigation; the existing text search; selecting a verse or passage and attaching it to an existing idea; psalm titles; favourite verses and highlighting in several colours, stored per user without copying or changing the shared text; browsing and searching favourites
  - **2C.2: Sermon-point associations** — linking reusable point ideas to sermon ideas, with order and relationships

## Phase 3 — Preaching History

- Preaching occurrences
- Configurable venues
- Configurable preaching contexts
- Historical records

## Phase 4 — Outline Builder

- Ordered sermon outlines
- Optional introductions and conclusions
- Main points and subpoints
- Reusable point associations
- Sermon-specific customisations
- The outline page joins the main navigation

## Phase 5 — Productivity & Insights

- Reminders
- Idea resurfacing
- Statistics: a dedicated Analytics page, and the dashboard's four summary figures (sermon ideas, point ideas, in development, times preached)
- Enhanced discovery

## Phase 6 — Sharing & Data Portability

- User-to-user sharing
- Accept/reject workflow
- Independent copies
- Import/export

## Phase 7 — PWA & Offline Support

- Installable application
- Offline capture
- Synchronisation
- Conflict handling

## Phase 8 — Public Launch Readiness

- Onboarding
- Security review
- Performance
- Accessibility
- Monitoring
- Operational readiness
