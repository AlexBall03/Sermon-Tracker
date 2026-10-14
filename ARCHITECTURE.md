# Architecture

The primary technical reference for Sermon Tracker. Update it when a decision changes.

## Overview

One full-stack Next.js application deployed to Vercel. No separate backend, queues, caches, or global client state. Server Components by default; Client Components only where interaction requires them (theme, navigation menus, the admin tables and forms, quick capture, the idea editor, the outline editor, and the Scripture components). Clerk handles identity; PostgreSQL handles application authorization.

| Concern       | Choice                                                         |
| ------------- | -------------------------------------------------------------- |
| Framework     | Next.js 16 App Router, Turbopack, Cache Components enabled     |
| Language      | TypeScript, strict                                             |
| Styling       | Tailwind CSS v4, semantic CSS-variable tokens                  |
| UI primitives | shadcn/ui (`base-nova` style on Base UI), added only as needed |
| Validation    | Zod                                                            |
| Auth          | Clerk (`@clerk/nextjs`), invitation-only                       |
| Database      | Neon PostgreSQL with Drizzle ORM                               |
| Tests         | Vitest + Testing Library, Playwright                           |
| Hosting       | Vercel                                                         |

## Repository layout

```
src/
  app/
    layout.tsx              Root: fonts, theme provider, base metadata, skip link
    globals.css             Design tokens and base styles
    (marketing)/            Public, indexable pages (header + footer shell)
      page.tsx              Landing page  /
    (auth)/                 Centred shell: sign-in, accept-invitation, access-denied
    (app)/                  Authenticated shell: dashboard, library, bible, settings, admin
    (setup)/                The bar and nothing else: first-time account setup  /onboarding
    api/bible/              Route handlers: one chapter, and word search
    api/ideas/              Route handler: the account's ideas by name, for the picker
    icon.svg                Favicon (small-size mark)
    manifest.ts             The web app manifest (Phase 5A)
    sw.js/route.ts          The service worker, with the build's version written in
    offline/                What the service worker shows when a page cannot be reached
    apple-icon.png          Generated
    opengraph-image.png     Generated share card (+ .alt.txt)
    robots.ts, sitemap.ts
  proxy.ts                  Clerk session and guest/signed-in redirects (routing only), and the splash signal
  instrumentation-client.ts Reports the start of each navigation, for the progress bar
  db/                       Drizzle schema, connection, test database
  features/
    auth/                   Provisioning and the access helpers
    onboarding/             First-time account setup: its lifecycle on the account, the two actions
                            that record progress and finish it, and the four-step wizard
    admin/                  User and invitation services, server actions, components
    dashboard/              Dashboard view, its sections, greeting, and the four figures
    ideas/                  The idea model, queries, tags, the library query contract, server actions,
                            quick capture, list, editor, tag picker, and components/library/ (the
                            library's controls, results, pager, and tag management)
    preaching/              Preaching history: the model, validation, the occurrence, venue, and
                            context services, their server actions, the history URL contract, and
                            the recording form, record list, and venue and context management
    outlines/               Sermon outlines: the model, the numbering engine, the tree, validation,
                            the outline and entry services, and their server actions; editor/ (the
                            editor's state and autosave, the movement and drop rules, the folding
                            preference; no React) and components/ (the editor, a row, the numbering
                            dialog, the save status)
    scripture/              Books, references, chapter and search reads, and every Scripture component;
                            saved/ holds favorites and highlights (model, services, actions, URL query)
    settings/               Account management: schemas, server action, Clerk hooks, components
    pwa/                    The installed application: the service worker's script, its registration,
                            install and update state, the install guide, the offline message, and
                            the update notice (Phase 5A)
    preferences/            The interface language and Bible translation: what is saved, what is
                            in force (with the Spanish switch applied), and the actions that save it
  i18n/                     Locales, the dictionaries by feature (en/, es/), getT and useT
  components/
    ui/                     shadcn primitives restyled to the tokens, and small shared pieces
                            (Badge, Avatar, StatStrip, ActionStatus, ConfirmDialog, Dialog,
                            Popover, Select, Segmented, Textarea, Toast)
    brand/                  LogoMark, Logo, Ribbon
    layout/                 SiteHeader, SectionLinks, MobileNav, GuestLanguage, AppHeader (with its tab bar and account sheet), app-links, AccountMenu, PageHeader, SiteFooter, ThemeProvider, ThemeToggle
    marketing/              The landing page: sections/, preview/ (the application's screens
                            reconstructed), demo.ts (the fictional workspace they show), reveals.tsx
  lib/
    site.ts                 Site config and the route map
    action-result.ts        The `{ ok, message }` shape every action reports
    format.ts               Date formatting that is identical on server and browser
    env.ts                  Zod-validated environment access
    clerk-appearance.ts     Clerk components mapped to the design tokens
    use-media-query.ts      Whether a media query matches, for choosing a surface
    unsaved-work.ts         Whether a reload now would lose anything (asked before an update)
    utils.ts                cn()
public/brand/               mark.svg, icon-192.png, icon-512.png, icon-maskable-192.png, icon-maskable-512.png
scripts/                    generate-brand-assets.mjs, db/ (migration commands and the Bible
                            loader), bible/ (dataset reader and its builder)
data/bible/                 kjv.json and rvg.json, each translation's text; their psalm titles; and
                            where they came from
drizzle/                    Generated SQL migrations (committed)
tests/e2e/                  Playwright specs
docs/                       Roadmap, database, environments, handoff, brand board
```

Conventions:

- Unit and component tests sit beside the code as `*.test.ts(x)`. End-to-end specs live in `tests/e2e`.
- Feature code goes in `src/features/<feature>/` (components, server actions, queries, schemas together). Create a folder when its first feature is built, not before.
- Import through the `@/` alias.
- Read environment variables only through `src/lib/env.ts`.

## Routing

| Path                        | Purpose                                     | Phase | Indexed |
| --------------------------- | ------------------------------------------- | ----- | ------- |
| `/`                         | Public landing page                         | 1A    | Yes     |
| `/sign-in`                  | Clerk sign-in                               | 1B    | No      |
| `/accept-invitation`        | Account creation from an invitation link    | 1B    | No      |
| `/access-denied`            | Shown to disabled or unauthorised accounts  | 1B    | No      |
| `/onboarding`               | Account setup: first time, or from Settings | 4A    | No      |
| `/dashboard`                | Authenticated home                          | 1C.1  | No      |
| `/settings`                 | Settings overview; categories beneath it    | 5B.1  | No      |
| `/admin`                    | Restricted administration                   | 1B    | No      |
| `/library`                  | Library overview: the way to its sections   | 2E.2  | No      |
| `/library/sermon-ideas`     | The owner's ideas: search, filter, browse   | 2B.2  | No      |
| `/library/saved-scripture`  | Saved Scripture                             | 2C.1B | No      |
| `/library/preaching-record` | Preaching Record                            | 2E.2  | No      |
| `/library/<id>`             | One idea: edit, reclassify, delete          | 2A    | No      |
| `/bible`                    | The Bible reader                            | 2C.1A | No      |
| `/outlines`                 | The owner's outlines: search, order, open   | 3C    | No      |
| `/outlines/<id>`            | One outline, in its editor                  | 3B    | No      |
| `/outlines/new?sermon=<id>` | Gives a sermon its outline, or opens it     | 3B    | No      |
| `/api/bible/…`              | A chapter, its marks, or a word search      | 2A    | No      |
| `/api/ideas/search`         | The account's own ideas, found by name      | 2C.1C | No      |
| `/offline`                  | Kept by the service worker; offline notice  | 5A    | No      |
| `/sw.js`                    | The service worker                          | 5A    | No      |
| `/manifest.webmanifest`     | The web app manifest                        | 5A    | No      |
| `/analytics`                | Statistics (not in the route map yet)       | Later | No      |

Route groups separate the three shells without affecting URLs:

- `(marketing)` exists. Public header and footer.
- `(auth)` exists. Minimal centred layout.
- `(app)` exists. Authenticated shell with the application bar; `robots: noindex` in its layout. Its layout mounts one `ToastProvider`, one `ScriptureProvider`, and one `QuickCaptureProvider` for every page.
- `(setup)` exists (Phase 4A). The bar with the logo and no navigation, for `/onboarding` alone; `noindex`. It is beside `(app)`, not inside it, because the `(app)` layout is closed to an account that has not finished setup.

The paths above are defined once in `src/lib/site.ts` (`routes`, `privateRoutes`, `appRoutes`), which also drives `robots.txt` and the proxy.

## Authentication and authorization

**Clerk** verifies identity: passwords, Google sign-in, sessions, recovery, invitations. **The `users` table** decides what a person may do: role (`admin`, `user`) and status (`active`, `disabled`). Nothing about authorization is stored in Clerk or trusted from the browser.

### Request flow

1. `src/proxy.ts` runs Clerk and handles routing only: a guest on an application path goes to sign-in (Clerk builds the return URL and only honours same-origin targets), and a signed-in visitor on `/`, `/sign-in`, or `/accept-invitation` goes to `/dashboard`.
2. `getAccess()` in `src/features/auth/access.ts` resolves the caller once per request: Clerk user ID, then `provisionUser`, then the status check. It calls `connection()` first so the decision is never prerendered or cached.
3. Pages and layouts call `requireActiveUser()` or `requireAdmin()`, which redirect to `/sign-in` or `/access-denied`. Server actions and route handlers call `authorize("active" | "admin")`, which returns a failure value instead.
4. The same helpers then ask whether the account has finished first-time setup (see "First-time setup"): `requireActiveUser()` sends one that has not to `/onboarding`, and `authorize("active" | "admin")` refuses it. `requireAccount()` and `authorize("account")` leave that question out, and are used only by setup itself.

The proxy is never the only check. Every page under `(app)` and every server action authorises itself, because a layout does not re-run on navigation and a server action can be called directly.

| Situation                                   | Result                       |
| ------------------------------------------- | ---------------------------- |
| Guest visits `/`                            | Landing page                 |
| Guest visits `/dashboard` or `/admin`       | Redirect to `/sign-in`       |
| Signed-in visitor on `/` or `/sign-in`      | Redirect to `/dashboard`     |
| Standard user visits `/admin`               | Redirect to `/access-denied` |
| Disabled or uninvited account, any app path | Redirect to `/access-denied` |
| Administrator visits `/admin`               | Administration               |
| New account, setup unfinished, any app path | Redirect to `/onboarding`    |
| New account, setup unfinished, an action    | Refused, nothing written     |
| Guest visits `/onboarding`                  | Redirect to `/sign-in`       |

### Provisioning

`provisionUser` (`src/features/auth/provisioning.ts`) runs on a signed-in request:

- An existing row is returned unchanged. A disabled account is never re-enabled by signing in.
- A new identity gets a row only if it is authorised: its Clerk ID equals `INITIAL_ADMIN_CLERK_USER_ID`, or its Clerk public metadata has `appAccess: true`. Invitations sent from `/admin` attach that metadata and Clerk copies it to the account; public metadata can only be written with the secret key.
- The insert is `ON CONFLICT DO NOTHING` on the unique `clerk_user_id`, followed by a read, so concurrent first requests produce one row.

Registration itself is closed by Clerk's Restricted sign-up mode (a dashboard setting; see docs/ENVIRONMENTS.md). The metadata check is a second barrier in case that setting is ever changed. A consequence: a user created by hand in the Clerk dashboard is not admitted unless `appAccess: true` is added to their public metadata there, or they are the initial administrator.

There is no webhook. If a Clerk identity is deleted in the Clerk dashboard, the application row remains: nobody can sign in as it, the admin directory shows it as "Sign-in identity removed", and it can be disabled. Rows are not deleted in this phase.

### First-time setup

Phase 4A ([handoff](docs/HANDOFF-4A.md)). A new account goes through four steps before it reaches the application; an account that existed before there was a setup never has to, and may run the same steps from Settings.

**Three separate questions.** Clerk says who someone is. `users.status` says whether they may be here at all. `users.onboarding_status` says whether an account that may be here has to finish setup first. The third is not a role, grants nothing, and is never read by anything but the access helpers and the setup page.

**The lifecycle** (`features/onboarding/model.ts`, four columns on `users`; see docs/DATABASE.md):

| Column                    | Values                                             | Meaning                                            |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| `onboarding_status`       | `pending`, `completed`, `grandfathered`            | Whether setup is owed. A new row is `pending`      |
| `onboarding_step`         | `welcome`, `ministry`, `preferences`, `finish`     | The furthest step reached. It only moves forward   |
| `onboarding_completed_at` | A time, or null                                    | When the account finished the wizard itself        |
| `tour_state`              | `not_offered`, `offered`, `dismissed`, `completed` | Where the product tour stands (see "Product tour") |

- Setup is owed exactly when the status is `pending` (`needsOnboarding`). Nothing is inferred from the profile, the date the account was made, or what it has saved.
- **`grandfathered`** is every account that existed when migration `0014` ran, set by the migration and by nothing since. It is kept apart from `completed` so the two can always be told apart: one never owed setup, the other finished it.
- A new account needs no code to start `pending`: `provisionUser` names none of these columns and the defaults do it, which is also what makes the migration safe under the release before it.

**Enforcement is in `features/auth/access.ts` and nowhere else.** Every `(app)` page already called `requireActiveUser()` or `requireAdmin()`, and every server action and route handler `authorize("active" | "admin")`, so the rule is written once and no page, action, or route had to change:

- `requireActiveUser()` redirects a `pending` account to `/onboarding`. `requireAdmin()` goes through it, so a new administrator is held to setup too.
- `authorize("active" | "admin")` answers a `pending` account with a refusal, so an action or an API route called directly writes and returns nothing.
- `requireAccount()` and `authorize("account")` admit an active account whatever its setup. They are used by the setup page, by setup's two actions, and by the three actions it saves through (`setLocale`, `setBibleTranslation`, `updateProfile`). Nothing else may use them.
- A disabled or uninvited account is denied before setup is considered, exactly as before.
- The proxy is still routing only. `/onboarding` is in `appRoutes`, so a guest there is sent to sign-in; a new account signing in is sent by the proxy to `/dashboard` and by the dashboard's own check to `/onboarding`. The setup page asks for an account and not for a finished one, so there is no loop. A layout is not the check: the `(app)` layout does call `requireActiveUser()`, but so does every page beneath it.

**Progress** (`onboarding.ts`, behind `advanceOnboarding` and `finishOnboarding` in `actions.ts`). Each write is one statement on the caller's own row with its conditions in the WHERE clause, so two tabs, two devices, or one request sent twice cannot disagree:

- `advanceStep` sets the step only where the status is `pending` and the stored step is an earlier one. A stale or repeated request matches no row and is answered with what is stored.
- `completeOnboarding` changes only a `pending` account whose stored step is `finish`. Asked early it is refused; asked again, or by an account that owes no setup, it answers done and writes nothing. What was filled in has no say: every detail is optional.
- Neither action accepts an account. Neither writes the profile, a preference, or `tour_state`.

**The wizard** (`OnboardingWizard`, one component for both uses):

| Step        | What it holds                                                                                     | Leaving it with Continue                                                 |
| ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Welcome     | What the application is for; that the outline is structure and not a manuscript editor. No fields | Records `ministry`                                                       |
| Church      | Church name, ministry role, attending preaching class, in the same words as Settings              | `updateProfile` if anything changed, then records `preferences`          |
| Preferences | `LanguageSettings` as it is in Settings, and System, Light, or Dark over the `next-themes` store  | Records `finish`. The language and translation saved as they were chosen |
| All set     | That everything can be changed in Settings                                                        | `finishOnboarding`, then the dashboard                                   |

- What is typed stays in the browser until Continue. The save comes first and the step is recorded only when it has succeeded; a refusal or a lost connection leaves the step and the fields as they were. Back never saves and never moves what is recorded, so on a reload the wizard opens at the furthest step reached.
- No second profile model: the fields are validated by `profileSchemas`, saved by `updateProfile`, and labeled from the `settings` dictionary. The language behaves as it does in Settings, the Spanish switch included, because it is the same component and the same actions.
- `required` (a `pending` account): opens at the stored step, offers Sign out and no other way round. `review` (any other account, from "Run Account Setup" in Settings or the address): opens at Welcome with what is saved, offers "Exit setup" throughout, and calls neither setup action, so opening or finishing the steps can never reset, complete, or advance anything.
- Finishing does not start or offer the tour, and neither setup action writes `tour_state`. The dashboard offers it afterwards (see "Product tour").

### Initial administrator

The Clerk ID in `INITIAL_ADMIN_CLERK_USER_ID` becomes `admin` when its row is created. If the row already existed, it is promoted only while the table has no administrator at all. It is identified by Clerk ID, never by email; no request parameter is involved; and a role later set by another administrator is not overwritten.

### Administration

`/admin` shows real counts (users from the database, pending invitations from Clerk), the user directory, and invitations. Mutations are the server actions in `src/features/admin/actions.ts`: each calls `authorize("admin")`, validates input with Zod, and takes the acting administrator from the session. An administrator cannot change their own account. `updateUser` runs in a transaction that takes a shared advisory lock and refuses any change that would leave no active administrator. Clerk is the source of truth for invitations; "resend" sends a new invitation and then revokes the old one.

Disabling an account takes effect on that person's next request, because status is read from the database every time. Their Clerk session is not revoked; it simply no longer grants anything.

### Dashboard

`/dashboard` is the workspace: what the person is developing, what they have left alone, what they captured and preached lately, and four counts. It greets by first name (`welcomeTitle`, with a nameless fallback, also used if Clerk cannot be reached) and renders `DashboardView` (`features/dashboard`), a server component that only lays out what the page read. Nothing on it is instruction, and there is no activity feed, event log, or stored counter behind it: every section is a bounded read of the tables the features already keep.

**Layout.** The header (`PageHeader`) has the greeting, one line, and three actions. Beneath it, four panels in one grid, in priority order, which is also the order on a phone: Continue Working (two columns of three) beside Revisit an Idea, then Recent Ideas (two of three) beside Recent Preaching. At a Glance is last, a `StatStrip` under its own heading.

**What is read.** The page asks `requireActiveUser()` first, then runs these together. Each names the owner in its own WHERE clause and is filtered, ordered, and limited by the database.

| Section                                   | Query                                                                                                | What it is                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Continue Working                          | `continueWorking(db, owner)` (`ideas.ts`), then `outlinesForSermons(db, owner, ids)` (`outlines.ts`) | Up to four sermons that are not archived, are at `idea` or `developing` (`activeStatuses`), and have a `last_developed_at`; most recently developed first, the ID settling a tie. Then one query for those sermons' outlines: ID, `updated_at`, and a count of entries over a join. No entry is read. |
| Revisit an Idea                           | `revisitIdeas(db, owner)`                                                                            | Unchanged: see "Revisiting".                                                                                                                                                                                                                                                                          |
| Recent Ideas                              | `recentIdeas(db, owner, 5)`                                                                          | The five most recently changed ideas of every kind, archived ones left out. The rows only: no passages or tags are loaded, because none are shown.                                                                                                                                                    |
| Recent Preaching, and Times Preached      | `searchHistory(db, owner, defaultHistoryQuery, 3)`                                                   | The three latest occasions and, from the same call's `total`, every occasion ever recorded.                                                                                                                                                                                                           |
| Sermon Ideas, Point Ideas, In Development | `workspaceCounts(db, owner)` (`ideas.ts`)                                                            | One statement, three `count(*) filter (where …)` over the ideas that are not archived. In Development is sermons at `developing`.                                                                                                                                                                     |
| The recording form's lists                | `listVenues`, `listContexts`                                                                         | As on the Preaching Record.                                                                                                                                                                                                                                                                           |

- **Continue Working and Revisit are different questions.** The first is what is being developed now and is ordered by `last_developed_at`, so a change of status, tag, kind, archive, or preaching record never brings a sermon in or moves it up, and a sermon only captured is not there until its content is worked on (it is in Recent Ideas). `ready` and `on_hold` are left out. The second is what is unfinished and neglected, and its rule is still `needsAttention`. Neither has a second copy of the other's rule.
- **A sermon's row** says its status, when it was last developed (`DevelopedLine`), and whether it has an outline and how much is in it. With an outline the action is "Resume Outline", a link to the editor, with "Open Sermon" beside it; without one it is "Open Sermon", with `OutlineLink` to `/outlines/new?sermon=<id>`. All are links: nothing on the dashboard makes an outline, and there is no outline status or measure of progress, because an outline has none. The row is not one link, so the title is underlined.
- **An occasion is not its sermon.** Recent Preaching lists occasions, so a sermon preached twice is two rows, and one whose sermon was since archived or refiled is still listed and says so. A row shows only what was recorded (date, AM or PM, venue, context) and leads to that sermon's record (`sermonHistoryHref`).
- **Actions.** Capture is `CaptureButton` (hidden below `md`, where the tab bar has it). "Start or open outline" (`DashboardOutlineButton`) mounts the overview's own `CreateOutlineDialog`. "Record preaching" (`DashboardRecordButton`) opens the one `OccurrenceDialog` through `RecordPreachingProvider`. No dialog, action, or rule was written for the dashboard, and opening any of the three saves nothing.
- **Empty and partial.** With no active idea and nothing preached, the sections and the two secondary actions are replaced by one invitation, "Start with an idea", with the capture button; the figures are still shown, as zeros. Otherwise each section answers for itself: Continue Working and Revisit say in a line that there is nothing; Recent Preaching says so only where there is a sermon to preach (`counts.sermons > 0`) and is otherwise left out; with no active idea but a preaching record, only Recent Preaching is shown.
- **Failure.** A figure that could not be counted is null and reads "Unavailable", never zero: `workspaceCounts` is the one query the page catches, because the workspace is whole without it. Any other query that fails goes to the `(app)` error boundary. An empty result is never how a failure is shown.
- **Freshness.** The page is rendered per request. The idea, preaching, and outline actions revalidate `/dashboard`; a save of an outline's words or passages revalidates nothing, by rule, so the dashboard also asks again when a copy of it the browser kept is shown again (`useFreshOnReturn`, `src/lib/use-fresh-on-return.ts`, shared with the outlines overview). There is no polling.
- **Indexes.** None was added. Every read is within one owner (`ideas_owner_updated_idx`, `UNIQUE (sermon_id)`, `preaching_occurrences_owner_date_idx`), and what is left to sort or count is one account's ideas.
- **For the tour (Phase 4B).** The sections, the three actions, and the navigation carry `data-tour` names (`dashboard-workspace`, `continue-working`, `revisit-ideas`, `recent-ideas`, `recent-preaching`, `at-a-glance`, `start-outline`, `record-preaching`, `quick-capture`, `nav-<destination>`, and `tab-<destination>` in the tab bar), and the library's section links have `section-sermon-ideas`, `section-saved-scripture`, and `section-preaching-record`. The product tour reads them (see "Product tour"); keep them stable.
- **The tour's invitation** (`TourInvitation`) is the one thing on the dashboard that is not a read: for an account `shouldOfferTour` admits, a card under the header, above the sections or the "Start with an idea" panel, which it leaves as they are. It is a card in the page, not a layer over it, and it is not in the landing page's reconstruction (the fictional account is not new).

There is no analytics route or link; that page has no phase yet (see the roadmap).

### Product tour

Phase 4B ([handoff](docs/HANDOFF-4B.md)). An optional walk through the real application, offered once on the dashboard after first-time setup and run again at any time from Settings. `src/features/tour`.

**Where it stands is `users.tour_state`** and nothing else (no migration was needed: Phase 4A left the column). The step in progress is the browser's alone and is not kept anywhere.

| From                       | To          | Written by                                                                           |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `not_offered`              | `offered`   | `offerTour`, when the invitation is shown, and only for a `completed` account        |
| `not_offered` or `offered` | `dismissed` | `dismissTour`: "Maybe Later", or the tour skipped (Skip Tour, Escape) before its end |
| anything but `completed`   | `completed` | `completeTour`: Finish Tour on the last stop                                         |

- Each write (`tour.ts`) is one `UPDATE` on the caller's own row with its condition in the WHERE clause, as first-time setup's are, so a repeat, a second tab, or a stale request changes nothing. The state only moves on: a dismissed tour can be completed by running it again; a completed one stays completed, however the replay ends.
- The actions (`markTourOffered`, `dismissProductTour`, `completeProductTour` in `actions.ts`) `authorize("active")`, take the account from the session, accept no input, and revalidate `/dashboard` only when a row changed.
- **Who is invited:** `shouldOfferTour` (`model.ts`): `onboarding_status = 'completed'` and `tour_state` `not_offered` or `offered`. An account from before setup existed (`grandfathered`) is never interrupted with it; it finds the tour in Settings. Running setup again from Settings changes nothing about the tour.
- **Restarting is a replay, not a state.** "Restart Product Tour" (Settings, App & Experience, beside "Account setup") calls `useTour().start()` and writes nothing; it resets no setup, profile, preference, or data.

**The overlay** (`TourProvider`, `components/tour-provider.tsx`) is mounted once in the `(app)` shell, so it carries on while the application's own router moves between pages. It draws nothing of the application: the page beneath is the real one.

- Seven stops (`steps.ts`): Your Dashboard (`/dashboard`), Capture an Idea, Your Library (`/library`), The Bible (`/bible`), Outlines (`/outlines`), Preaching Record (`/library/preaching-record`), and You're ready to begin (`/dashboard`). A stop on another page is reached with `router.push`, so the progress bar runs as for any navigation.
- Each stop points at a `data-tour` name: the bar's from `md` up, the tab bar's below. It waits for the page and the element (3 seconds; 8 for a page that never arrives), then shows the stop anyway, in the middle with nothing lit. So a new account's dashboard, which has none of the sections, is no problem: the first stop names only the sections that are there and says more will come. Nothing is seeded, opened, or saved to make a stop work.
- The Bible stop names only the translations on offer (`useReading()`), so with Spanish switched off it says nothing of the RVG. It changes no preference.
- It is Base UI's modal `Dialog`, as every modal layer here is: focus is kept in the card, everything behind is inert, Escape skips the tour, and focus goes back to what started it (or to the page's heading when that is gone, as the invitation is). Clicking the dimmed page does nothing. The card says "Step n of 7", with dots, and announces each stop politely.
- The page is dimmed but for one rounded light around what is pointed out (a single element whose large shadow is the dim, with the focus ring's color on its edge), which moves from one to the next in 0.3 seconds and does not move under reduced motion. A tall part of the page is lit as far as it is seen.
- From `md` up the card sits just beneath what it points at (centred on it as the window allows), in the corner beside a large part of the page, or in the middle. Below `md` it is a sheet docked just above the tab bar, so the tab it points at stays in view; it scrolls inside itself on a short screen, and its buttons are 44px on touch.
- Next and Back never need anything done first. While a stop's page is on its way they wait (`aria-disabled`, not `disabled`, so focus stays on them).
- Its words are the `tour` dictionary, in both languages.

### Ideas

One record, three kinds. `features/ideas/model.ts` holds the vocabulary (kinds, statuses, sermon types, length limits) as plain values, so the schema, the actions, and the browser read one list.

- **Service** (`ideas.ts`): `createIdea`, `getIdea`, `recentIdeas`, `continueWorking`, and `workspaceCounts` (the dashboard's; see "Dashboard"), `searchIdeas` (the library), `updateIdea`, `attachReferences` (see "Scripture on an idea"), `setIdeaKind`, `deleteIdea`. Each takes the database and the owner, and **every statement has the owner in its WHERE clause**. An idea that is missing and one that belongs to someone else are indistinguishable, here and in every message. References are replaced in the same transaction, and only after the owner-scoped write matched a row.
- **Actions** (`actions.ts`): `createIdea`, `updateIdea`, `attachScripture`, `changeIdeaKind`, `deleteIdea`. Each calls `authorize("active")`, validates with Zod, and takes the owner from the session. No input can name an owner: the schema drops unknown keys and the service names each column it writes.
- **Create is idempotent.** The browser generates the UUID before the first attempt; the insert is `ON CONFLICT (id) DO NOTHING` followed by an owner-scoped read. A double submit or a retry is one idea; an ID that exists under another account fails without revealing it.
- **Classifications** (status, intended format, sermon type) and **archiving** are described under "Classification" below. `classifyIdea`, `archiveIdea`, and `restoreIdea` are the service functions and the actions of the same names.
- **Reclassifying changes only `kind`.** A sermon's type and subject stay in their columns when it becomes a point or undecided, and return when it becomes a sermon again. The editor applies a reclassification at once, separately from Save.
- **Pages**: `/library` reads its query from the URL and shows one page of results (see "Library" below). `/library/<id>` validates the ID as a UUID before querying and calls `notFound()` for anything the owner-scoped query does not return.
- **The editor follows the saved idea.** Next keeps a page it has left, so the editor can be on screen, or kept, while the idea changes elsewhere (a passage added from the Bible, another tab). When the server sends the idea again, an editor with nothing unsaved simply shows it; one with edits under way keeps them and brings in only the passages added elsewhere, so the next Save cannot take them off again.

### Classification

Phase 2D.1 built the data model and Phase 2D.2 the interface (see "Classification in the interface" at the end of this section). Every idea, of any kind, carries three classifications and an archive date. They are four columns of `ideas`, each a fixed list of values checked by the table, by Zod, and by TypeScript from one list in `features/ideas/model.ts`. There are no definition tables and nothing an account can add to: these are the product's words, not a person's taxonomy (tags are that).

| Classification     | Column            | Values                                            | A new idea    |
| ------------------ | ----------------- | ------------------------------------------------- | ------------- |
| Development status | `status`          | `idea`, `developing`, `ready`, `on_hold`          | `idea`        |
| Intended format    | `intended_format` | `full_length`, `mini`, `flexible`, `unspecified`  | `unspecified` |
| Sermon type        | `sermon_type`     | `topical`, `textual`, `expository`, `unspecified` | `unspecified` |
| Archived           | `archived_at`     | A date, or null                                   | null          |

- **Status is changed by hand and by nothing else.** Any status may follow any other. Nothing moves it: not a date, a note, a tag, a passage, or, later, a sermon being preached. There is no Inbox and no Preached status. Whether and how often a sermon was preached will be read from preaching-history records (Phase 2E); no column here records it, and none should be added.
- **Intended format is what the sermon is meant for**, not what happened on an occasion. A sermon marked Full-Length may once have been given as a five-minute mini sermon; each occurrence will keep the format actually used, and changing this column never rewrites that. There are no duration thresholds, a mini sermon is not a preaching-class sermon, and changing a format never makes a second record.
- **Sermon type is one primary type**, or `unspecified`. Verse-by-verse preaching is a kind of expository preaching, not a fourth type. Nothing infers a type from an idea's content.
- **Format and type belong to a sermon.** Like `subject`, they are kept when an idea is reclassified and given back when it becomes a sermon again; the library shows a type, and filters by it, on sermons only.
- **Archiving is not a status.** `archiveIdea` sets `archived_at` (to the first moment asked, so a repeat keeps it) and `restoreIdea` clears it. Neither touches the status, the format, the type, the notes, the references, the tags, the kind, or `updated_at`: putting an idea away is not an edit, and it comes back exactly as it went. It is not deletion and not a soft delete; `deleteIdea` is unchanged. Where an archived idea is listed is decided by the query, not the screen: see "Classification in the interface".

**The words** are in the `ideas` dictionary, in both languages: `statuses`, `formats`, and `sermonTypes` are the labels; `statusMeanings` and `formatMeanings` say what each means; `sermonTypeGuide` holds each type's definition and example. `classificationOptions(locale)` (`features/ideas/classification.ts`, no server code) returns all of it as lists in the model's order, which is what a control that chooses one renders. Nothing about a person is in these lists, and nothing about them waits on onboarding.

**Validation and saves** (`schemas.ts`).

- `ideaInput` is a new idea's input (and the editor's whole draft): a classification left out gets its default.
- `ideaUpdate` is what `updateIdea` parses: the same, but the three classifications have **no default**. One that is left out is undefined, an undefined column is not written, and so it stays as it was. Before this phase a save that named only the title put the status back to its default. Content fields (`kind`, `notes`, `subject`, `references`) keep the whole-record behavior they had: the editor always sends them all.
- `classificationInputSchema` is a change to the classifications alone: any of the three, at least one. It is what `classifyIdea` takes, on the pattern of `changeIdeaKind`.
- A value on no list is refused everywhere, by Zod and then by the table's CHECK.

**Values from before this phase.** `status` was `captured`, `developing`, or `ready`, and `sermon_type` was `topical`, `expository`, or null. Migration 0007 widened the table and rewrote no row, because the deployment live while it ran still wrote `captured` and null. Migration 0008 (Phase 2D.3) then rewrote `captured` to `idea` and null to `unspecified`, and the table refuses both (docs/DATABASE.md). What is left of them:

- `asRead` in `ideas.ts`, which every read and every returned row passes through, still reads a `captured` as `idea` and a missing type as `unspecified`. On a migrated database it changes nothing. It is a guard for a database 0008 has not reached (a preview deployment shares the development database), and it maps those two values and no others.
- Nothing writes either value, and the table would refuse it.
- The library's filters match the current values only. An address with `status=captured` still reads as `status=idea`: that is an old bookmark, not stored data.

**Classification in the interface (Phase 2D.2).** No migration and no new action: the screens use what 2D.1 built.

- **`ClassificationSection`** (`features/ideas/components/classification-section.tsx`) is the one control, in the editor and in quick capture's "More details". It is a disclosure (`aria-expanded`), closed by default, whose closed line says what the classifications are ("Developing · Full-Length · Textual"; a format or type nobody chose is left out). Open, it is one `Select` per classification with the chosen value's meaning beneath. A sermon has all three; a point or an undecided idea has its status only, and the format and type its draft holds are kept unseen, as its subject is. An information button beside the sermon type opens a `Popover` (click, tap, or keyboard) with every type's definition and example and a line saying the types are a primary classification, not boundaries. It only changes the draft; the form it sits in saves, so the editor still sends the whole draft through `ideaInput` and quick capture creates with it.
- **Archive and restore are on the idea's page.** Archive sits beside Delete and asks first, in the shared `ConfirmDialog`, saying the idea is hidden and not deleted. An archived idea shows a notice with the date and a Restore button in its place. Both are their own step, as reclassifying is: they call `archiveIdea` / `restoreIdea`, leave the draft and any unsaved edits alone, say nothing until the server answers, and then refresh the page. An archived idea can still be opened and edited; a save never touches `archived_at`.
- **The library leaves archived ideas out in the query.** `LibraryQuery.archive` is `active` (the default), `archived`, or `all`, and `libraryConditions` turns it into `archived_at IS NULL`, `IS NOT NULL`, or nothing, so the count and every page agree. `LibraryQuery.formats` filters by intended format among sermons only, like the type filter: the default a point's row holds is not a format. A status filter matches every kind.
- **What follows the default.** The idea picker (`/api/ideas/search`) searches with the default query and so never offers an archived idea. `recentIdeas` (the dashboard) excludes them itself.
- **What deliberately does not.** `getIdea` returns an archived idea, so its address, the Bible reader's way back to it (`idea`), and its editor all still work. `attachReferences` does not check; nothing offers an archived idea to it. A tag's `ideaCount` counts archived ideas, because it is what "this tag comes off N ideas" must say.
- **In a result** an archived idea carries an "Archived" badge, apart from its status, and a Restore button (`library/restore-button.tsx`, a small Client Component above the card's link). A sermon's format is named beside its type where one was chosen.
- **Empty states.** A library with nothing active but something archived says "Every idea is archived" and leads to them (`archivedCount`), instead of inviting the same thought to be captured again. The archive asked for and found empty says so and leads back.

**What later phases need from this.** A sermon is still one `ideas` row with one ID, whatever it is classified as and however often it is preached, so a preaching occurrence (2E) and an outline (Phase 3) can both point at it; a point is still its own row, and a classification change touches no other row. IDs can already be made in the browser, every value is a short string that can be checked without the server (`model.ts` and `schemas.ts` have no server code), and the changes go through three small actions, which is what offline work (Phase 5) will need.

### Revisiting

Phase 2F.1 ([handoff](docs/HANDOFF-2F.1.md)). An idea has three dates that mean different things: `created_at`, `updated_at` (moved by any write to the row, a status or kind change included), and `last_developed_at`, which says when its content was last worked on.

- **`ideas.last_developed_at`** (migration `0010`) is nullable with no default and no backfill. Null means the idea has not been worked on since it was captured. When an idea was last worked on is `coalesce(last_developed_at, created_at)`, so an idea from before the column is measured from its creation: the migration made nothing look active, and no later administrative change can.
- **What sets it.** `updateIdea`, when the title, subject, notes, or passages (which ones, their order, the main text) differ from what is stored; `attachReferences`, when a passage was added; and, since Phase 3C, `markDeveloped`, which the outline services call when work on a sermon's outline changed what the outline says (see "Outline work is development" under "Outlines"). The editor sends the whole draft, so `updateIdea` reads the row `FOR UPDATE`, compares, and stamps only on a difference. **Nothing else sets it:** not `createIdea`, `classifyIdea`, `setIdeaKind`, the tag actions, `archiveIdea`, `restoreIdea`, making or deleting an outline, changing its numbering, or anything in `features/preaching`.
- **One rule, two places.** `needsAttention` in `ideas.ts`: a sermon, with a status in `unfinishedStatuses` (`idea`, `developing`, `on_hold`; `ready` is the finished one), last worked on `revisitAfterDays` (30, in `model.ts`) or more ago. There is no setting for the number. Preaching history is not consulted: a preached sermon is finished only if its status says so.
- **The dashboard** asks `revisitIdeas(db, owner)` for at most three: that rule, not archived, ordered by ideas never developed, then developed, then on hold, the longest wait first, the ID last. The database filters, orders, and limits. `RevisitIdeas` draws them, each with its status and `DevelopedLine` ("Never developed · created …" or "Last developed …"). With no active idea the section is not drawn; with ideas but none eligible it says so and links to Sermon Ideas. Nothing is added to fill three places.
- **The library** has `revisit` in its query (`never` or `attention`, one at a time; URL parameter `revisit`). `never` is a sermon with a null `last_developed_at`, whatever its status or age; `attention` is `needsAttention`. Both find sermons only and combine with every other filter, the archive view included. While one is in force each result shows `DevelopedLine` in place of its "Updated" date. The orders are unchanged and still sort by `updated_at` or `created_at`; none sorts by development.

### Related ideas

Phase 2F.2 ([handoff](docs/HANDOFF-2F.2.md)). A person can say that two sermon ideas go together, and that a point idea goes with a sermon. Both are plain associations made by hand. They are not content, not an outline, and not development.

- **Two tables** (migration `0011`), each with the owner repeated and part of both foreign keys, as in `idea_tags`, so the database refuses a relation across accounts; both keys are `ON DELETE CASCADE`, so deleting an idea removes its relations and nothing else.
  - `sermon_relations (sermon_a_id, sermon_b_id, owner_id)`: a relation between two sermons has no direction, so each pair is stored once, lower ID first. `CHECK (sermon_a_id < sermon_b_id)` refuses a sermon with itself and a pair written the other way round; the primary key refuses it twice. Reading looks at both columns (`sermon_relations_sermon_b_idx` serves the second).
  - `sermon_points (sermon_id, point_id, owner_id)`: one point may go with any number of sermons and stays one record. No order, no notes, nothing written for one sermon.
- **One service, `src/features/ideas/relations.ts`**, the only code that reads or writes either table. `linkIdeas` locks both ideas' rows (`FOR UPDATE`, lower ID first), checks that both are the owner's and that the pair is two sermons or a sermon and a point, and inserts with `ON CONFLICT DO NOTHING`: a repeat, the reverse, and two requests at once all leave one row. `unlinkIdeas` deletes the pair whichever way round it is named and is no error when there was nothing. `relatedIdeas` reads them for a page. A foreign key cannot say what kind an idea is, so the service does.
- **Nothing here writes to `ideas`.** Relating and unrelating move neither `updated_at` nor `last_developed_at`, on either side, and change no status and no archive date.
- **Actions** `relateIdeas` and `unrelateIdeas` (`relation-actions.ts`) authorize themselves, take the owner from the session, and answer `missing` alike for an idea that does not exist and one that is someone else's.
- **Archived ideas are shown and offered, marked "Archived".** This is the one list of ideas, and the one picker, that does not leave them out: a relation outlives archiving, and relating an archived idea does not restore it. The picker asks `/api/ideas/search` with `archived=all`; without that parameter the route still never offers one, so the Scripture picker is unchanged. The library's own default is unchanged.
- **Reclassifying hides, never deletes.** A relation whose idea has since been filed as something else is kept in its table and left out by `relatedIdeas` (which matches on the current kind), and is shown again if the idea is filed back.
- **Interface.** `RelatedIdeas` on the idea's page, between the form and the preaching record, outside the draft: Related Sermons and Related Points on a sermon, the sermons it goes with on a point, nothing on an undecided idea. Each row links to the idea (carrying the page's `from`, so "back" still returns to the library as it was left), shows its status, and has a remove button that is not confirmed, since removing loses nothing. `RelateIdea` is the picker; it and `AttachScripture` share `useIdeaSearch`. There is no page, navigation item, or library filter for relations.
- **Not an outline.** Phase 3's outline entries are to be their own table, with order and whatever is written for one sermon, and are to name a point directly: a point need not be in `sermon_points` to be placed in an outline, and placing one need not add a row there. Do not add a position or any per-sermon column to either table.
- **Suggestions are deferred.** Nothing proposes a relation. If something later does (shared passages, subjects, tags), it is to be shown apart from saved relations and never to save one without the person choosing it.

### Outlines

Phase 3A ([handoff](docs/HANDOFF-3A.md)) is the data and persistence: `src/features/outlines/`, three tables, migration `0013`. Phase 3B ([handoff](docs/HANDOFF-3B.md)) is the editor, described under "Outline editor" below; it added no table. Phase 3C ([handoff](docs/HANDOFF-3C.md)) joined outlines to the rest of the application, with no migration: the overview and its place in the navigation, the ways to an outline from a sermon, saved points and passages in the editor, and the decision that outline work is development. It is described under "Outlines among the rest" below. The tables are in [docs/DATABASE.md](docs/DATABASE.md).

An outline holds the shape of a sermon: short headings, brief notes, passages, and points under points. It is not where a sermon is written, and nothing here is a document editor.

- **One outline to a sermon, and never without one.** `sermon_outlines` names an `ideas` row with its owner; `UNIQUE (sermon_id)` is what makes it one. `createOutline` checks that the idea is a sermon with the idea's row locked, as recording an occasion does, and answers a second request with the outline there is (`exists`). An outline has no status: it is there or it is not, and one with no entries is still an outline.
- **It follows its sermon and never writes to it.** Deleting the sermon deletes its outline (the key is `ON DELETE CASCADE`, as for references and tags); deleting the outline leaves the sermon exactly as it was. An outline is kept when its sermon is archived or filed as something else: `getOutline` still returns it, and `listOutlines` leaves it out, as every list of ideas leaves out an archived one, until it is asked for or filed back. **Nothing in `features/outlines` writes to `ideas` but `markDeveloped`**, and that moves two dates and nothing else: see "Outline work is development" below.
- **Outline work is development (Phase 3C).** A write that really changed what an outline says ends by calling `markDeveloped` (`features/ideas/ideas.ts`) for the outline's sermon, in the same transaction, which sets `updated_at` and `last_developed_at` to now, as a passage added to an idea from outside its editor does. It changes no status, no format, no sermon type, and no archive date, and nothing in preaching history. The rule for what counts is in `entries.ts` and nowhere else:
  - words that differ from what was stored (`updateEntry` reads the entry again under its locks and compares; the same words sent again are not a change);
  - a passage list that differs, in which passages or in their order (`setEntryReferences`);
  - an entry added, removed, or moved that **bears content**: it, or anything under it, has a heading, notes, or a passage.

  Not development: an empty point added with Enter, an empty point moved or removed, a move to where the point already is, a retried addition (`existing`), anything stale or refused, making an outline, deleting one, and changing its numbering. `needsAttention` and the revisit threshold are unchanged; they read the dates this moves.

- **Entries are one table, `outline_entries`, and three types**: `introduction`, `point`, `conclusion`. A point is a point at any depth; a subpoint is a point with a `parent_id`, and there is no limit on depth. What bounds an outline is `outlineLimits.entries` (500). The introduction and the conclusion are optional, at most one of each, under nothing, over nothing, never moved, and never numbered; they are shown first and last whatever order they were made in.
- **Order is `position` among the points with one parent**, always 0, 1, 2, … with none missing. The order an outline is shown in is worked out by `orderEntries` (`tree.ts`): the introduction, each point followed by what is under it, the conclusion. Nothing in `tree.ts` or `numbering.ts` calls itself, so depth cannot overflow a stack.
- **A number is never stored.** A title is "The Importance of Prayer", never "I. The Importance of Prayer". `numbering.ts` works a label out from where an entry is and the outline's `numbering_config`, in the browser or on the server, so moving a point renumbers the outline and changing the style changes one column.
- **Numbering** is a built-in style by name (`traditional`, `decimal`, `numeric`, `alphabetic`, `roman`, `bullets`, `none`) or a custom one in full: up to 12 levels, each with a counter (`decimal`, `alpha`, `roman`, `bullet`, `none`), a case, a prefix and a suffix, and whether the levels above are joined to it and by what; and what a level deeper than the last uses (`repeat` from a level, `last`, or `none`). A built-in style is an ordinary configuration (`numberingPresets`), not a special case. Letters go on past Z as AA, AB; Roman numerals are written to 3,999 and in digits beyond; a label is never longer than 64 characters and keeps its end. Prefixes, suffixes, and separators are short, one line, and without control characters or angle brackets, and are only ever shown as text. A stored configuration that cannot be read is read as the default.
- **Every write takes its locks in one order: ideas, then the outline, then its entries** (`lockForWrite` in `entries.ts`), and holds them to the end of its transaction, so writes to one outline run one after another. The sermon's row comes first (`FOR NO KEY UPDATE`) because the write may end by moving the sermon's dates, and deleting a sermon holds the idea and then reaches for its outline: taken the other way round, the two would wait on each other. An entry made from a saved point holds the point too (`FOR KEY SHARE`, against deletion), the two ideas lower ID first, as `linkIdeas` takes two. Then the outline's row (`FOR UPDATE`). A change of shape (add, move, remove) then reads every entry, checks the whole change in memory (`planInsert`, `planMove`, `planRemove`), and writes all of it or none. Refused, with nothing written: a parent that is not a point of the same outline, a point under itself or one of its own subpoints, a second introduction or conclusion, a move of either, and more than an outline holds.
- **A subtree moves by one row.** Moving a point changes its own `parent_id` and `position` and the positions of the points it leaves and joins; what is under it follows. Rows are set aside at negative positions and then given their places, in two statements, because the table refuses two points at one place even for a moment.
- **Two revisions, counted apart.** `sermon_outlines.revision` moves when the shape changes; `outline_entries.revision` moves when that entry's words change (title, notes, passages). A change may name the revision it was made against (`expectedRevision`) and is then refused as `stale` when another got there first; left out, it is made against what is there. A move does not make an edit stale, and an edit does not make a move stale. An entry's ID may come from the browser, and the same ID twice returns the first row unchanged.
- **A saved point and an entry are two things.** An entry made from a point idea (`sourcePointId`) copies the point's title and notes where the request gives none, and the point's passages (in the point's order, none twice, as many as an entry holds), and remembers the point. After that they are edited apart, and nothing is ever written to the point. One point may be the source of any number of entries in any number of outlines. Deleting the point clears the link and keeps the entry. `sermon_points` is not read or written here and has gained nothing.
- **Passages on an entry** are `outline_entry_scripture_references`: the same five numbers as on an idea, validated with the same `features/scripture/reference.ts`, and no text and no translation. `setEntryReferences` replaces an entry's list, and is the only thing that changes one after the entry is made. The editor shows them beneath an entry's notes (see "Outlines among the rest").
- **Actions** (`actions.ts`): `createOutline`, `setOutlineNumbering`, `deleteOutline`, `addEntry`, `updateEntry`, `setEntryReferences`, `moveEntry`, `removeEntry`. Each authorizes itself, takes the owner from the session, and answers `missing` alike for what does not exist and what is someone else's. Beside the message they answer with a `code` for the editor to act on (`stale`, `stale_entry`, `cycle`, …), the outline's `revision` after a change of shape, and the entry after a change to one. Reading is not an action; a page calls `getOutline`, `getOutlineForSermon`, or `listOutlines`. The editor's page (`/outlines/<id>`) and the overview (`/outlines`) are revalidated when an outline is made or deleted, when its shape changes, and when its numbering does. Neither is revalidated when an entry's words or passages are saved: that happens about once a second while someone types, and a revalidating action sends the whole page back with its answer.

#### Outline editor

Phase 3B. `/outlines/<id>` is one outline open for editing; `/outlines/new?sermon=<id>` is where a sermon is given one (it sends a sermon that has an outline on to it, offers one "Create outline" button to a sermon that has none, makes nothing by being opened, and tells an idea that is not a sermon why it cannot have one). Both check access themselves and answer a malformed, missing, or foreign ID with the same not-found page. `/outlines` is the overview.

- **One owner of the outline in the browser: `editor/store.ts`.** `createOutlineStore` holds the rows, the numbering, the save state, conflicts, and lost drafts, with no React in it; `OutlineEditor` reads it with `useSyncExternalStore` and asks it for every change. Display order and labels are derived each render with `orderEntries` and `numberOutline`, and a change of shape is applied locally with `planInsert`, `planMove`, and `planRemove`: the same `tree.ts` the server uses. There is no second tree.
- **Autosave.** There is no Save button. A change is shown at once and sent after, through one queue, one request at a time, in the order the changes were made. A change of shape goes at once and names the outline's revision from the answer before it. Words go about 0.9 seconds after the typing stops, or at once when the field is left or the page is hidden: only the fields that differ from what the server last acknowledged, naming the entry's own revision. A new entry's ID is made in the browser, so sending an addition again adds nothing.
- **An answer never writes over a field.** It says what the server now holds. Text typed while a request was away is still unsaved and is sent next. "Saved" is shown only when nothing is queued, nothing is on its way, and no field differs from what was acknowledged; text is compared as the schema tidies it, so a space typed after a word is neither a change nor removed.
- **The five save states**: Saved, Saving, Unsaved changes, Save failed (with the reason and "Try again"), Needs your attention (a conflict or a lost draft). A failure of the network or the database is tried again after 2, 5, and 15 seconds and when the browser comes back online, then waits to be asked. A refusal with no `code` (signed out, disabled) is not retried.
- **A stale or refused change of shape reads the outline again** (`router.refresh()`), and is never sent twice. What comes back is adopted; what was typed and not saved is kept; changes of shape still queued are dropped, and a notice says so. An entry that is no longer there leaves its unsaved text as a **lost draft**, to add again as a point or discard.
- **A stale entry is merged field by field** against the text this browser last knew: a field changed only elsewhere is taken, one changed only here is sent again, and one changed in both to different text is a **conflict** on that entry, with "Keep mine" and "Use the other". Nothing is written for it until one is chosen.
- **A copy of the outline from the page** (after a revalidating action, or a refresh) is taken only when no change of shape is queued and it is not older than what the store knows.
- **Leaving.** The store goes on saving after its page is hidden or left, so in-app navigation is held by `useLeaveGuard` only when a save has failed or a conflict is open. Closing or reloading the tab warns while anything is unsaved.
- **Moving a point** is `store.move(id, parentId, index)`, reached three ways: the row menu, Alt+Shift with an arrow in a heading, and dragging by the grip. `editor/moves.ts` says where up, down, indent, outdent, and "move to top level" lead; `editor/drop.ts` (`projectDrop`) says where a drag would land from a gap in the list and how far across the pointer is. Dragging is Pointer Events on the grip alone (`use-outline-drag.ts`), with no package; it is never the only way.
- **Keys in a heading**: Enter adds a point below, Ctrl or Command with Enter a subpoint, Backspace removes a point that is empty and has nothing under it. Tab is never taken. Deleting anything else asks first and says how many points go with it.
- **Indentation is bounded in CSS** (`min(depth × step, cap)`), never in the data; from the seventh level a small marker says the level. Which points are folded is a preference of the browser (`editor/collapsed.ts`, `localStorage`, by outline), as the library's view is.
- **Numbering** is chosen in `NumberingDialog`: the seven built-in styles and Custom, as a draft with a sample outline numbered by `entryLabel`, checked by `numberingConfigSchema`, and saved only on Apply.
- **Passages on an entry** are a third field of its words in the store, beside the heading and the notes: `store.setReferences(id, update)` shows the change at once and queues a `references` operation, which sends the whole list through `setEntryReferences` with the entry's own revision, in its turn. It is saved at once (a passage is chosen, not typed), never revalidates, is compared for "Saved" as the words are, is kept and tried again after a failure, and is merged on a stale entry like any field: changed only elsewhere it is taken, changed only here it is sent again, changed in both to different lists it is a conflict with "Keep mine" and "Use the other". A lost draft keeps its passages.
- **A saved point is placed** with `store.addPoint(parent, index, { title, sourcePointId })`. The addition is sent with `sourcePointId` and no words, so the server makes the copy; the row shows the point's title meanwhile, and when the answer arrives each field the person has not touched is filled from the copy, while one they changed stays theirs and is saved next. An answer still never writes over what was typed.

#### Outlines among the rest

Phase 3C. No table, no migration, no package.

- **The overview, `/outlines`.** The main navigation's Outlines. It lists outlines, not sermons: a sermon with no outline is not there, and neither is the outline of an archived or refiled sermon (which is kept and still opens from its sermon's page). `listOutlines` takes the search and the order: `q` matches the sermon's title (every word, `ILIKE`, as the library's search), and the order is one of `outlineSorts` through a fixed map (`updated-desc` the default, `updated-asc`, `title-asc`, `title-desc`, `created-desc`), each ending with the ID. It reads one page of outlines with a count of entries worked out by the database, and no entry of any. The query is the address (`outlines-query.ts`: `q`, `sort`, `page`, read leniently, written with defaults left out), and the controls change it only through `useOutlines().apply`, on the same `useQueryNavigation` the library's sections use. A card shows the sermon's title, the sermon's own status, how many entries the outline holds, and when it was last worked on; the card opens the editor and a quiet link opens the sermon. There is no status filter and no archive view: an outline has no status.
- **Activity is `sermon_outlines.updated_at`**, which every write to an outline moves already (a change of shape, words, passages, numbering). Nothing was added to record it. The overview is rendered for each request and so shows a save made a moment ago; it is not revalidated by a save of words. Next keeps a page it has left and shows that copy on Back, so the overview asks again when it is shown again (`useFreshOnReturn`, `src/lib/use-fresh-on-return.ts`, which the dashboard uses too).
- **Making an outline** is still only `createOutline`, under the idea's row lock, with `UNIQUE (sermon_id)` behind it. Three ways lead to it:
  - **From the overview**, `CreateOutlineDialog`: a picker of the account's active sermons on `useIdeaSearch` (archived ones are left out, as in every picker but Related Ideas'). The search is asked with `outline=1`, so each sermon says which outline is its own; one that has an outline opens it, and one that has none is given one (`useStartOutline`, with an ID made in the browser) and opened. An answer of `exists` carries the outline's ID and is opened like any other.
  - **For a sermon not captured yet**, the picker's "New sermon idea" hands over to quick capture with `openWith({ kind: "sermon", onSaved })`. The sermon is saved by the existing capture, with its classifications as they are there; only then is its outline made and opened. Nothing is saved by opening or abandoning either dialog, and an idea saved as something other than a sermon gets no outline and is told so.
  - **From a sermon**, `OutlineLink`: on the sermon's page beside Record preaching, and on its card in Sermon Ideas. With an outline it is "Open Outline" to the editor; without one it is "Create Outline" to `/outlines/new?sermon=<id>`. It is a link and never creates: the leave guard catches it where the sermon has unsaved edits, and a slip on a card makes nothing. The page and the library ask `outlineIdsForSermons` once, for the sermons shown, and read no entry.
- **Deleting a sermon** says that its outline goes too when it has one (`deleteDescription(title, hasOutline)`). The deletion itself is unchanged, and a preached sermon is still refused first.
- **"Add from Saved Point"** (`AddSavedPoint`): a picker of the account's point ideas, archived ones left out. From the Points section a copy goes after the last main point; from a row's menu it goes below that point or under it, as chosen. The dialog stays open, the same point can be placed again, and nothing is written to `sermon_points`. An entry made from a point says so and links to the point (`SourceLink`) for as long as the point exists.
- **Passages in the editor** are `EntryPassages`, a thin wrapper over `ScriptureField` in its row layout, with the outline's limit (`outlineLimits.references`) and the outline as its origin. A point shows it once it has a passage or "Add passage" is chosen; the introduction and the conclusion can hold passages too.
- **From an entry to the Bible and back.** A passage opens in the reader at `readerHref(referenceLocation(reference, { outline }))`: the reader's address carries `outline` as it carries `idea`, the Bible page looks it up among the account's own outlines (`getOutlineSermon`), and the reader offers "Back to the outline of …". An address names one way back at most.

### Preaching history

Phase 2E.1 is the data and persistence only: `src/features/preaching/`, three tables, migration `0009`. Phase 2E.2 is the interface: the **Preaching Record** section of the library at `/library/preaching-record` (see "Library" below for the hierarchy). People see "Preaching Record"; the code and the tables keep `history` and `occurrences`. The tables and the migration are in [docs/DATABASE.md](docs/DATABASE.md); the summary is in [docs/HANDOFF-2E.1.md](docs/HANDOFF-2E.1.md).

**The model.** A sermon is one `ideas` row and keeps that one identity however often it is preached. Each time is a row of `preaching_occurrences` that points at it. Nothing about preaching is stored on the idea: no count, date, flag, or status. An occasion records:

| Field             | What it is                                                                          |
| ----------------- | ----------------------------------------------------------------------------------- |
| `preachedOn`      | The calendar date, `YYYY-MM-DD`. Required                                           |
| `timeOfDay`       | `am`, `pm`, or null when it was not said. Never a clock time                        |
| `venueId`         | One of the account's venues, or null                                                |
| `contextId`       | One of the account's contexts (what kind of occasion it was), or null               |
| `actualFormat`    | `full_length`, `mini`, `flexible`, or `unspecified`: the format it was delivered in |
| `durationMinutes` | Whole minutes, 0 to 1,440, or null. Null is "not said", never zero                  |
| `notes`           | Up to 5,000 characters, or null                                                     |
| `recordingUrl`    | An `https` link to a recording kept elsewhere, or null                              |

- **Independent of classification.** Recording, changing, or removing an occasion writes nothing to `ideas`: not the status, the intended format, the sermon type, `archived_at`, or `updated_at`. `actualFormat` uses the intended format's words (`actualFormats` is `intendedFormats`) but is never copied from it, and is never worked out from the duration.
- **Nothing is inferred.** The part of the day is not worked out from the venue, the context, or the date; the format is not worked out from anything.
- **A context is a kind of occasion**, never a weekday or a part of the day: the date already says the day, and `timeOfDay` the part of it. The five suggested contexts (`suggestedContexts` in `model.ts`, named in the `preaching` dictionary in both languages, read with `suggestedContextOptions`) are Regular Church Service, Preaching Class, Conference / Preaching Bootcamp, Special Service, and Other. They are suggestions and not rows: **no account is given any context until it picks or writes one** (`createContext` with the name). A context an account writes may be named anything. Preaching Class is suggested only to an account that said it attends one (`attendsPreachingClass`, see "Account management"); that is decided in `suggestedContextOptions` and nowhere else, and it is the only thing the preference changes. A context of that name an account already has is offered, filtered by, and managed like any other, and anyone may still write the name.

**Files.** `model.ts` (values and limits, no server code), `schemas.ts` (Zod, no server code), `occurrences.ts`, `venues.ts`, `contexts.ts` (services), `suggestions.ts`, `actions.ts` (server actions).

**Ownership.** Every statement in the three services has the owner in its WHERE clause, and a sermon, venue, context, or occasion that belongs to someone else is the same answer as one that does not exist. The database repeats it: `preaching_occurrences` carries `owner_id`, and its three foreign keys are composite, `(sermon_id, owner_id)`, `(venue_id, owner_id)`, `(context_id, owner_id)`, so a row joining one account's occasion to another's sermon, venue, or context cannot exist.

**Only a sermon can be preached, and the check is locked.** A foreign key cannot say what kind an idea is, so `createOccurrence` reads the owner's idea `FOR UPDATE` inside its transaction and requires `kind = 'sermon'` before it inserts. `setIdeaKind` was not changed: its `UPDATE` takes the same row lock, so a reclassification and a recording at the same moment run one wholly before the other. Reclassified first, the recording is refused (`not_sermon`); recorded first, the occasion stands and the idea is refiled after it, which is the same state as any sermon refiled later. The foreign key's own lock would not do this (it does not conflict with an update of `kind`). `deleteIdea` takes the same lock.

**Recording twice is recording once.** The occasion's ID may be made in the browser. A second `createOccurrence` with the same ID returns the first one's row as it stands (`existing`) and writes nothing, whatever the second request said, even if the idea has since stopped being a sermon. An ID that belongs to another account is `unavailable`: that row is neither read nor changed. Nothing is unique but the ID, so a sermon preached twice on one date is two rows.

**Changing one.** `updateOccurrence` writes the fields the change names and no others; a field given as null is cleared (`occurrenceUpdate` tells the two apart, as `ideaUpdate` does for classifications). An occasion cannot be moved to another sermon. It can still be edited after its sermon is archived or refiled.

**What happens to history when the sermon changes.**

| The sermon is…                  | Its history                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Archived, then restored         | Untouched, and still returned by every history query. An archived sermon can still be recorded as preached  |
| Refiled as a point or undecided | Untouched and still readable. New occasions are refused until it is a sermon again                          |
| Deleted                         | **Refused** while it has any occasion: `deleteIdea` returns `"preached"`, whatever the idea is filed as now |

`deleteIdea` returns `"deleted" | "missing" | "preached"` (it returned a boolean before Phase 2E.1), and the `deleteIdea` action answers `preached` with a message that suggests archiving and `reason: "preached"`. An idea with no history is deleted as before. A venue or a context that any occasion names cannot be deleted either (`in_use`, with the count); renaming one changes no occasion. Deleting one occasion touches nothing else. All of this is `ON DELETE RESTRICT` in the database as well, so nothing can erase or detach history by another path.

**History queries.** `searchHistory(db, ownerId, query, pageSize)` returns one page (`items`, `total`, `page`, `pageSize`, `totalPages`), each item with its sermon (`id`, `title`, `kind`, `archivedAt`), venue, and context. `HistoryQuery` (`historyQuerySchema`) holds a search, one sermon, a date range (both ends inclusive, compared as calendar dates), venues, contexts, formats, parts of the day (`unspecified` asks for those that did not say), an order, and a page. The search requires every word, each in the sermon's title, the venue's name or locality, or the context's name. It never filters by archive or kind. The order is the date preached, then PM before AM before unsaid, then `created_at`, then the ID, all in one direction, so pages never repeat or drop a row. `listForSermon` is the same query for one sermon, `getOccurrence` reads one, and `occurrenceCounts` gives each sermon's count and last date in one query. The URL contract is `features/preaching/history-query.ts` (`q`, `sermon`, `from`, `to`, `venue`, `context`, `format`, `time`, `sort`, `page`), read and written only there, and the controls change the address only through `useHistory().apply`.

**Recording.** There is one form, `OccurrenceDialog` (`features/preaching/components/occurrence-dialog.tsx`), behind one set of schemas and actions. It is opened from four places, and each leaves the person on the page they were on: the Preaching Record's header and empty state (`HistoryProvider` / `RecordButton`, sermon chosen in the form, or preselected when the record is filtered to one sermon); a sermon's own page, in its header and in its `SermonHistory`; a sermon's card in Sermon Ideas; and the dashboard's header. The last three go through `RecordPreachingProvider` (`record-preaching.tsx`): `RecordPreachingButton` for a known sermon, `useRecordPreaching()` called with none. Only an idea filed as a sermon is offered the action, archived or not; the server refuses anything else. The sermon picker asks `/api/preaching/sermons`, which searches the signed-in account's own sermons.

**Dates.** `preached_on` is a PostgreSQL `date` read and written as a `YYYY-MM-DD` string (`date(..., { mode: "string" })`); it is never a `Date` and never converted between zones. A date that is not a real calendar date is refused, as is one before 1900 or in the future. There is no time zone setting, so "the future" is anything after the latest date it currently is anywhere on Earth (`latestDateOnEarth`, UTC+14): a preacher east of the server is never refused today's date, at the cost of admitting a date up to a day ahead for one to the west.

**Recording links.** Any `https` address is accepted, with no list of sites. `http`, other schemes, and addresses carrying a username or password are refused; the address is stored as `URL` writes it, at most 2,048 characters. Nothing is uploaded, fetched, embedded, or looked up.

**For offline work later (Phase 5).** IDs are client-generated and creation is idempotent, the schemas and the model have no server code, and an update names only what changed. No service worker, local store, or conflict handling exists.

### Library

The library is an overview and three sections: **Library → section → one record**.

- `/library` is the overview: a heading and three cards, one per section, from the same `librarySections` list the section navigation uses. It runs no query, has no action of its own, shows no "Back to Library", and marks no section as current. It is the main navigation's Library link.
- **Sermon Ideas** at `/library/sermon-ideas` (described here), **Saved Scripture** at `/library/saved-scripture` (see "Saved Scripture" below), and **Preaching Record** at `/library/preaching-record` (see "Preaching history" above). Each has its own address and query, and none is in the main navigation.
- Every section's page begins with `LibrarySectionHeader` (`features/ideas/components/library/library-sections.tsx`): `BackLink` to `/library` ("Back to Library", `components/layout/back-link.tsx`), the section's own title and description in `PageHeader`, its main action if it has one (Capture on Sermon Ideas, Record preaching on Preaching Record, none on Saved Scripture), then `LibrarySections`, the horizontal navigation between the three with `aria-current` on the one shown.
- An idea, `/library/<id>`, uses the same `BackLink`, to Sermon Ideas as it was left (`from`). `BackLink` is always a link to a place, never a step through browser history.

Old addresses: `/library/scripture` and `/library/history` redirect in `next.config.ts`, query carried across. `/library` cannot redirect there, being the overview; instead its page sends on an address that still carries an ideas query (`/library?q=grace&kind=sermon`) to Sermon Ideas, by parsing it with `parseLibraryQuery` and redirecting only when the result is not the default query. Each section has its own `loading.tsx`; `library/loading.tsx` stands for the overview and an idea's page.

The data layer is Phase 2B.1 and the interface Phase 2B.2. Sermon Ideas is a search box, a toolbar (filters, order, cards or list, tag management), an expandable filter panel, the filters in force as removable chips, a count, the results, and numbered pages.

**The query is the URL.** `features/ideas/library-query.ts` is the contract, with no server code in it, so the browser can build links with it:

| Parameter                    | Values                                                                                       | Default        |
| ---------------------------- | -------------------------------------------------------------------------------------------- | -------------- |
| `q`                          | Search text, cut to 200 characters; the first 8 words are used                               | none           |
| `kind`                       | `sermon`, `point`, `undecided`; repeat it for several                                        | all            |
| `status`                     | `idea`, `developing`, `ready`, `on_hold`; repeat it for several (`captured` reads as `idea`) | all            |
| `type`                       | `topical`, `textual`, `expository`, `unspecified`; repeat it for several                     | all            |
| `format`                     | `full_length`, `mini`, `flexible`, `unspecified`; repeat it for several                      | all            |
| `archived`                   | `active`, `archived`, `all`                                                                  | `active`       |
| `tag`                        | A tag ID; repeat it for several (20 at most)                                                 | none           |
| `tag_mode`                   | `any`, `all`                                                                                 | `any`          |
| `created_from`, `created_to` | `YYYY-MM-DD`                                                                                 | none           |
| `updated_from`, `updated_to` | `YYYY-MM-DD`                                                                                 | none           |
| `sort`                       | `updated-desc`, `updated-asc`, `created-desc`, `created-asc`, `title-asc`, `title-desc`      | `updated-desc` |
| `page`                       | A whole number from 1                                                                        | 1              |

- `parseLibraryQuery` never throws. A missing, malformed, or out-of-range value becomes its default, unknown parameters are ignored, and where one value is expected (`q`, `tag_mode`, the dates, `sort`, `page`) the first is used. A filter that repeats keeps the values it recognises, each once, and drops the rest; an address written when filters took one value (`?kind=sermon`) reads as a list of one.
- `serializeLibraryQuery` and `libraryHref` write a query back with every default left out, in a fixed order: filter values in the order the model lists them, tag IDs sorted, and `tag_mode` only when it is `all` and a tag is chosen. One query has one address, however its values were picked.
- **Filter semantics.** Within a filter, any chosen value will do. Between filters, every one must hold. An empty filter asks nothing. Tags follow `tag_mode`: `any` (the default) matches an idea with at least one chosen tag, `all` only an idea with every one. The same tag twice is one tag; no tags chosen means no tag restriction in either mode.
- `activeFilterCount`, `clearFilters` (keeps the search and the order), `toggled`, and `invertedRange` are the small pure helpers the controls share.
- The URL holds nothing about the account. A shared link shows the person who opens it their own ideas; a tag ID that is not theirs simply matches nothing.

**`searchIdeas(db, ownerId, query)`** returns `{ items, total, page, pageSize, totalPages }`. PostgreSQL does the filtering, ordering, counting, and paging; only the 24 ideas on the page are read, and their references and tags come in two further queries however many ideas there are.

- **Search** is case-insensitive and matches part of a word (`ILIKE '%word%'`). Every word must be found, each in the title, the notes, or the subject; they need not be in the same field. `%`, `_`, and `\` in the text are escaped and mean themselves. There are no operators.
- **A subject, sermon type, or format counts only on a sermon.** The columns are kept when an idea is reclassified, but a point shows none of them, so the subject is not searched and the `type` and `format` filters do not match there.
- **Archived ideas are excluded unless asked for** (`archived`), in the WHERE clause, so the total and the pages never include one that is hidden. Showing them counts as a filter, and Clear filters goes back to active ideas.
- **Filters** of different kinds must all hold; several values of one kind are alternatives (`IN`). Tags are matched in a correlated subquery, never a join, so an idea is returned once: `EXISTS` for any, and for all a count of the idea's links among the chosen tags that must equal the number chosen. The owner is in that subquery, so a tag that is unknown or someone else's matches nothing in `all` and is ignored in `any`. The SQL is in docs/DATABASE.md.
- **Dates** are calendar days read as UTC days, the zone every date is shown in. Both ends are inclusive: "to 31 January" includes the whole of that day.
- **Sorting** goes through a fixed map from the six keys to SQL; nothing from the request becomes a column name. Every order ends with the ID in the same direction, so ideas with equal timestamps or equal titles keep one order across pages. Titles sort without regard to case.
- **Paging** is by offset. A page past the end returns the last page, and `page` in the result says which one that was. A library that changes between two requests can shift an idea across a page boundary; that is the accepted cost of offset paging.
- **A range that ends before it starts** finds nothing. The date inputs limit each other (`min` / `max`) so one cannot be made in the panel, and when an address carries one the panel and the empty state both say so.
- **No trigram index.** The owner is always in the WHERE clause, so a search scans one account's rows (hundreds or thousands), not the table. `pg_trgm` would need an extension in a migration, and a GIN index over 20,000-character notes would be paid for on every save. If an account ever outgrows this, that is the next step.

**The interface** (`features/ideas/components/library/`). The page is a Server Component: it authorises, reads the query, runs `searchIdeas` and `listTags` together, and renders. The results and the pager are rendered on the server; only the controls are Client Components, and they share one small context instead of one large component.

| Piece                                 | Kind   | What it does                                                                                                                                     |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LibraryProvider`, `useLibrary`       | client | Holds the query the server parsed and the account's tags; `apply(change)` turns a change into the next address. The only place controls navigate |
| `LibrarySearch`                       | client | The search box: 300 ms debounce, Enter and Clear at once                                                                                         |
| `LibraryToolbar`                      | client | Filters button with a count, the order (`Select`), `ViewSwitcher`, Manage tags                                                                   |
| `LibraryFilters`                      | client | The expandable panel: kind, status, sermon type, intended format, Active / Archived / All, tags with Any / All, date ranges, Clear filters       |
| `FilterChips`                         | client | Every filter in force as a removable chip, shown whether the panel is open or not                                                                |
| `IdeaResults`                         | server | One page of ideas, as cards or rows                                                                                                              |
| `Pagination`, `pageWindow`            | server | Previous, Next, and numbered links with a window and ellipses; "Page x of y" on a narrow screen                                                  |
| `TagManager`                          | client | The Manage tags dialog                                                                                                                           |
| `TagPicker` (`components/tag-picker`) | client | Tag selection in the idea editor                                                                                                                 |

- **Navigation and races.** This is `useQueryNavigation` (`query-navigation.ts`), which `LibraryProvider` and the saved Scripture section's provider both use; `SearchBox` in `library-search.tsx` is likewise the one search box behind both. `apply` builds every change on the query _last asked for_ (a ref), not on the one the page is still showing, and sets `page` to 1 unless the change names a page. A filter chosen while a search is on its way, or a debounced search landing just after a filter, adds to the other instead of undoing it. The navigation runs in a transition: the controls show the new state at once (`useOptimistic`), the results dim and take `aria-busy` until they arrive, and the page does not scroll. When nothing is on its way the ref is reset from the server's query, which is how Back and Forward are taken up. The provider does not call `useSearchParams`, so it needs no `<Suspense>` of its own.
- **Search and history.** Typing asks after a 300 ms pause. One spell of typing is one history entry: the first request is a `push` and the refinements that follow are `replace`, so Back leaves the search instead of undoing it a letter at a time. Enter and Clear ask at once. When the query changes from outside, the box follows it.
- **View preference.** Cards (the default) or list, kept in `localStorage` under `library-view` and never in the URL: a shared link should not change how someone else reads. The choice in force is one attribute on `<html>`, `data-library-view`, read by two custom variants in `globals.css`: `list-view:` and `card-view:` (which is simply "not the list"). `IdeaResults` is one piece of markup styled by those variants, so switching re-renders nothing, both views always show the same ideas, and nothing can mismatch at hydration. `LibraryViewScript` sets the attribute before the first paint from the server's HTML, as `SplashScript` does, and the switcher's layout effect does the same after a client navigation. The switcher's checked state comes from `useSyncExternalStore`, as `ThemeToggle`'s does.
- **What a result shows.** Title, kind, status, and the date it last changed; on a sermon, its type and subject; notes clamped to two lines (cards only); up to three Scripture references and four tags, with a count of the rest. A point shows no sermon type or subject even where the record kept them. In list view a hovered or focused row gains an emerald edge on the left, the counterpart of a card's emerald border.
- **Returning to the same place.** A result links to `/library/<id>?from=<the library's query string>` (`ideaHref`). The idea page turns `from` back into an address with `libraryReturnHref`, which parses it as a library query and writes it out again: whatever `from` holds, the result is a `/library…` address, so it cannot be used as an open redirect. The "Library" link and the redirect after a deletion use it. The browser's own Back works because all the state is in the URL.
- **Empty states** are five: nothing captured at all (no controls, a Capture button); a search that finds nothing ("Clear search", filters kept); filters that find nothing ("Clear filters", search kept), which says the library has ideas and never calls it empty; every idea archived; and the archive asked for and empty.
- **The count** is the query's `total`: "12 matching ideas", or "Showing 25–48 of 126 ideas" when there is more than one page. It is a status region.

### Tags

A tag belongs to one account and can go on any of that account's ideas, of any kind. `features/ideas/tags.ts` is the service and `tag-actions.ts` the server actions. They are managed in the library's Manage tags dialog, chosen in the idea editor, shown on every card, and filtered by in the library.

- **Service**: `listTags` (alphabetical, with how many ideas carry each), `createTag`, `renameTag`, `deleteTag`, `getIdeaTags`, `setIdeaTags` (replace), `addIdeaTags`, `removeIdeaTags`, and `tagsForIdeas` (the batch read). Every statement has the owner in its WHERE clause, as in `ideas.ts`.
- **Actions**: `createTag`, `renameTag`, `deleteTag`, `setIdeaTags`, `addIdeaTags`, `removeIdeaTags`. Same rules as the idea actions: `authorize("active")`, Zod, the owner from the session, fixed messages.
- **Names** are trimmed, inner whitespace is reduced to single spaces, and the limit is 50 characters. A name is unique within an account whatever its case (a unique index on `lower(name)`); two accounts may use the same name. An idea holds 20 tags at most.
- **Isolation is in the database too.** `idea_tags` repeats the owner and both of its foreign keys include it, so a row joining one account's tag to another's idea cannot exist, whatever the code does.
- **A tag that is missing and one that is someone else's are the same answer** ("One of those tags no longer exists."), and an idea likewise. The idea is checked first.
- **All or nothing.** Assignment runs in a transaction; one unknown tag in a list undoes the whole change, including an idea being created or updated at the same time.
- **Saving an idea with tags.** `ideaInputSchema` has an optional `tagIds`. Left out, the idea's tags are untouched, which is what quick capture and the editor do today. Given, they replace what was there, in the same transaction as the idea. A repeated create returns the first idea with the tags it was first given.
- **Tagging is not an edit.** `setIdeaTags`, `addIdeaTags`, `removeIdeaTags`, renaming, and deleting a tag leave `ideas.updated_at` alone, so tidying tags does not reorder the library.
- Every idea read (`getIdea`, `recentIdeas`, `searchIdeas`) returns its `tags` as `{ id, name }`, alphabetically. `TagChip` and `TagList` (`components/tag-chip.tsx`) are how a tag is shown, everywhere.
- **Manage tags** (`TagManager`) is a dialog opened from the library's toolbar: create, rename in place, delete behind `ConfirmDialog` (which says how many ideas the tag comes off and that the ideas are kept), each tag with its `ideaCount` from the one grouped query in `listTags`, and a box to find a tag once there are more than eight. It calls the existing actions unchanged. Nothing is shown as done before the server answers; a refusal leaves what was typed in place; the actions' `revalidatePath` brings the new list. A deleted tag is also taken out of the library's filter.
- **In the editor** (`TagPicker`, through `TagsField`): the idea's tags as removable chips, and a popover to find one of the account's tags or create a new one by name. `IdeaDraft` holds `tags` (with names, for showing); the editor sends `tagIds` made from them with every save.
- **Existing tags are never lost to an unrelated edit.** The idea page passes the idea's current tags as the draft's starting value, so a save that changed only the title sends the same tags back. This is the risk Phase 2B.1 named: a form that sent `tagIds: []` by default would clear them. It is tested at the service, in the editor, and on the page.
- **A tag created in the picker exists at once**, whether or not the idea is then saved; it is a tag action, and like every tag action it leaves `ideas.updated_at` alone. Putting it on the idea happens with Save, atomically with the rest of the idea.
- **Quick capture does not choose tags yet.** It sends no `tagIds`, which the schema reads as "leave them alone".

### Quick capture

`QuickCaptureProvider` (`features/ideas/components/quick-capture.tsx`) is one dialog for the whole shell; `useQuickCapture().open()` opens it from the bar, the tab bar, the dashboard, and the library.

- Only the idea is required. Kind starts as Undecided, Scripture is always visible, and notes, status, and sermon details are behind "More details".
- `useQuickCapture().openWith({ kind, references })` opens it already holding a kind and passages: how an idea is begun from Scripture. Nothing is saved by opening. What it was opened with is not the person's own work, so closing it untouched asks nothing and leaves no trace; anything written beyond it is guarded as usual.
- Enter saves from the idea field. In notes, Enter is a new line and Ctrl or Command with Enter saves. Enter in the Scripture field adds the reference and never submits.
- A failed save changes nothing on screen. Closing with something written (the X, Escape, a click outside) asks "Discard this idea?"; discarding empties the form, and any close clears its validation messages. Leaving the page while something is written goes through `useLeaveGuard`. A save in flight cannot be closed or submitted again.
- Success closes the dialog and shows a toast linking to the idea.

### Loading

Two pieces, both mounted once in the root layout so every shell has them.

**Splash screen** (`components/layout/splash-screen.tsx`): shown on the first page of a browser session and on the first page after signing in, new or returning; never on an ordinary reload or navigation.

- **The proxy decides** (`src/lib/splash.ts`), because only the server knows from the first byte who it is serving. It keeps `st_seen`, an httpOnly session cookie holding who the site was last shown to, and when a splash is due it sets `st_splash=1` for 30 seconds. This is presentation only and grants nothing.
- **The page reads the signal before it paints.** The splash is in the server's HTML and is `display: none`. A small inline script (`SplashScript`) takes the cookie and sets `data-splash="on"` on `<html>`, so there is no flash either way and nothing depends on when the application's JavaScript arrives. The root layout stays static: it never reads cookies.
- **`SplashController` takes it down** as soon as the page has loaded, but never before its opening has played: 1.2 seconds from the moment it went up (`introMs`). Its bar fills while the page loads, quick at first and then ever slower, and never reaches the end by itself; once the page is ready the controller runs it to the end and lets it be seen full (`finishMs`, 0.42 seconds), because the owner asked that the bar always finish before the screen lifts, fast for a fast page and slow for a slow one (Phase 5B.1). It gives up waiting for `load` after 8 seconds, and finishes the bar then too. Then `"leaving"` for a 0.48 second lift, then the attribute is removed. With reduced motion the picture is whole at once, shown for 0.5 seconds so it is not a flash, its bar shown full without moving for 0.15, and gone in 0.2. Every change cancels the timers before it, so there is one timer chain at most. If the script never runs at all, the inline script removes the splash itself after 10 seconds. (Loading Experience 2.0, [handoff](docs/HANDOFF-LOADING.md); it was 1.8 seconds before.)
- A sign-in that moves to the next page without a page load is caught too: the signal arrives with that navigation and a layout effect raises the splash before the new page is painted. **And the sign-in form raises it itself, in the frame its form empties** (`holdSplash`, called from `Held` in `app/(auth)/clerk-forms.tsx`), holding it until the address changes (then it goes as usual) or `giveUpMs` passes, so what is seen goes straight from the form to the loading screen.
- **The sign-in card never folds to a line.** Clerk draws nothing until its script arrives (about a second after the page), and clears its form as a sign-in completes, sometimes a frame before `isSignedIn` turns true. `Held` keeps `data-form` (`loading`, `shown`, `done`) on its element, set from a `ResizeObserver` on the form, whose callbacks run after layout and before the frame is painted: the placeholder card (`AuthFormFallback`, as tall as Clerk's card at each width) stands in until the form is drawn, the two swap in one frame, and the frame the drawn form empties is painted with the placeholder and the splash. Do not move this to React state or an effect: those run after the paint, and the collapse is seen. The links under the card hold their room while they stream in (`BeneathSpace`, `app/(auth)/layout.tsx`), since the column is centred.
- While it is up the page beneath cannot scroll, its entrance animations are paused (so the landing page's opening sequence begins as the splash lifts), and everything in `<body>` but the splash is `visibility: hidden`, so nothing behind the opaque screen can be reached by Tab or read by a screen reader. It is back the moment the screen begins to lift. The splash is a `role="status"` named "Loading Sermon Tracker", announced once.
- **The sequence**, all CSS, every part counted from the moment the screen is displayed: the glow blooms (0s), eased out over several stops and under a faint grain (`splash-grain`) so it fades smoothly instead of in visible steps; the mark comes into focus from slightly small and soft, resting on a soft emerald shadow (80ms); the name rises out of a slight blur (300ms) as one sheen crosses the tile (450ms); the tagline's three words follow (from 520ms); the hairline opens from its centre (600ms) and the light passes along it for as long as loading goes on (from 900ms). That light is the only sign of progress and claims none: there is no percentage. Leaving, what is on the screen lifts and fades first (0.22s), the glow widens, and the screen fades onto the page. The atmosphere layers are `absolute` in the markup as well as in the stylesheet, so they can never take a place in the screen's grid and push the content off centre.
- The owner's two must-keeps, from the version before: the one large soft glow behind, and the light beneath (since Phase 5B.1 a bar that fills). The owner chose that version over one that lit Capture, Develop, Preach in sequence.

**Progress bar** (`components/layout/navigation-progress.tsx`): a 1px emerald bar at the very top of the window, above the header. It runs while a page loads (it is in the server's HTML already running, and ends on `load`) and during every navigation in the app. Navigation starts are reported by `src/instrumentation-client.ts` (`onRouterTransitionStart`, the router's own hook, which covers links, Back and Forward, and navigation from code); arrival is a change of pathname or query string. A started bar is shown for at least 0.3 seconds, a navigation to the page already shown ends by itself, and nothing can leave it running: it gives up after 15 seconds. It does not run for server actions or `router.refresh()`, which are not navigations.

Both keep their whole state in one DOM attribute and their styles in `globals.css` ("Splash", "Navigation progress"); neither uses React state, so neither can fall out of step with a render. Timing constants in the two controllers must match the CSS durations noted beside them.

### Unsaved changes

Whatever would be lost by a reload says so in `src/lib/unsaved-work.ts` while it would (`holdUnsavedWork` / `releaseUnsavedWork`; `hasUnsavedWork()` asks). `useLeaveGuard` holds while `dirty`; the outline store holds while its status is not `saved`, including after its page is gone. It is asked before the application reloads itself for an update (see "Installed application"), and by nothing else.

`useLeaveGuard(dirty, description)` (`components/layout/leave-guard.tsx`) asks before unsaved work is left, by any route. The App Router cannot refuse a navigation, so the guard works around it: a click on a link to another page is caught in the capture phase and held behind a dialog; a Back or Forward move is reversed after the fact (it adds one same-page history entry so that Back is reversible, and stops the router's `popstate` listener from acting on the move); closing, reloading, or leaving the site uses `beforeunload`. Code that navigates on purpose clears `dirty` or calls `allowLeaving()` first. Its third argument, `onLeave`, runs when leaving is confirmed and must throw the unsaved work away: Next keeps a page it has left, state and all, and would otherwise show the abandoned edits again on return. Use the guard for anything that holds edits; the idea editor and quick capture do.

### Installed application

Phase 5A ([handoff](docs/HANDOFF-5A.md)). Sermon Tracker can be installed from the browser (iOS, Android, Windows, macOS) and opens in its own window. It is the same application: the same shells, navigation, sign-in, and loading screen. Without a connection it opens the offline page, which reads the Bible kept on the device and keeps captures (see "Offline storage"); the rest of offline work is Phases 5C to 5E. `src/features/pwa`.

**Only for people who are signed in.** The manifest (`app/manifest.ts`) opens on `/dashboard` (`id` and `start_url`), with `scope: "/"` and `display: "standalone"`. A guest is sent from there to `/sign-in` by the proxy, with the dashboard as the way back, and an account that owes setup on to `/onboarding` by the dashboard's own check: no code was added to access, and no loop is possible. The installed window never shows the public page: `LeavePublicPage` in the `(marketing)` layout sends it to sign-in (an inline script before paint, and a layout effect after a move inside the application), signing out from it ends on `/sign-in` (`useAccountActions`), and the auth shell hides its logo link and "Back to home" there (`standalone:`, a CSS variant in `globals.css`). Sign-up, when it exists, is to be reached from the sign-in page.

**Icons.** `icon-192` and `icon-512` (purpose `any`), and `icon-maskable-192` and `-512`: the full-bleed tile with the book drawn at 80%, inside every mask's safe circle. All from `mark.svg` by `npm run brand:assets -- icons`. `appleWebApp` in the root layout gives iOS its title beside the existing `apple-icon.png`; the status bar is `default`, so nothing is drawn under it. `PwaRuntime` sets the `theme-color` metas to the page's own background once the theme in force is known, so a theme chosen by hand colors the window's bar too. The manifest's colors are the light canvas; its words are English (a manifest has one language).

**The service worker** (`service-worker.ts`, served by `app/sw.js/route.ts`, prerendered, never cached by HTTP). The build's version (`APP_VERSION`, from `next.config.ts`: the Vercel deployment, the commit, or the time of a local build) is written into it, so each deployment is a different script and the browser finds the update by itself. It is an allowlist; what it does not name it does not touch:

- **A page** (`mode: navigate`): the network, with navigation preload, and never stored. The kept `/offline` page only when the network cannot be reached at all. Any answer the server gives (a redirect to sign-in, a 404, a 500) is passed on as it came, so being offline never looks like being signed out.
- **`/_next/static/…`**: cache first (hashed, public, never changed); a query string is ignored.
- **`/brand/…`, `/icon.svg`, `/apple-icon.png`, `/manifest.webmanifest`**: the kept copy, refreshed behind.
- **Not answered**, so as if there were no worker: anything with an `RSC`, `Next-Action`, or `Next-Router-*` header or an `_rsc` parameter; `/api`, `/__clerk`, `/_next/image`; another origin; anything but `GET`.
- Only a whole same-origin success is stored. No account's page, payload, action, or API answer is ever stored, so nothing of one account can be shown to another from this cache.
- Installing keeps `/offline`, fetched **without credentials** (it can hold nothing of an account and sets no cookie, so the splash's cookies are untouched), the static files its HTML names, the fonts its CSS names, and the icons. One cache per version, `st-<version>`; activating deletes the other `st-` caches and claims the open pages.
- Registered by `startPwa()` (`pwa.ts`), from `PwaRuntime` in the root layout, in production builds only, after `load`. A window shown again asks for an update at most every 30 minutes, for an installed window left open for days.
- Messages: `SKIP_WAITING` and `GET_VERSION`; later phases add theirs beside them. Account data offline belongs in IndexedDB (Phase 5B), never in this cache.
- `experimental.useOffline` is not enabled: it changes what a Server Action does offline (it waits and is sent again), which is for Phase 5C to decide.

**The offline page** (`app/offline`, outside every shell, `noindex`): its own bar with the logo (not a link), and `StatusPage` saying the page needs a connection, that nothing was lost, and that the person was not signed out. Its one action is Try again, and it tries again by itself on the `online` event. It is in the language last shown on the device (`st-locale` in `localStorage`, written by `I18nProvider`, so the administrator's switch is already applied), or else the browser's, and draws nothing until it knows which. It shows no account data and imitates no page.

**Installing** is offered in Settings, App & Experience (`/settings/app#install`, "Install the app", `InstallAppSettings`), and on the dashboard by `InstallNotice`, a dismissible card in the tour invitation's place once that has been answered. The notice is not shown in the installed window, where `installGuide` says unsupported, or once this browser dismissed it or installed from it (`install-notice.ts`: `dismissed` or `installed` in `localStorage`, the latter written on `appinstalled`). A tab cannot know of an install made elsewhere, or by Add to Home Screen on iOS; dismissing covers those. It offers the browser's prompt where there is one and otherwise links to Settings. `installGuide` (`install.ts`) chooses between: installed (running in its own window: says so, offers nothing); just installed; the browser's own prompt (a real button over `beforeinstallprompt`, kept from the first page by `startPwa`); iOS and iPadOS (Share, Add to Home Screen; an iPad is told from a Mac by its touch points); Safari on a Mac (Add to Dock); Android; Chrome or Edge on a computer; unsupported (Firefox on a computer); and general directions. The browser is recognized only to choose which steps to show, and a missing prompt is never taken to mean anything.

**Updates.** A new version installs and waits. It is offered only when it is not the version the page already is: `isNewVersion` (`pwa.ts`) asks the waiting worker `GET_VERSION` and compares it with the page's own `APP_VERSION`, because pages come from the network and a page opened after a deployment is already new while its worker still waits (the owner saw the notice after the update had happened); a worker that does not answer in 3 seconds is taken to be new. `UpdateNotice` in the `(app)` shell says so above the tab bar (`role="status"`, never takes focus): Update or Later. Update is refused while `hasUnsavedWork()`, and says why; otherwise it sends `SKIP_WAITING` and reloads this tab once, when the new worker takes over. No other tab reloads, and a version left waiting takes over when every window is closed. The browser's own `beforeunload` warnings stay as a second barrier. Nothing is shown on the public, sign-in, or setup pages.

### Offline storage

Phase 5B ([handoff](docs/HANDOFF-5B.md)), `src/features/offline`. Each device keeps one IndexedDB database (`db.ts`, versioned by its `migrations` array) with shared reference data (whole Bible translations: `bibleDatasets`, `bibleChapters`) and account data under `users.id` (`mutations`, the change queue Phase 5C sends; `accountData`, reserved for 5D). IndexedDB is not encrypted and not behind sign-in, so only what must be kept is kept, and an account's records are only ever read for that account.

A translation arrives in a few parts of whole books from `/api/bible/package/[translation]/[part]` (signed in, only a translation on offer, whole or 503). Each part is written with its "done" note in one transaction beside the edition already kept; when all are in, the text is read back and must match the committed checksums before it becomes the one read and the old one is deleted. The reading translation is downloaded by itself when the signed-in shell is idle (`OfflineAgent`), a few tries per edition at most; Settings → Offline Storage downloads, retries, resumes, and removes. `loadChapter` reads the device when the network gives no answer.

The service worker still keeps only the offline page and static files. That page is `OfflineShell`: from the device alone it opens the real reader in local mode (`BibleReader local`: no marks or account actions), offers Quick Capture under the account last signed in on the device (recorded by the `(app)` shell, forgotten by the `(auth)` shell), and lists captures waiting. Quick capture that gets no answer from `createIdea` queues the idea under its own ID, so sending it later through the same idempotent action saves it once.

### Scripture

The King James Bible is in the database (see docs/DATABASE.md) and `features/scripture` is the only code that knows about it. Everything that shows or chooses Scripture uses these pieces; do not build a second way.

**A reference** is numbers: `{ book, chapterStart, verseStart, chapterEnd, verseEnd }`, book 1 to 66. It is the same shape in the table, the actions, and the components. `reference.ts` parses what is typed ("Romans 12:1-2", "Psalm 23", "Jude 5"), formats it, and validates it against `versification.ts`, the real verse count of every chapter, which is generated from the dataset. Validation therefore needs no request, and the server repeats it.

**Text** is fetched a chapter at a time: `GET /api/bible/<book>/<chapter>`, for active accounts, answering `{ book, chapter, verses, title }`. `getChapter` is a `use cache` function: the text is the same for everyone and never changes. It throws, and so is not cached, if a chapter is missing or short. The browser keeps the chapters it has opened (`use-chapter.ts`) and never holds more.

**A psalm's title** ("A Psalm of David.") is `title`. It belongs to the chapter and to no verse: it is stored apart (`bible_psalm_titles`), read by `getPsalmTitles` (cached, all 116 at once, and an error rather than "none" when the table is empty), never numbered, counted, selected, searched, or copied, and shown by `PassageText` as `superscription` above verse 1. If the titles cannot be read the chapter is still served, without one and with `no-store` so the browser does not keep the gap. `useChapter` returns it beside `verses`; callers that do not show it ignore it.

**Search** is `GET /api/bible/search?q=&in=&offset=`: PostgreSQL full-text search with the `simple` configuration, so words match exactly as written (a concordance, not a search engine), in canonical order, 40 to a page. `buildSearchQuery` (`search.ts`) turns the input into a query by hand, admitting only letters and digits: `grace mercy` (both), `"living water"` (phrase), `faith OR hope`, `-law` (without), `lov*` (beginning with). The query lives in `search-verses.ts`, apart from the cached read, deliberately.

**Components**, one system at three levels of depth:

| Level           | Opens from                                          | Container                                                                                                         |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Quick Preview   | Clicking any `ReferenceChip`                        | Popover where the window is at least 48rem wide; a sheet from the foot of the screen below that                   |
| Scripture Panel | "Read" in a preview; "Browse" in a `ScriptureField` | A panel down the right edge when wide; a full-height sheet when narrow; inside quick capture, part of that dialog |
| Bible reader    | The Bible link in the main navigation               | The `/bible` page: `BibleReader` (see "Bible reader" below)                                                       |

- `PassageText` is the only renderer of Bible text: serif, one verse to a line, the number in the margin, selected verses on `primary-soft` with an emerald number. `size="reader"` is the Bible page's larger setting, `superscription` a psalm's title, and `located` a verse that was gone to (`aria-current="location"`; not a selection, and how the eye is drawn to it is the surface's business).
- `useBibleSearch` (`use-bible-search.ts`) and `SearchHits` are the search request and its results list, shared by the panel and the reader. A reply to a search that has been replaced is dropped.
- `ScriptureBrowser` is the panel's content and is identical in every container: a search box, Book / Chapter / Verse filters with previous and next, the text, and a footer with the selection and one action. Verses are chosen by tapping, any number, and unselected by tapping again; none chosen means the whole chapter. Verses that are not adjacent become separate references. When the idea is still on screen beside the panel (`besideIdea`) and the action can be repeated (adding, not replacing), attaching leaves the panel open for the next passage; where the panel covers the idea, attaching returns to it.
- `ScriptureProvider` owns the one panel. `useScripture().openPanel({ reference, attach })` opens it on a passage; `attach` is what choosing does there ("Add to idea", "Update reference"), and its absence means reading only. A surface that shows the panel within itself wraps its content in `ScriptureHost`.
- `ScriptureField` is the form control: chips, a box that adds a typed reference on Enter, and Browse. It applies each change to the list as it stands when the change lands, because the form beside an open panel stays live.
- The container is chosen from the space available (`useMediaQuery`), never from the device. Surfaces mount on interaction, so there is nothing to mismatch at hydration.
- **A long passage is bounded the same way everywhere.** A passage read in place shows `passageLimits.preview` verses (6) in a Quick Preview and `passageLimits.row` (12) in a row that opens within a page (`passage-text.tsx`), and no surface sets a number of its own. What was left out is said beneath as a button ("Read 164 more verses", `Passage`’s `onMore`) that opens the whole passage in the Scripture Panel; "Open in Bible" is beside it. Nothing that shows a passage in place scrolls inside itself or grows with the passage, and none is a second reader: an idea’s rows, an outline entry’s rows, and the chip’s preview all work this way.
- **One modal layer at a time.** A preview closes before the panel opens. Inside quick capture the panel sits beside the form when wide and replaces it when narrow, and a narrow-screen chip goes straight to the panel.

### Bible reader

`/bible` is Phase 2C.1A: the whole King James Bible to read, with book, chapter, and verse navigation, the existing word search, verse selection, and copying. Phase 2C.1B added highlighting and favorites to it (see "Saved Scripture" below), and Phase 2C.1C the way from a selection to an idea and from an idea back to its passage (see "Scripture on an idea" below).

**The page** (`app/(app)/bible/page.tsx`) is a Server Component: `requireActiveUser()`, then the chapter the address names is read with the cached `getChapter` and sent with the page, so a link arrives with its text. Everything after that happens in the browser, in `BibleReader`, a chapter at a time through `/api/bible`, which authorises every request itself.

**The address is the location.** `features/scripture/reader-location.ts` is the contract, with no server code in it:

| Address                             | Means                                               |
| ----------------------------------- | --------------------------------------------------- |
| `/bible`                            | The chapter last read in this browser, or Genesis 1 |
| `/bible?book=43&chapter=3`          | John 3                                              |
| `/bible?book=43&chapter=3&verse=16` | John 3, brought to verse 16                         |
| `…&verse=16&through=18`             | The same, pointing out verses 16 to 18              |
| `…&idea=<id>`                       | Opened from that idea, which is the way back        |

- `book` is the canonical number, 1 to 66. Everything is checked against `versification.ts`.
- `parseReaderLocation` never throws. No real book: no location. A chapter the book does not have: chapter 1 (and the verse is dropped with it). A verse the chapter does not have: dropped. Other parameters are ignored and of a repeated one the first is used.
- `readerHref` writes one address per place, in the order `book`, `chapter`, `verse`, `through`, then `outline` or `idea` (one way back at most; given both, the outline). An address that says a place another way is rewritten in place (`replaceState`).
- `through` is the last verse of a passage, in the chapter it starts in. It must be after `verse` and exist, or it is dropped. The whole run is tinted together, by the same passing light as one verse, and none of it is selected or highlighted. `referenceLocation(reference, idea?)` makes the location of an idea's reference: a passage that runs into later chapters is pointed out to the end of its first, and a whole chapter is opened at its head with nothing pointed out.
- `idea` is an idea's ID and nothing else. The Bible page looks it up among the signed-in account's own ideas and, if it is there, the reader offers "Back to …" above the text. An ID that is malformed, unknown, or someone else's offers nothing and says nothing. Moving about in the reader carries it along; Copy link leaves it out.
- `verse` says where to look. It scrolls the verse into view and tints it faintly for under two seconds (`data-found`, the `verse-found` animation in `globals.css`), then lets it go: there is nothing to clear, and it is never a selection. Only one verse is ever tinted: going to another takes it off the first at once, the attribute is removed when the animation ends, and going to the same verse again plays it again. Neither the verse nor the Go to verse menu keeps any mark afterwards.
- **The chapters either side are fetched ahead** once a chapter is shown, so Previous and Next show text at once and not the loading lines.
- **Moving about** (the sidebar, Previous and Next, Go to verse, a search result, a typed reference) is `window.history.pushState`, which Next keeps in step with `useSearchParams`: no request to the server for the page, and Back and Forward retrace the reading. A new chapter starts at the top of the page.
- **No place named**: the reader shows the loading lines (never a wrong chapter), reads the saved place, and `router.replace`s to it, so the bare address leaves no history entry that would only send forward again.

**Reading position** is `localStorage["bible-location"]`, written as `book.chapter` on every chapter shown and validated again when read. It is a preference of the device: it is not in the database, is not synchronised, and a link that names a place always wins over it. Storage that is missing, refused, or holds nonsense means Genesis 1.

**Selection** (`features/scripture/selection.ts`) is one of three states: `none`, `verses` (sorted, each once, only verses the chapter has), or `chapter`.

- **Shift and a click** selects every verse from the one last clicked to this one, in either direction, adding to what is selected (`selectRange`). With nothing selected it is an ordinary click. `PassageText` reports it through `onSelectThrough`, which only the reader passes; the Scripture Panel is unchanged. Touch and keyboard need neither: verses are buttons, and each tap or Enter adds one.
- Clicking a verse selects it; clicking it again unselects it. Verses that are apart become separate references through `versesToReferences`: John 3:3, 5, 6, 8 is John 3:3, John 3:5–6, John 3:8.
- **Nothing selected is nothing.** `selectionReferences` returns an empty list, never the chapter. This is deliberately not the Scripture Panel's rule, where an empty choice means the whole chapter and quick capture and the editor rely on it; the panel is unchanged.
- The whole chapter is chosen on purpose ("Select chapter") and is the one chapter reference, not a list of verses. Every verse chosen one by one is the same state.
- A selection is temporary: it is React state inside the chapter's view, which is keyed by book and chapter, so it cannot outlive its chapter. It is not in the address.
- Interactive selection is within the chapter on screen. References across chapters remain valid everywhere else.

**`SelectionToolbar`** appears with a selection and goes with it. It has two lines: the reference in words with Clear at its end, and beneath it Copy text, Copy reference, Copy link, then a hairline and its `children`: Highlight, Favorite, and Idea (`components/saved/selection-actions.tsx`). Six words only just fit one line of the reading column, which is why the third is one word and is named "Add to an idea" in full for assistive technology and on hover. A third, quiet line (`footer`) names the favorites the selected verses already belong to. Each button shows its word where the toolbar has room for every word and its icon alone, still named, where it has not; the room is the toolbar's own width (a container query, `toolbarAction` and `toolbarLabel`), because beside an open sidebar a wide window can leave it less than a phone does. It rests at the foot of the reading column (above the tab bar and the safe-area inset on a narrow screen), and `BackToTop` steps aside while it is shown.

- **Copy text** is `formatSelectionText`: the reference and "(KJV)", then directly beneath it each verse on its own line with its number; where verses were passed over, a line of three dots stands between the passages and none of those verses is included. A psalm's title is not copied.
- **Copy link** is the chapter's address at the first verse chosen. The selection itself is not serialised.
- Success is a toast; a refused clipboard is said in the toolbar.
- **Ctrl+C or Command+C** copies the selection and then clears it. What it copies is a choice made in Settings (verse text by default, or the reference, or a link), kept on the device in `localStorage["bible-copy"]` (`copy-preference.ts`); the button it stands for carries `aria-keyshortcuts`. It stands aside for a text box, for text marked the ordinary way, and when nothing is selected, and a refused copy keeps the selection. The toolbar's buttons leave the selection in place, so the text and then the reference can both be taken.

**Navigation** (`ReaderNavigator`) is one component in two containers: the sidebar from `md`, and a full-height `Dialog` below it, opened from the chapter bar. Its state (`useReaderNavigation`) is held by the reader, so search results are still there when the sheet is opened again.

- The box goes to a typed reference (`parseReference`) and otherwise searches the text. After going to a reference it offers to search for the words instead, for the word that is also a book ("Jude"). Searching with the box empty returns to the books and puts the last search away.
- Books are listed under their testaments; the book being read is open on its chapters. A book of one chapter is gone to directly.
- **The sidebar can be put away**, and that is remembered on the device (`localStorage["bible-sidebar"]`, `reader-sidebar.ts`): the same mechanism as the library's view, one attribute on `<html>` (`data-bible-sidebar`) set before first paint by `ReaderSidebarScript` and read by the `sidebar-closed:` variant. Its place closes by width while the panel itself slides a little to the left and fades, with its content held at full width so nothing reflows, and it is `visibility: hidden` once away. **One handle does both**: a small round control astride the line between the navigation and the text, which travels with that line to the window's edge and back, its arrow turning to say which way the navigation will go. It is outside the element it hides, so it never has to hand focus to another control.
- **Previous and Next are in two places**: the chapter bar, and the foot of each chapter, as two links that name the chapter they lead to. Arrows floating beside the text were tried, as round arrows on a wide window and as edge tabs on a phone, and the owner decided against both: do not add them back. On a touch screen a sideways swipe over the text does the same (`swipe.ts`): towards the left for the next chapter, towards the right for the one before, and only when it is plainly sideways, far enough, and quick, so that scrolling the chapter is never taken for one.
- **The chapter bar** holds only Previous, the chapter's name (the page's `h1`), and Next, each control balanced by its like at the other end, so the name sits over the middle of the text. Beneath it, above the text, are the translation's name, **Go to verse** (a popover of the chapter's verse numbers), and **Select chapter**.

**Motion.** The sidebar's width, slide, fade, and handle share one 0.38 second ease-in-out curve; a verse gone to is lit and fades (held, not faded, under reduced motion); a chapter's text settles into place over 0.3 seconds from 16px to the side it lies on, the next chapter from the right and the one before from the left, and is fully opaque throughout: nothing fades in, because text that starts from clear leaves the page blank for an instant, which the owner saw as a flash. The links at the foot of a chapter are reading on, not turning aside, so from them the next chapter comes up from below and the one before down from above. The chapter's name simply changes, and a first arrival is not animated. The text's container clips sideways, so the slide never widens the page. Go to verse moves the page with `glideTo` (`glide.ts`), one ease set frame by frame, because the browser's own smooth scrolling stuttered when started as the menu closed; the verse is lit as the glide ends, a verse already in view is lit without moving the page, and the reader's own wheel, touch, or key takes over at once. Nothing loops, and the global reduced-motion rule stills all of it.

- **The page's name is the chapter** ("John 3 · Sermon Tracker"), set by the reader as it moves, so a tab and the history list say where each entry is.

**Translations.** There are two, and this is how the paragraph that stood here said a second would arrive: a reference, the reader's place, and a reference on an idea still carry no translation; the translation is one more parameter in the reader's address and in what text is fetched. See "Languages and translations" below.

### Languages and translations

Phase 2C.2. The interface is in English or Spanish, the Bible is the King James (KJV) or the Reina-Valera Gómez (shown as RVG, never with its revision year). Either can be chosen on its own, and choosing a language brings its translation with it.

**Preferences** (`features/preferences`). `users.locale` is the interface language and `users.bible_translation` the Bible, null until one is chosen. `resolvePreferences` (`resolve.ts`, no server code, and the one statement of the rule) turns what is stored into what is in force:

- Nobody has chosen a translation: it is the one in the interface's language, KJV for English and RVG for Spanish.
- A chosen translation stays until another is chosen or the interface language is changed. `setLocale` with a language that differs from the one saved writes the translation back to null (`saveLocale`), so the new language brings its own translation, and the person can then choose the other; with the same language it writes nothing. `setBibleTranslation` never writes the language; `setBibleTranslation(null)` goes back to following the language.
- `getPreferences()` (`current.ts`) is what every page, action, and route asks. It is decided once per request from the session and the database. Before sign-in there is no account, and the language is the `st_locale` cookie, which is written when the preference is saved or chosen on a sign-in page, holds a language code, and grants nothing.
- With no cookie the language is the browser's (`Accept-Language`, through `preferredLocale` in `i18n/locales.ts`), and a new account starts in that same language (`deviceLocale` in `i18n/device.ts`, handed to `provisionUser`). An account that exists keeps what it has saved. The theme follows the device too, in the browser, until one is chosen.

**The Spanish switch.** `app_settings.spanish_enabled`, changed only by `setSpanishEnabled` (`authorize("admin")`) from the Languages section of `/admin`. It is applied in `resolvePreferences` and nowhere else, and is for everyone, administrators included:

- Off, the interface is English and only the KJV is on offer, whatever is stored. Stored preferences, favorites, and highlights are not touched, so switching it on restores them.
- Enforced on the server, not by hiding controls: `/api/bible/<book>/<chapter>`, its `/marks`, and `/api/bible/search` answer 404 for `t=rvg`; `saveFavorite` and `setHighlight` refuse `rvg`; `updateFavorite` and `deleteFavorite` answer "no longer exists" for an RVG favorite and leave it; `/library/saved-scripture` does not list or count RVG favorites; `setLocale("es")` and `setBibleTranslation("rvg")` are refused. The reader drops a `t` or `beside` it is not offered.
- It is read from the database on every request (once per request, `getAppSettings`), so it takes effect on the next request with no deployment. If it cannot be read, Spanish is treated as off: English and the KJV always work.
- RVG chapter responses are `no-store`, so a browser cannot go on serving them after the switch.

**Localization** (`src/i18n`). No library. `dictionaries/en/<feature>.ts` defines every string; `dictionaries/es/<feature>.ts` is typed as the same shape with anything optional, and whatever it leaves out is shown in English. An entry is a string, or a small function where the words depend on a count or a name, so each language keeps its own grammar. `getT(feature)` on the server and `useT(feature)` in Client Components; `I18nProvider` in the `(app)` shell passes only the language's code, so no dictionary crosses to the browser as a prop. A server component that tests render directly (`IdeaResults`, `Pagination`, `DashboardView`) takes a `locale` prop. Schemas are built per language (`ideaSchemas(locale)`, `savedSchemas(locale)`) so what they refuse is said in it. A test checks that Spanish has every English key and no others. What a person wrote is never translated. The outline page adds a dictionary file of its own.

**Books and references.** `books.ts` names the 66 books in both languages; a book is still its number. `findBook` reads either language's name whatever the interface is in, and English spellings read exactly as before. `formatReference` and `formatVerseSet` take a language: the interface's in general, and the translation's wherever text of that translation is beside it (a reading pane, its navigation, copied text, a favorite's stored reference).

**Text.** `passages.ts` and `search-verses.ts` take a translation; both translations number alike, which `data/bible/README.md` shows and a test asserts. Search folds accented vowels (index and query alike) and marks hits on the text as written. The browser's chapter and marks stores are keyed by translation.

**Marks.** A favorite or a highlight belongs to the translation it was made in (still one color to a verse, per translation) and is never shown in or carried to the other. So nothing is hidden silently, `getChapterMarks` also answers `elsewhere`: how many highlights and favorites the account has in the same chapter of the other translation, shown above the text as a link that reads the chapter there without changing the saved translation. Saved Scripture lists both, labels each, filters by `translation`, quotes each from its own text, and opens each in its own translation.

**In the reader.** The address gains `t` (the translation; absent, the account's own) and `beside=<translation>.<book>.<chapter>` (a second pane with a translation and a place of its own).

- Choosing a translation keeps the book, chapter, and verse, with no request for the page. The pane shows the choice at once from the reader's own state (`chosen`): the address is changed through Next's router, which can hold a change back while the saved preference refreshes the page, and the text must not wait for that. While the other text is on its way the pane shows the loading lines and "Loading the RVG…" beside the selector; when it is there, the text fades and rises in, and nothing more is said beside the selector. The other translation of the chapter on screen is fetched ahead.
- The choice in the first pane is saved as the account's translation; a refusal puts the text back and says why. The second pane's is kept only in the address.
- **Comparing** (`ReaderPane`, `ChapterBar`) is two panes side by side, each with its own selector, place, selection, marks, and scrolling, in any pairing of the two translations. It is offered where the window is at least 44rem wide (a phone on its side, a tablet, a desktop) and not below; an address that asks for it on a narrower screen shows the first pane alone. The panes do not compete with the navigation: below 66rem the docked sidebar steps aside while two panes are open and is opened over them from either pane's bar. The navigation, the keyboard's copy, and the page's name answer to the pane last touched, marked by an emerald line under its bar. Closing either pane leaves the other as the reader.
- **Locking the panes' scrolling** (`scroll-lock.ts`, bound only in `BibleReader`) is an option on the line between the panes, off until asked for and remembered in this browser (`localStorage`, not the address). On the same chapter the panes are kept verse to verse, so texts of different lengths stay together; on different chapters they move by the same distance. Turning a chapter in either pane turns the lock off. The panes still know nothing of each other.
- Synchronized navigation is not built. `BibleReader.go` is the one place a move is made and holds the `linked` flag where the other pane would be moved too.

### Saved Scripture

Phase 2C.1B: favorites and highlights. Both are a person's own, kept in the database per account and per translation (see docs/DATABASE.md), and both live in `features/scripture/saved`. They are independent: a verse can be highlighted, in a favorite, both, or neither; deleting a favorite leaves its verses' highlights, and removing a highlight leaves every favorite.

**A saved passage is a set of verses** (`verse-set.ts`, no server code): `VerseRef` is `{ book, chapter, verse }`, and a favorite holds any number of them, in one chapter or several, together or apart.

- `normaliseVerses` puts them in the Bible's order, each once, and drops what does not exist. `canonicalKey` is the string two equal sets share. A psalm's title has no verse number and can never be one of them.
- `formatVerseSet` writes a set as it is said: "John 3:16", "Psalm 23:1–6", "Romans 3:10, 23; 6:23", "John 3:16; Romans 6:23", "Jude 5, 7". `parseVerseSet` reads the same form back (each part through `parseReference`; a part with no book belongs to the book before it, and a bare number after a comma to the chapter before it), and is how a favorite's passage is edited.
- `referencesToVerses` and `versesToRuns` convert to and from `ScriptureReference[]`, the shape the reader's selection and an idea's references use.
- The reader selects within one chapter, so a favorite made there is in one chapter. The model, the table, the formatter, and the editor's typed passage all handle verses across chapters and books.

**Favorites** (`favorites.ts`, `actions.ts`).

- **Identity is the verses and the translation**, never the label or notes. `createFavorite` inserts with `ON CONFLICT DO NOTHING` on the unique `(owner, translation, selection_key)` and then reads, so the same passage saved twice, at once or a year apart, is one favorite; the second answer is the first favorite as it stands, marked `existing`, with its label and notes untouched.
- `updateFavorite` changes the label, the notes, the verses, or any of them; what is left out is left alone. New verses replace the old in one transaction. If they are another favorite's, nothing changes and that favorite's ID comes back (`conflict`): neither is overwritten.
- `deleteFavorite` removes the favorite and its verse rows. Nothing else.
- Limits: 200 verses (the longest chapter has 176), a label of 120 characters, notes of 2,000. Zod enforces them in the actions and CHECK constraints repeat the last two.
- The actions (`saveFavorite`, `updateFavorite`, `deleteFavorite`, `setHighlight`) follow the idea actions: `authorize("active")`, Zod, the owner from the session, fixed messages, and one answer for "missing" and "someone else's". A verse that does not exist is refused, never dropped.

**Highlights** (`highlights.ts`). Four colors, `yellow`, `green`, `blue`, `red`, and one to a verse: the table's primary key is the account, the translation, and the verse. `setHighlights` is one upsert for every verse asked for, so a selection changes together and a new color replaces the old; `clearHighlights` is one delete. Only the verses named are touched.

**In the reader.**

- **Reading the marks.** `GET /api/bible/<book>/<chapter>/marks` answers `{ highlights: { verse: color }, favorites: [...] }` for the signed-in account: the highlights in the chapter, and the favorites with a verse in it, each with all of its verses. Two queries, `no-store`, and it authorises itself. The Bible page sends the same for the chapter it sends, so a link paints with its colors; if that read fails the text is still sent.
- **`use-chapter-marks.ts`** is the one place the browser holds them. A chapter's marks are shown from memory at once and asked for again each time the chapter is shown; the chapters either side are fetched ahead with their text. A highlight is shown the moment it is asked for: what is on screen is what the server last confirmed with the changes still on their way laid over it, in order. Changes reach the server one at a time. A refused change is taken back by itself, the ones made after it stay, and the toolbar says why. Each chapter has its own entry, so an answer about a chapter that has been left lands only there, and an answer to a read that a change has overtaken is dropped.
- **Drawing them.** `PassageText` takes `highlights` and `favorites` beside `selected`. A highlight is a stroke behind the verse's words (`box-decoration-break: clone`, with a 0.2 second color transition); a selection is the emerald tint across the whole row with an emerald number. A verse that is both shows both. A favorited verse has a small gold star under its number. Both marks are also in the verse's accessible name ("Highlighted yellow.", "In your favorites.") and on `data-highlight` and `data-favorite`.
- **Highlight** opens a popover of four named swatches. The color every selected verse shares is ticked; where they differ it says so in words ("These verses are yellow and blue. A color here replaces them all.") and none is ticked. "Remove highlight" is there only when a selected verse has one. The button itself carries a dot of the color in force. The selection stays, as it does for the copy buttons.
- **Favorite** saves the selection with one click and says so in a toast with a link to the library. When the selection is exactly a favorite already, the button reads "Saved" and opens it instead. Nothing is saved twice.
- **`FavoriteEditor`** (`components/saved/favorite-editor.tsx`) is one dialog for the reader and the library: the passage (typed, checked as it is submitted), a label, notes with a count, Save, and Remove, which asks in the dialog's own footer so one layer never sits on another. A click outside does not close it once something has been typed. A passage that is another favorite's is refused with a link that finds that one.

**In the library** (`/library/scripture`, `app/(app)/library/scripture/page.tsx`). A Server Component like the ideas' page: `requireActiveUser()`, the query from the URL, `searchFavorites`, and the results.

- **The query is the URL** (`saved-query.ts`, no server code), on the ideas' pattern: `q`; `book` (1 to 66); `color` (repeat it for several); `sort` (`saved-desc`, the default, `updated-desc`, `bible`); `page`. `parseSavedQuery` never throws and `savedHref` writes one address per query with defaults left out. The URL holds nothing about the account.
- **Search** matches every word in the reference, the label, or the notes, case-insensitively, with `%`, `_`, and `\` meaning themselves. **Book** matches a passage with any verse in that book. **Color** matches a passage with any verse highlighted in any chosen color, read from the highlights themselves. **Biblical order** is by where the passage begins.
- **Controls** (`saved-controls.tsx`): the shared search box, a Book `Select` under its testaments, the order, four color toggles that show their own state, and Clear filters. They navigate only through `useSavedScripture().apply`.
- **A result** shows the label where there is one, the reference as a link to the passage in the Bible (`readerHref` at its first verse), its first three verses with a count of the rest, its notes, the colors its verses carry by name, and when it was saved, with Edit and Remove. Remove asks first and says what is kept.
- **Empty states** are three, as for ideas: nothing saved at all (no controls, "Open the Bible"), a search that finds nothing, and filters that find nothing.
- **A page is five queries** whatever its size (docs/DATABASE.md).

### Scripture on an idea

Phase 2C.1C. A reference on an idea is a row of `idea_scripture_references`, as it has been since 2A; this phase added the ways to put one there from outside the idea's own form, and the way from it to the Bible. Sermon, point, and undecided ideas are one table, so everything here is the same for all three, and a point needs no sermon to hold Scripture.

**Adding** is `attachReferences(db, ownerId, ideaId, references)`, behind the `attachScripture` action. It is the only way Scripture reaches an existing idea other than its editor's Save.

- It adds to what the idea has and changes nothing else: not the other references, their order, the main text, or any field. A passage added this way is never the main text.
- **A passage the idea already holds, exactly, is not added again**, so a repeat is harmless and is answered as done ("… is already on …"). "Exactly" is `referenceKey`. A passage that only overlaps another (John 3:16 beside John 3:16–18) is a different passage, chosen on purpose, and is kept.
- **Verses that are apart stay separate references.** The reader's selection arrives as one reference for each unbroken run (`selectionReferences`), and each is its own row.
- **All or nothing.** More than the idea has room for (25) adds none, and says how many would fit.
- **Safe at once.** The idea's row is locked (`SELECT … FOR UPDATE`, owner in the WHERE clause) for the transaction, so two requests add one after the other; an editor's Save takes the same lock through its `UPDATE`. `UNIQUE (idea_id, position)` stands behind it.
- An idea that is missing and one that is someone else's are the same answer, and nothing is written. Something added counts as a change to the idea (`updated_at`); nothing added does not.

**Finding the idea** is `GET /api/ideas/search?q=&kind=` (`idea-search.ts` is its contract): the library's own `searchIdeas`, so the owner is in its WHERE clause, with only the words and the kind taken from the address through `parseLibraryQuery`. It answers eight ideas, most recently changed first, with the count of all that match, and only what the picker shows: title, kind, status, a sermon's subject, and the references held. It is never cached.

**`AttachScripture`** (`features/ideas/components/attach-scripture.tsx`) is the one dialog, opened by "Idea" in the reader's toolbar and by "Add to idea" on a saved passage. It names the passage, searches after a 300 ms pause (a search that has been replaced is withdrawn), switches between all ideas, sermons, and points, and marks an idea that already has the passage. Choosing an idea adds to it at once, closes the dialog, and says so in a toast that links to the idea; the reader stays where it was with its selection, as after a copy. A refusal is said in the dialog, which stays open. "New sermon idea" and "New point idea" close it and hand the passage to quick capture. It floats where the window is wide and tall enough and takes the whole of a smaller screen, a phone on its side included.

**From a favorite** the same dialog is given `versesToRuns(favorite.verses)`. What reaches the idea is references; nothing links the two afterwards. Removing the favorite leaves the idea's references, and taking the references off the idea, or deleting the idea, leaves the favorite. Both are tested on the database.

**On the idea's page** `ScriptureField` has `layout="rows"`: each reference is a closed row (its name, Open in the Bible, the main-text star on a sermon, Remove) that opens its text in place, up to twelve verses, fetched when first opened. Quick capture and the library's cards keep the chip and its preview, which also gained "Open in Bible". Removal there is part of the draft and is saved with Save, as before.

**From an idea to the Bible** is an ordinary link to `readerHref(referenceLocation(reference, ideaId))`: the chapter, the passage pointed out, and the way back (see "Bible reader"). With unsaved edits, `useLeaveGuard` asks first. The browser's Back returns to the idea as it would from any page.

### Account management

`/settings` is the person's profile and preferences: the application's own interface over Clerk, and over what the account says about itself. Clerk remains the identity provider: it stores and checks credentials, verifies email addresses, runs OAuth, and owns sessions. The application stores none of it and adds no table.

**The settings workspace** (Phase 5B.1, [handoff](docs/HANDOFF-5B.1.md)). `/settings` is an overview, and each category is its own page beneath it, in this order (`settingsCategories`, `features/settings/categories.ts`; `routes.settings*` in `lib/site.ts`):

| Page                   | What it holds                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `/settings/profile`    | Picture, name, email addresses (Clerk's); Church & Ministry (`#ministry`, the account's, below)     |
| `/settings/bible`      | The language and translation saved on the account; the reader's copy shortcut, kept in the browser  |
| `/settings/appearance` | The theme, kept in the browser                                                                      |
| `/settings/app`        | Installing (`#install`), Restart Product Tour, Run Account Setup                                    |
| `/settings/offline`    | `OfflineStorageSettings` (`#offline-capture`, `#offline-bible`): this device's, never the account's |
| `/settings/sync`       | Reserved for Phase 5C: says what is coming and offers no control or status                          |
| `/settings/account`    | Role, status, and joining date, read-only; password, connected accounts, and devices (Clerk's)      |

- `settings/layout.tsx` frames them: from `lg` up a sidebar (`SettingsNav`, `aria-current="page"` on the category shown, none on the overview) that is sticky below the bar; below `lg` no sidebar, the overview lists the categories as cards (`SettingsCategoryList`) and each page starts with a `BackLink` to it. The layout sets `I18nProvider` from `getPreferences()`, so a language saved here reads right at once. Every page calls `requireActiveUser()` itself.
- **Old addresses.** A hash never reaches the server, so `/settings#…` from the single page is sent on in the browser by `LegacySettingsHash` on the overview (`legacySettingsHashes`): `#install` to `/settings/app#install`, `#offline` to `/settings/offline`, `#offline-capture` to `/settings/offline#offline-capture`, and the old section ids to their pages, with `router.replace`. An unknown hash stays on the overview. The notices link to the new addresses directly; `ScrollToHash` on the target page brings the block into view as it streams in.
- **Unsaved typing.** Moving between categories unmounts a page's forms, so the name form and Church & Ministry hold unsaved lines with `useLeaveGuard` ("Leave without saving?"). Password fields are not held.

**Where each thing is kept.** There is one place for each, and nothing is in two.

| What                                                               | Where                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Name, picture, email addresses, password, connections, sessions    | Clerk                                                               |
| Church name, ministry role, attending preaching class              | `users` (`church_name`, `ministry_role`, `attends_preaching_class`) |
| Interface language, Bible translation                              | `users` (`locale`, `bible_translation`)                             |
| Theme, the reader's copy shortcut, the library's card or list view | The browser                                                         |

**Church & Ministry** (`features/preferences`, `ChurchMinistrySettings`). Three optional things an account says about itself:

- **Church name** and **ministry role** are a line of the person's own words each (`profileLimits` in `model.ts`: 120 and 80 characters, the same in CHECK constraints). There is no directory, no list of roles, and nothing is looked up. **The ministry role describes and never authorizes**: `users.role` decides access, and no access helper reads `ministry_role`.
- **Attending preaching class** (`attendsPreachingClass`) is a yes or no the person chooses, false until they say otherwise. It is never worked out from a role, a context, or the preaching record, and it is independent of the ministry role. It decides what is _suggested_ for the class (today, the Preaching Class context; see "Preaching history") and nothing else: switching it on creates no context, occasion, or idea, switching it off removes none, and nothing is withheld from an account that has it off.
- **One way in.** `profileSchemas(locale).profileUpdate` (`schemas.ts`, no server code) is the validation, `saveProfile` (`preferences.ts`) the write, and `updateProfile` (`actions.ts`) the one server action: `authorize("active")`, the account from the session, unknown fields dropped. A field left out is left alone, and null or a blank clears a line, so any form may send only what it shows. The settings page is one caller; first-time setup (Phase 4A) is the other, with the same schema and action.
- **Reading.** The two lines are read from the caller's own row with `storedProfile(user)`. Whether the account attends preaching class is on `getPreferences()` with the language and the translation, and the `(app)` shell hands it to the browser through `PreachingClassProvider` (`useAttendsPreachingClass()`, false without one). The server never relies on what the browser was told.
- The administrator's directory (`withIdentities`) leaves all three out: they are the person's own.

| Operation                                                        | Where it runs                                         | Why                                                                                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Change name                                                      | Server action `updateProfileName` → Clerk Backend API | Our validation, our `authorize("active")`, the ID taken from the session                                                    |
| Password, email addresses, connected accounts, sessions, picture | Clerk's browser SDK on the signed-in `user` object    | Clerk's Frontend API enforces the current password, emailed codes, and reverification. The Backend API would skip all three |

- Every browser-side call is wrapped in `useReverification`. When Clerk demands a fresh identity check it opens its own dialog (themed by `clerk-appearance.ts`); that step is deliberately Clerk's, not ours.
- Structure: `features/settings/hooks/` holds every Clerk call (`use-profile`, `use-email-addresses`, `use-password`, `use-connected-accounts`, `use-sessions`); `components/` only render and call them. `AccountGate` waits for the SDK to load. `clerk-errors.ts` maps Clerk error codes to our wording, so provider text is never displayed.
- `schemas.ts` validates names, addresses, codes, passwords, and picture files for quick feedback. Clerk's own rules still apply and win.
- Role, status, and joining date are shown read-only from the `users` row. No action accepts a role, a status, or a user ID.
- A connected account cannot be disconnected when it is the only way to sign in. The provider list is the constant in `use-connected-accounts.ts` (Google), because the SDK has no public list of enabled providers.
- Appearance reuses `ThemeToggle` on the same `next-themes` store as the bar, plus "Use device setting" to clear a manual choice. Nothing about the theme is saved to the account.
- Bible (`BibleSettings`) is one choice, what the reader's copy shortcut copies. It too is kept in the browser and not on the account.
- Language (`LanguageSettings`) is the interface language and the Bible translation. Unlike the two above they are saved to the account (see "Languages and translations"). While Spanish is switched off it says so instead of offering a choice.
- The library's card or list view is not repeated here: its control is in the library, where its effect is seen.
- App & Experience also holds "Run Account Setup", a link to `/onboarding` (see "First-time setup"). Opening it changes nothing.
- Having been through setup is `users.onboarding_status` and nothing else. An account that has said nothing about itself still has nulls and false, which every surface reads as "not said", and which never decides whether setup is owed.
- Account deletion is not implemented.

### Caching

Cache Components is on. The service worker keeps only the offline page and public static files (see "Installed application"). Nothing user-specific uses `use cache`; the cached functions are `getChapter`, which returns Bible text and knows nothing about the caller, and beside it `getPsalmTitles`, the same kind of read. The `(app)` layout puts the shell behind `<Suspense>`, and Clerk's forms sit behind `<Suspense>` because they read the URL. `<ClerkProvider>` is inside `<body>` and is rendered only when Clerk keys are configured, so the public site builds and runs without credentials.

## Landing page

`/` is the one public page (`src/app/(marketing)`, `src/components/marketing`). It is five sections in this order: the hero, How It Works (`#how-it-works`), Features (`#features`), Mobile App (`#mobile-app`), and the closing band (`#access`). The way in is Sign In; there is no request or sign-up action, because no such route exists.

**Its screens are reconstructions, not the application and not screenshots.** `preview/` draws the dashboard, Sermon Ideas, the outline editor, the Bible reader, and the Preaching Record again as plain markup, in two frames (`WindowFrame`, `PhoneFrame`). Each copies the classes of the real component it is named for and reads the same dictionaries, and reuses only what is already pure (`Badge`, `TagChip`, `Logo`, `appLinks`, `formatDate`, `formatReference`, `entryLabel`, `summaryStats`). The real components are not rendered there: they bring client providers, server actions, links, and an account. So a reconstruction does not follow a change to the real screen by itself; when a screen changes, change its reconstruction.

- A reconstruction is a picture. `Preview` wraps it in a `<figure>` whose drawing is `aria-hidden`, takes no pointer, and holds no link, button, input, or heading; one visually hidden `figcaption` describes it.
- A window is drawn at a desktop's width and a phone at 390px, then scaled with `zoom`, so type and spacing keep their proportions. A window too wide for its place is cropped at the right (`Cropped`); nothing widens the page.
- **The hero follows the device in CSS alone**: the window from `md` up and the phone below it, the boundary where the application itself changes from its link row to its tab bar. The Features section shows the other device's dashboard, so both are seen at every width. No user-agent check.
- Everything shown comes from `demoWorkspace(locale)` (`demo.ts`): one fictional account, its words in the `marketing` dictionary under `demo`, its dates fixed. Continue Working, Revisit an Idea, the four figures, and the lists are worked out from the same ideas and occasions by the application's own rules (`activeStatuses`, `unfinishedStatuses`, `revisitAfterDays`), and `landing.test.tsx` checks that they agree. The verses are the KJV's and the RVG's own words.
- The page is in the visitor's language. The `(marketing)` layout and the page each ask `getPreferences()` behind their own `<Suspense>`, as the `(auth)` shell does, so the page is rendered per request and no longer prerendered whole. `GuestLanguage` in the footer sets the language cookie, where Spanish is on.
- The sections take a `locale` prop and call `dictionary()`; `Landing` can be rendered without a request.

## Design system

Direction (Phase 1B.1): modern editorial software. Neutral foundations, opaque cards, glass only on layers that float, and emerald as the signature rather than the surface. One thing is meant to be remembered: the **lit edge**, a short line of emerald light on the top border of a featured surface, with a single diffused emerald glow behind the hero window. `docs/brand/brand-board.png` is the original board and is kept as a reference for the mark.

### Tokens

All tokens live in `src/app/globals.css` in three layers:

1. **Brand palette** (`--brand-*`): the only raw brand hex values. Emerald `#127A5B` and `#2DA985`, lamp `#1FBF8F` and `#5FF0BE`, gold `#A47B35` and `#D5B574`, ink `#17181B`, paper `#F7F5F0`, ivory `#EFEBE2`, charcoal `#0E0F11`.
2. **Semantic tokens**, defined separately for light (`:root`) and dark (`.dark`).
3. **`@theme inline` mapping**, which exposes them as Tailwind utilities (`bg-surface`, `text-muted-foreground`, `shadow-raised`, ...).

| Token                           | Light                 | Dark                   | Use                                                 |
| ------------------------------- | --------------------- | ---------------------- | --------------------------------------------------- |
| `background`                    | `#F7F5F0` warm paper  | `#0E0F11` charcoal     | Page canvas                                         |
| `surface` / `card`              | `#FFFFFF`             | `#17191C`              | Cards, tables, inputs (opaque)                      |
| `surface-raised` / `popover`    | `#FFFFFF`             | `#1F2125`              | Mobile panels, Clerk, the glass fallback            |
| `muted`, `secondary`, `accent`  | ink 4.5% / 6% / 7%    | white 5% / 7% / 8%     | Quiet fills, tracks, hover highlight                |
| `foreground`                    | `#17181B`             | `#EFEBE2` ivory        | Primary text                                        |
| `muted-foreground`              | `#5E6168`             | `#A3A4A1`              | Secondary text                                      |
| `border` / `input`              | `#E4E1D9` / `#D2CFC6` | white 9% / 16%         | Hairlines, control borders                          |
| `primary` / `primary-hover`     | `#127A5B` / darker    | `#2DA985` / brighter   | Actions, links, selection, current navigation       |
| `primary-soft`                  | emerald 9%            | emerald 14%            | Tint behind a selected or highlighted item          |
| `highlight-yellow` … `-red`     | pastel at 52–72%      | the same at 27–30%     | The Scripture highlighter's four inks; nowhere else |
| `ring`                          | `#127A5B`             | `#5FF0BE`              | Focus outline                                       |
| `lamp`                          | `#1FBF8F`             | `#5FF0BE`              | The lit edge only; never text or fills              |
| `gold` / `gold-ink`             | `#A47B35` / `#7D5F24` | `#D5B574`              | Small editorial details; `gold-ink` when it is text |
| `destructive` (+ `-foreground`) | `#B42318` / white     | `#F97066` / near-black | Destructive actions and errors                      |
| `nav`, `float`                  | paper 74%, white 82%  | charcoal 70%, 78%      | Glass: the bar, and floating layers                 |
| `glow`                          | lamp 24%              | emerald 28%            | The hero's one diffused light                       |

Shadows are tokens too: `shadow-card` (resting cards and controls), `shadow-raised` (the hero window, auth card, floating layers), `shadow-focus` (a soft 3px emerald halo on a focused input).

Rules:

- Components use semantic utilities only. Do not write hex values or `--brand-*` variables in components. The one exception is the logo mark, which is a fixed asset.
- **The interface is neutral.** Emerald is for primary buttons, links, current navigation, selection, focus, kind markers, the lit edge, and the hero glow. No green card backgrounds or green sections.
- **Gold is a detail**: the stage numerals, the ribbon tip, the short rule on the closing band, the star on a favorite. Never a fill or a button.
- **The highlight colors are for Scripture highlights only**: behind a verse's words, and on the swatches that choose or filter by them. They come from `#FDE68A`, `#86EFAC`, `#93C5FD`, and `#FCA5A5`, thinned separately for each theme so the text stays the strongest thing in the line. Components use `bg-highlight-*` through `highlightBackground` (`features/scripture/saved/highlight-style.ts`); a color is always named in words wherever it is shown.
- Quiet fills are translucent ink (or white in dark), so they work on the canvas and on a card alike. `accent` keeps the shadcn meaning (a subtle interactive highlight) so added primitives behave.
- Each theme is designed separately: light uses hairlines, soft shadows, and a tinted shadow for glow; dark uses lighter surfaces for elevation, a top inner highlight, and a real (but tight) emerald light.

### Glass

Glass is for things that float over other content, and nothing else:

- `glass` — the fixed bar. Neutral tint, 16px blur, hairline; add the border side you need. `glass-settle` makes it clear at the very top of the page and glass once content is under it, with a CSS scroll-driven animation (no script; always glass where unsupported).
- `glass-float` — dropdown menus, popovers, selects, dialogs, sheets, and the toast. Denser than the bar so text stays readable over anything, with its own border, inner highlight, and raised shadow. Dialogs raise the opacity further (`--float` override in `ui/alert-dialog.tsx`).
- Both fall back to an opaque surface when `backdrop-filter` is unavailable.
- Cards, tables, forms, and the mobile navigation panels are opaque. Do not nest glass inside glass: a backdrop filter inside the blurred bar cannot see the page.

### Glow

Glow and animation are allowed, used sparingly (the owner's rule, 9 October 2026; before that glow was limited to the first three uses below and nothing looped). Each use should be worth a visitor's attention, and a view should have very few. The uses today:

- `lit-edge` — the signature. A static 1px emerald line centred on the top border of a featured surface, with an 8px bloom. One per view: the hero window, the auth card. It makes the element `position: relative`; put it on a wrapper if the element clips its overflow.
- `hero-glow` — one radial gradient behind the hero window (and, faintly, the auth card). Nothing is blurred or animated. It reaches past its element, so an ancestor must clip sideways (`overflow-x-clip`), or narrow screens scroll horizontally.
- `shadow-focus` on a focused input.
- The splash screen's glow and passing light, and the progress bar's faint glow (see Loading). They are seen for a second or two at a time.
- `breathe-ring` — the capture control's edge, in the bar and in the tab bar. Over five seconds a ring of emerald light and a faint 4px halo come and go around it. The ring is a pseudo-element, apart from the control's own border and shadow, so hover and focus keep their transitions: on hover the border turns emerald, the focus halo eases in, and the plus makes a quarter turn. It is the one animation that loops for as long as a page is open, on the application's one central action.

A further use should clear the same bar as that one: slow, light only (nothing moves or resizes), built from the tokens so both themes work, drawn so that it never takes a property the control's hover or focus needs, and static under reduced motion.

Ordinary buttons still do not glow. The primary button's hover is a color step to `primary-hover`; an earlier emerald ring and halo on hover was removed at the owner's request.

### Other utilities

- `scroll-quiet` — a thin neutral scrollbar for scrolling areas inside floating layers.
- `container-page` — the shared content container (76rem max, responsive gutters). Header, sections, and footer all use it so edges align.
- `h-bar` / `pt-bar` — the bar height (`--bar-h`, 56px). A shell that renders the fixed header offsets `main` with `pt-bar`. `html` has `scroll-padding-top` of the same value, so in-page anchors need no offset of their own.
- `animate-menu` — short entrance for status messages. `animate-sheet` unrolls the mobile sheets from the bar, `animate-menu-row` staggers their rows (`--i`), and `animate-sheet-out` is the exit, all applied through `useNavPanel` (`components/layout/use-nav-panel.ts`), which keeps a closing panel mounted and inert until the animation ends.
- `breathe-ring` — the capture control's slow breathing edge (see Glow). It makes the element `position: relative`.
- `animate-rise` — the hero's entrance on load, staggered with `[animation-delay:…]`.
- `reveal` — the landing page's entrance: a fade and a 20px rise over 0.7s, once, the first time the element comes into view (`--i` staggers neighbours). It hides nothing until `components/marketing/reveals.tsx` has set `data-reveal` on `<html>`, so without the script, and under reduced motion, the content is simply there.
- `stagger`, `mark-in` — inside a reconstructed screen on the landing page: its rows arriving one after another (`--i`), and a highlight settling onto a verse. Inside a `reveal` they wait for it. Each plays once. Not for the application.

### Geometry and layout

- Radius follows hierarchy, from `--radius` 8px: `rounded-md` 6px (chips, menu items), `rounded-lg` 8px (buttons, inputs), `rounded-xl` 12px (cards, tables, menus, dialogs), `rounded-2xl` 16px (the hero window). `rounded-full` is for dots and the avatar.
- Marketing sections are `py-14 lg:py-20` and sit directly on the canvas, so two neighbours are 160px apart at `lg`; the space above a section's content block is `mt-10 lg:mt-14`. Sections are separated by that spacing alone. The one rule is the closing band's hairline. Application pages are `container-page py-10 lg:py-12` and start with `PageHeader`.
- Not everything is a card. The three stages hang from a rule; the closing band is a hairline; empty states are dashed outlines.

### Typography

- `font-sans` (Figtree): all interface text — navigation, controls, tables, forms, body copy. Dense data is 14px with `tabular-nums`.
- `font-display` (Playfair Display): headlines only — the wordmark, landing headlines, page titles, dialog titles. Always weight 500 or 600 with slight negative tracking; never bold, never italic (the italic is not loaded), and never for text that is read at length: its thin strokes do not hold up at reading sizes.
- `font-serif` (Lora): sermon material, set to be read — Scripture text, idea titles, and Scripture references in italic. Weight 400 or 500.
- The owner chose this trio from samples on 2026-10-10, replacing Montserrat (too wide at small sizes) and Playfair for verse text (too fine).
- Scale: hero `2.5–4.75rem`, balanced over two or three lines, with its copy and actions in one left-aligned column beneath it; marketing section headings `2rem → 2.625rem`; application page titles `1.875rem → 2.125rem`; in-page section headings are sans, `text-lg font-semibold`. Supporting copy is `1.0625rem` in `muted-foreground`, capped near `max-w-xl`.
- No uppercase tracked labels, and no serif inside tables, forms, or controls.

### Motion and interaction

- Interactions answer in 150–200ms with color, border, and shadow. Nothing lifts or scales up on hover. Buttons press in slightly (`scale-[0.98]`) on click, and a trailing icon marked `data-trailing` nudges forward (leading icons and spinners stay put).
- Everything that acts on a click shows the hand cursor: a base rule in `globals.css` covers buttons, `role="button"`, menu items, and `summary` (Tailwind 4 leaves buttons on the arrow), and links have it natively. Disabled controls keep the arrow, as does the theme option that is already selected.
- Text links take `link-underline` (in `globals.css`), never `hover:underline`: the line is always present in a transparent color and fades in with the text color. Icons inside menu rows carry their own color transition, so they change with the row.
- Only interactive elements have hover states. Illustrations, informational cards, and table rows do not.
- Every hover has a matching pressed state: buttons press in, and quiet controls (navigation links, icon buttons, the theme options) darken to `active:bg-foreground/10`.
- Compact controls are for a pointer. On touch screens (`pointer-coarse:`) small and icon buttons, menu rows, menu triggers, and the theme options grow to 44px.
- Load motion is one sequence: the hero rises in, and the rows of its dashboard follow. **The landing page alone has scroll-triggered entrances** (`reveal`, with `stagger` and `mark-in` inside its reconstructions; the owner's direction, 13 October 2026): each plays once and nothing loops. The application has none. The one looping animation anywhere is the capture control's breathing edge (see Glow).
- A global `prefers-reduced-motion` rule removes animation, delays, and smooth scrolling; the landing page's entrances are then not switched on at all.
- Every focusable element gets a visible 2px `outline` in the `ring` color. Disabled controls are 50% opacity with no pointer events; busy actions change their label ("Sending…", "Working…"), show a spinner (`LoaderCircle` with `animate-spin`), and set `aria-busy`. Action results (`ActionStatus`) carry an icon as well as a color.
- The root layout provides a skip link; each shell must render `<main id="main">`.
- Text color pairs were chosen for WCAG AA contrast in both themes.

### Theming

`next-themes` sets a `class` on `<html>`, follows the system preference by default, persists a manual choice in `localStorage`, and applies it before first paint. `ThemeToggle` is a Light / Dark radio group with no System option: until the visitor picks one, the site follows the operating system and the matching option shows as selected. Its checked state is set only after hydration, so server and client markup match. A theme change cross-fades through the View Transitions API where supported and motion is allowed. Do not add a second theme mechanism.

### Navigation

`SiteHeader` is a fixed, full-width, 56px glass bar with a bottom hairline (`glass glass-settle`). Its section links are in the order of the page (How It Works, Features, Mobile App), and `SectionLinks` marks the one being read with `aria-current="location"` and the emerald rule the application bar uses. Its words come from the `marketing` dictionary, in the visitor's language. Its logo is `HomeLink`, which on the landing page scrolls to the very top and clears any section hash, since a link to the current URL would otherwise do nothing. From `md` up it shows section links, the theme control, and Sign in inline. Below `md`, `MobileNav` shows a menu button (two lines that cross into an X) and an opaque sheet that unrolls under the bar, set like a contents page: section links in Playfair with hairlines between, Sign in, and the theme control. The page dims behind it; tapping the dimmed area or pressing Escape closes it, and widening the window past `md` removes it. Section links (`#…`) are plain anchors, not `next/link`, which does not scroll again to a hash already in the URL. While the panel is open the bar turns opaque to match it (the panel carries `data-nav-panel`, and the header reacts with `has-[…]`), so the two read as one sheet even at the top of the page where the bar is otherwise clear.

`AppHeader` is the same bar for the authenticated shell: Dashboard and Library links, the Capture control, and `AccountMenu` (name, email, Settings, Administration for administrators, Light / Dark as menu radio items, sign out; the trigger shows the profile picture or initials). Settings is reached from the account menu and the dashboard, not the link row. Below `md` the bar keeps the logo and an avatar button. The avatar opens the account sheet (identity with the theme control beside it, Settings, Administration for administrators, sign out), built on the same `useNavPanel` sheet as `MobileNav`. A round `BackToTop` button floats in the bottom corner of both shells once a page has scrolled a full screen, above the tab bar where there is one. Destinations move to a fixed tab bar at the foot of the screen, with quick capture as a round outlined button in its centre, styled as the bar's Capture control is; the `(app)` layout pads `main` for it. The link row and the tab bar both read `appLinks()` in `components/layout/app-links.ts`: add a destination there, with its icon, only once its page exists, and keep the tab bar to five including capture. The Bible reader joined it in Phase 2C.1A (Dashboard, Library, Bible; on a narrow screen the tab bar is Dashboard, Library, capture, Bible). Saved Scripture (2C.1B) did not join it: it is a section of the library, reached from the library. **Outlines joined it in Phase 3C** (Dashboard, Library, Outlines, Bible; on a narrow screen the tab bar is Dashboard, Library, capture, Outlines, Bible, which is the five it holds). It is the overview at `/outlines`, and is current on an outline's editor too; the editor is one outline and is not a destination. Administration is not a destination: it is reached from the account menu and the account sheet. In the bar, Capture is a quiet outlined pill matching the account button, with only its plus in emerald and a slowly breathing edge; the owner found a solid emerald button there too heavy. The current page link is ink with a 2px emerald rule just beneath its label, via `aria-current` (it sat on the bar's bottom edge until the owner asked for it closer to the text). The bar, menus, and dialogs are all `z-50`; menus and dialogs render in a portal at the end of `<body>`, so they sit above the bar. The skip link is `z-60`, the progress bar `z-70`, and the splash screen `z-100`.

The logo link in a bar must be `flex items-center`: as an inline box it sits on the text baseline and lands a few pixels above the row's centre.

Clerk is provided once, by `AppClerkProvider` (`components/layout/clerk-provider.tsx`), a Client Component the root layout mounts. **Clerk's own forms follow the page's language**: Clerk takes its language on its provider and nowhere else (a second provider around one form is ignored), and the root layout is static, so the provider watches `<html lang>`, which every shell's `I18nProvider` sets from the language in force, and hands Clerk its Spanish (`esMX` from `@clerk/localizations`, fetched only then) when that is Spanish. The form is drawn in English for a moment before it turns. The auth shell has a "Back to home" link in words under its card, beside the language choice, because the logo alone does not say it leads home.

Clerk's sign-in, sign-up, and profile components are styled through `src/lib/clerk-appearance.ts`, which maps Clerk's variables to the CSS tokens so they follow the theme class, and matches Clerk's card to `AuthNotice` (same radius, hairline, and shadow), its primary button to `Button` (40px, no gradient sheen, same color-only hover), and its inputs to `Input` (hairline, darker on hover, emerald line and soft halo on focus). Clerk draws input borders as box shadows and its own focus ring is a solid 4px band, so the focus override is `!important`. The card is given an opaque background so the glow behind it cannot tint Clerk's translucent footer strip. Clerk's components load from its CDN, so there is no local source to read: inspect the rendered `cl-*` elements when changing this file. The auth shell is the logo above one card; the shell's wrapper supplies the lit edge and glow to whichever card it holds.

### Components

shadcn/ui is configured in `components.json`. Add a primitive with `npx shadcn@latest add <name>` only when a feature needs it, then restyle it to the tokens as `ui/button.tsx` does.

- **Button**: `default` (emerald; hover is a color step only), `secondary`, `outline`, `ghost`, `destructive`, `link`. `outline` is the secondary action beside a primary one; on hover its hairline turns emerald (`border-primary/70`), as does the account trigger's and Clerk's social button. For navigation styled as a button, apply `buttonVariants()` to a `<Link>`.
- **Input**: white surface, hairline, darker border on hover, emerald border and `shadow-focus` on focus, `aria-invalid` in destructive.
- **Dropdown menu, alert dialog**: `glass-float`. Destructive items and confirmations use the destructive color.
- **`Dialog`** (`ui/dialog.tsx`): every other modal layer, with a `placement`: `top` (a form, clear of the on-screen keyboard), `bottom` (a short sheet), `side` (a panel down the right edge), `full` (a whole narrow screen).
- **`Popover`**: a small floating panel anchored to its trigger.
- **`Select`** (`ui/select.tsx`): the dropdown for a known set of options. Native `<select>` is not used, because its menu cannot be styled. `layout="grid"` sets short options (chapter and verse numbers) in rows. The selected option is emerald; group headings stay neutral.
- **`Segmented`**: a choice between a few options, side by side, built on native radio buttons.
- **`Textarea`**: styled as `Input`.
- **Toast** (`ui/toast.tsx`): `useToast()` shows one short confirmation at the foot of the screen, with an optional link. It is a status region and never takes focus.
- **`PageHeader`** (`components/layout/page-header.tsx`): title, one line of context, hairline, and optionally the page's one main `action` at its end (the library's Capture). Every application page starts with it.
- **`StatusPage`** (`components/layout/status-page.tsx`): a page with nothing to show but what happened. Centered under the bar with no card: a neutral icon, the title, one line of help, one or two actions, and on a failure the reference (`error.digest`) to quote. The four that exist are built from it and nothing rebuilds its layout: a failed application page (`app/(app)/error.tsx`), an idea that is not there (`app/(app)/library/[id]/not-found.tsx`), an address nothing answers to (`app/not-found.tsx`, outside the shell, with its own bar), and a failure of the root layout (`app/global-error.tsx`, which replaces the document and so takes its fonts from `app/fonts.ts` and its language and theme from the page it replaces).
- **`Badge`** (`ui/badge.tsx`): `accent`, `muted`, `danger`.
- **`StatStrip`** (`ui/stat-strip.tsx`): summary figures as one divided strip. A stat is a number, a real zero included; a word for "unavailable" when it could not be loaded (`unavailable`, so the page says it in its own language); or a sentence (`pending`) for a measure that does not exist yet.
- **`ActionStatus`** and **`ConfirmDialog`** (`ui/`): the result line and the confirmation used by every consequential action.
- **`Avatar`** (`ui/avatar.tsx`): profile picture or initials. A plain `<img>`, since Clerk serves and sizes the image.
- **Settings layout**: `SettingsPageHeader`, `SettingsStack`, and `SettingsBlock` (one card per group of controls, a `region` named by its title); `SettingsNav` and `SettingsCategoryList` read `settingsCategories`; `TextField` is a labelled input with its error or hint.
- **Card**: there is no card component. A card is `rounded-xl border bg-surface shadow-card`; an empty state is `rounded-xl border border-dashed border-input`.
- **Tables**: plain header row, 14px rows, no row hover (rows are not links). Below `sm`, secondary columns fold into the first cell rather than scrolling sideways.

### Logo

- `LogoMark` (`components/brand/logo-mark.tsx`) is the icon as inline SVG with four variants: `primary`, `dark`, `light`, `mono`. The tile stays emerald; on the neutral bar it is the one solid block of green.
- The bookmark is a gold ribbon over the top of the left page, and the book is centred vertically on the tile. The ribbon is drawn as cloth, not a rectangle: its edges sway slightly, its top corners are soft, its tail is cut a little unevenly, and it casts a faint shadow on the page (omitted in the `mono` variant). It is shaded (black at 18%) where it folds over the page's top edge, and the two lines of text beside it stop short of it instead of running underneath. The owner wants it kept in this position.
- `Logo` is the lockup: mark plus the wordmark in live Playfair Display, raised slightly (`-translate-y-[0.065em]`) so the midpoint of its capitals sits on the mark's centre and its text lines up with the navigation beside it. Playfair's baseline sits low in a `leading-none` box; judge this by measuring the glyphs, not the element's box.
- `Ribbon` (`components/brand/ribbon.tsx`) is the bookmark from the mark as a UI marker. It is currently unused and kept for the Phase 2 library.
- `public/brand/mark.svg` is the standalone primary mark. `src/app/icon.svg` is a simplified small-size version for the favicon. Keep all three in step.
- `npm run brand:assets` regenerates `apple-icon.png`, `icon-192.png`, `icon-512.png`, and `opengraph-image.png` from `mark.svg`; `npm run brand:assets -- share` regenerates the share card alone, and `-- icons` the icons alone (with the two maskable ones). The share card is described under "SEO and metadata".
- If a designer-made vector is supplied, replace the paths in `LogoMark`, `mark.svg`, and `icon.svg`, then rerun the script.
- Never substitute a generic icon or emoji for the logo.

## SEO and metadata

- Base metadata is in the root layout: title template, description, Open Graph (with `url`), Twitter card, `metadataBase` of `https://sermontracker.com`.
- **One share card for the whole site**, `src/app/opengraph-image.png` (1200 × 630, PNG, committed; [handoff](docs/HANDOFF-SOCIAL-CARD.md)). Next's file convention adds `og:image` with its absolute address, size, type, and alt text (`opengraph-image.alt.txt`), and fills `twitter:image` with the same image because the layout's `twitter` names none: do not add a `twitter-image` file or `twitter.images`. It is always dark: the mark and the wordmark, "Every Great Sermon Starts Somewhere." and "Capture ideas. Build outlines. Keep your preaching record." on the left; the dashboard as a window with the lit edge, and a phone, on the right, in the dark tokens. It is drawn by `scripts/brand/share-card.mjs`, which imports `demoWorkspace` and the dictionaries directly (Node strips their types; a small resolve hook maps `@/`), so its titles and figures are the landing page's fictional account and cannot disagree with it. When the dashboard or the demo changes, run `npm run brand:assets -- share` and commit the image. It is not generated at build or request time.
- The landing page sets its canonical URL, and its title and description in the visitor's language (`generateMetadata`, from the `marketing` dictionary). Open Graph and the share image are the root layout's, in English. `/sign-in`, `/accept-invitation`, `/access-denied`, and everything under `(app)` are `noindex`.
- `robots.ts` disallows every application path. On any Vercel deployment that is not production (`VERCEL_ENV`), the whole site is `noindex` and `robots.txt` disallows everything.
- A page that sets its own `openGraph` object replaces the inherited one, including the share image. Extend it deliberately.
- The web app manifest is `app/manifest.ts` (Phase 5A; see "Installed application"). The landing page's Mobile App section (`marketing.mobile`) describes installing as it now works: Share and Add to Home Screen on an iPhone or iPad, the browser's menu or address bar elsewhere, signing in once if asked, and the steps in Settings. It says the app needs a connection and claims no offline use.

## Domain decisions

These are settled and constrain later phases. The first and fourth are implemented (Phase 2A); the rest are not.

**Unified ideas.** One library holds sermon ideas, reusable point ideas, and undecided ideas. They are one kind of record distinguished by type, not separate systems. An undecided idea can later become a sermon or a point.

**Sermons and points are many-to-many.** A point may belong to zero, one, or many sermons and remains an independent, reusable record. Since Phase 2F.2 a point can be related to a sermon (`sermon_points`), which says only that the two go together. Per-sermon data (order, optional parent for subpoints, sermon-specific wording, sermon-specific notes, and Scripture overrides) belongs to the outline entries of Phase 3, a separate table that names the point directly; it is not added to `sermon_points`. Since Phase 3A that table is `outline_entries`, and it names the point as `source_point_id`.

**Outlines are built from existing records.** An outline has a title or subject, a main Scripture, an optional introduction, ordered main points with optional subpoints, an optional conclusion, and references and notes. Introduction and conclusion are both optional and are distinct structural sections of the sermon, not point records. This is an outline organiser, not a manuscript editor. The data for this is implemented (Phase 3A, "Outlines" above): an outline belongs to a sermon that already exists, its title, subject, and main Scripture are the sermon's own, and an entry made from a saved point is a copy that remembers its source.

**Quick capture is a primary feature.** A thought must be saveable in seconds, especially on mobile, from anywhere in the authenticated shell and without choosing a type first.

**Offline comes later (Phase 5).** To keep synchronisation feasible: use client-generatable IDs (UUIDs) for idea records, keep `created_at`/`updated_at` on every record, and route mutations through a small number of well-defined server actions rather than scattering writes.

**Sharing creates independent copies (later; not yet numbered).** Accepting a shared idea copies it; it does not link two users to one record.

## Testing

- **Vitest**: configuration logic, component rendering (jsdom), the migration guard, the Bible dataset and its loader, and the auth, admin, dashboard, settings, ideas, library, tag, Scripture, saved Scripture, preaching history, and outline code. Database tests run the committed migrations on PGlite, an in-memory PostgreSQL; Clerk is always mocked, so no test verifies Clerk itself.
- **Playwright** (desktop Chrome and a mobile viewport): page rendering, metadata, navigation, theme behaviour, keyboard access, and horizontal overflow. It builds and serves the production app on port 3100 and stops the server when the run ends.
- **Signed-in end-to-end** (`tests/e2e/library.spec.ts`, `bible.spec.ts`, `saved-scripture.spec.ts`, `scripture-ideas.spec.ts`, `preaching-record.spec.ts`, `outline-editor.spec.ts`, `outlines-integration.spec.ts`, `onboarding.spec.ts`) uses `@clerk/testing`: a one-time sign-in ticket from Clerk's Backend API, no password anywhere. It runs only when `E2E_CLERK_USER_EMAIL` names an admitted user of the development Clerk instance, refuses a production key, and is skipped otherwise. It creates its own ideas and tags under a prefix unique to the run and deletes them.
- **`onboarding.spec.ts` is run by itself** (`npx playwright test onboarding --workers=1`). The test account owes no setup, so the spec makes it one that does for as long as it runs and puts it back exactly as it was (`tests/e2e/onboarding-account.ts`, the one place a spec writes to the database, and only to one stamped development). Any other signed-in spec running beside it would be sent to setup.
- **Timing in end-to-end tests is measured inside the page.** The splash and the progress bar wait for the page's `load` event, which takes as long as the machine is busy. `loading.spec.ts` records each change of the splash's state with a `MutationObserver` and checks the order and the gaps (never down before its 1.2 second opening, or 0.5 seconds with reduced motion; down within moments of the later of that and `load`), so the result does not depend on how many workers are running.
- **`tour.spec.ts` is run by itself too** (`npx playwright test tour --workers=1`). It runs the product tour from Settings on the shared test account and puts back where the account's tour stood (`keepTourState` in `tests/e2e/onboarding-account.ts`). With `E2E_TOUR_SHOTS` set to a folder it saves a picture of every stop.
- **`pwa.spec.ts`** runs on the production build, where the worker is registered: the manifest and icons, what the worker keeps, the offline page under `context.setOffline`, opening on sign-in, and (signed in, reading only) an update offered and taken. Chromium here cannot emulate the `display-mode` media query, so the installed window is emulated as iOS reports it (`navigator.standalone`), and what CSS alone hides there is checked by hand. `service-worker.test.ts` runs the worker's own script in `node:vm`.
- Keep the suite proportionate. Test behaviour that matters, not markup.

### How much to verify

Verification is in proportion to what changed and what could go wrong, in every phase. It is neither skipped nor run at its widest by habit.

- **While building:** type checking, lint and formatting on the files touched, the tests of what changed, and the tests of what depends on it. Not the whole suite after each edit.
- **At an integration or release boundary:** what the change justifies on top of that. A production build, once, after the code has settled; the end-to-end journeys for the workflows that matter; a look at routing, at anything that guards access or data, at the migration against the deployment process, and at keyboard use and narrow screens for new controls.
- **The whole unit suite or the whole end-to-end suite:** when the change is shared (routes, authentication or authorization, a migration, layout or other shared components, the dictionaries), when a failure suggests damage beyond the feature, or at a major release. The handoff says whether they were run and why.

The rules that go with it:

1. Every phase ends verified. A check of access, ownership, or data integrity is never put off to move faster.
2. A phase's verification is part of that phase. A separate hardening phase is planned only when there is real work of its own to fill one, so that nothing unverified piles up from phase to phase.
3. A result holds for the code it was run on. A later change means running again whatever it could have affected, and no more.
4. Use the fixtures and helpers that exist. Do not write a second test of what one already proves, and do not add a test framework for one phase.
5. A handoff says exactly what was run and what it showed, what was not run, and what was read instead of run. Passing in development, a production build passing, a migration reviewed, a migration applied in production, and a deployment made are five different things and are reported apart.

## Security

- The repository is public. No secrets in source, docs, tests, or examples.
- Secret variables stay server-side; only values prefixed `NEXT_PUBLIC_` reach the browser. Database and Clerk server modules import `server-only`.
- Authorization is decided on the server from the database on every request. Client-side role checks only decide what to show.
- Migration commands identify the database before touching it and refuse on any doubt. See [docs/DATABASE.md](docs/DATABASE.md).
- See [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

## Decisions log

| Decision                                               | Reason                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Route groups for marketing, auth, and app shells       | Each shell has its own layout; auth can wrap `(app)` without touching public pages      |
| Hex values taken from the written brief                | The brand board labels differ by a character in places; the brief is authoritative      |
| Canonical origin is a constant, not an env variable    | Previews should still canonicalise to production                                        |
| Static generated share image rather than `next/og`     | Uses the real fonts and mark with no build-time network dependency                      |
| No manifest in Phase 1                                 | Installability is Phase 5 scope (built in 5A)                                           |
| `@vitejs/plugin-react` not installed                   | Vitest transforms JSX itself; the plugin conflicted on peer dependencies                |
| Playwright serves a production build on port 3100      | Tests what ships, and avoids a dev server on 3000                                       |
| Neon WebSocket pool, not the HTTP driver               | The last-administrator check needs an interactive transaction                           |
| Role and status as text with CHECK constraints         | Adding a value is a plain migration; no enum type to alter                              |
| Provision on first request, no Clerk webhook           | Nothing in this phase needs lifecycle events; one less public endpoint                  |
| Database identity stamp plus a declared environment    | A hostname is not proof; a mismatch anywhere stops the command                          |
| Previews share the development database and Clerk      | No production credentials outside production; one fewer environment to migrate          |
| Access denial is a redirect to `/access-denied`        | `forbidden()` is still experimental in Next.js 16                                       |
| Own account UI instead of Clerk's `UserProfile`        | Settings should look like the application; Clerk still does all identity work           |
| Credential changes call Clerk from the browser         | Only the Frontend API enforces current password, emailed code, and reverification       |
| Name changes go through a server action                | Our validation and access check; works whatever the instance's profile settings         |
| Settings has category pages and no settings table      | Nothing to store: identity is Clerk's and the theme is already in `localStorage`        |
| Unavailable figures are described, not shown as 0      | A zero would be a false statement about the person's work                               |
| Scripture references in a child table, as numbers      | Constraints, and later lookup by book; no verse text is copied onto an idea             |
| Sermon details kept when an idea is reclassified       | Turning it back into a sermon loses nothing                                             |
| Idea IDs may be generated in the browser               | A retry or double submit saves one idea; ready for offline capture                      |
| Bible text loaded by the migrate command               | A 4 MB migration would run for every test database; a checksum versions the text        |
| Bible table has no translation column                  | One translation; adding one later is an additive change to read-only data               |
| Bible read by chapter, through a route handler         | Reads are parallel and cacheable; the browser never holds the whole text                |
| Word search uses the `simple` text configuration       | Exact words, like a concordance; the archaic forms defeat English stemming anyway       |
| Search query built by hand, not `websearch_to_tsquery` | It has no prefix operator; ours admits only letters and digits                          |
| Non-adjacent verses become separate references         | A reference is one unbroken passage; no schema change was needed                        |
| Panel shares the capture dialog instead of stacking    | One modal layer at a time                                                               |
| Custom `Select` instead of the native control          | The native menu cannot be styled; the owner disliked it                                 |
| Splash decided by the proxy, signalled by cookie       | The server knows a first visit or a fresh sign-in at once; the root layout stays static |
| Splash and progress state live in a DOM attribute      | Set before paint by an inline script; no render can disagree with it                    |
| Leave guard reverses history moves after the fact      | The App Router has no way to refuse a navigation                                        |
| Administration only in the account menu                | The owner wants main navigation kept for the work: library, Bible, outlines             |
| Library search is `ILIKE`, with no trigram index       | Every search is inside one account's rows; the index would cost every save              |
| Library state lives in the URL, parsed leniently       | Links can be shared and bookmarked; a bad parameter falls back instead of failing       |
| Offset paging, clamped to the last page                | Numbered pages need a total anyway; a stale link still lands on real ideas              |
| `idea_tags` repeats the owner in both foreign keys     | A cross-account tag cannot exist even if application code is wrong                      |
| `tagIds` optional on an idea's input                   | Existing forms save without disturbing tags; the 2B.2 forms opt in                      |
| A retained subject or sermon type is not matched       | A point shows neither, so a match on them would have no visible reason                  |
| Filters repeat their URL parameter                     | Several values without a new syntax; an old single-value link still works               |
| "All tags" is a counted subquery, not a join           | One row per idea, one query however many tags, and the owner checked inside it          |
| Library view kept in `localStorage`, not the URL       | A preference of the reader, not part of what was searched for; no migration             |
| One results markup, restyled by an attribute on html   | No flash, no hydration mismatch, and both views cannot disagree                         |
| Controls build on the query last asked for             | A debounced search and a filter click cannot undo each other                            |
| The way back is a query string, re-parsed              | It can only ever produce a library address, so it is not an open redirect               |
| Tag management is a dialog in the library              | Tags are tidied while looking at the ideas they organise; no extra page or nav item     |
| Signed-in E2E through Clerk's testing ticket           | No password or bypass in the repository; development instance only                      |
| Reader location in the URL, by book number             | A place can be linked and bookmarked; numbers need no translation and validate offline  |
| Reader moves with `pushState`, not the router          | No server round trip per chapter; Back and Forward still work; the API authorises       |
| Reading position in `localStorage`, not a table        | A device preference; nothing to migrate, and a link always wins                         |
| No selection in the reader means no verses             | Nobody acts on a chapter they did not choose; the panel keeps its own rule              |
| Whole chapter is a selection state of its own          | One chapter reference, and distinct from having chosen nothing                          |
| Sidebar state remembered on the device                 | As the library's view is: a reading habit, set before paint, never in the address       |
| Psalm titles in their own table and file               | They are not verse text: the 31,102 verses, their numbers, and their checksum stay put  |
| Psalm titles read all at once, and cached              | 116 short rows; an empty table is an error, so "no title" is never cached by mistake    |
| A typed reference navigates instead of searching       | It is what was meant; the words can still be searched for with one more click           |
| The copy shortcut's meaning is a device preference     | Like the theme and the library's view: nothing to store on the account                  |
| Ctrl+C clears the selection; the buttons do not        | The shortcut finishes the job; the buttons let two things be copied from one selection  |
| A favorite is a set of verses, in a child table        | One verse, a passage, or verses apart and across chapters are all the same shape        |
| A favorite's identity is a digest of its verses        | A unique constraint refuses a second copy under any concurrency, at a fixed key length  |
| The written reference is stored on the favorite        | The library can search, order, and page in SQL; it is rewritten with the verses         |
| Highlights keyed by account, translation, and verse    | One color to a verse by construction, and a chapter's highlights are one index range    |
| Highlights and favorites do not reference each other   | Either exists without the other; deleting one cannot disturb the other                  |
| No foreign key from saved verses to `bible_verses`     | The text is reloaded wholesale and absent in tests; verses are checked in code instead  |
| Marks read per chapter, uncached, beside cached text   | The text is everyone's and never changes; the marks are one person's and do             |
| Highlights are optimistic; favorites wait for the ID   | A color must feel instant and is easy to take back; a favorite needs its real record    |
| Highlight drawn behind the words, selection on the row | Stored and temporary state stay distinguishable, and a verse can show both              |
| Saved Scripture is a section of the library            | The owner wants main navigation kept for the work; saved content has one home           |
| Two-line selection toolbar, labels by its own width    | Five actions and the reference do not fit one line beside an open sidebar               |
| Removing a favorite is confirmed inside its dialog     | One modal layer at a time                                                               |
| A favorite's passage is edited as typed text           | The audience writes references fluently; the Scripture Panel would stack on the dialog  |
| Bible text in new tables, the old ones left in place   | The live deployment reads `bible_verses` with no translation filter                     |
| RVG verses placed by position, proved by anchors       | The publisher's file has no references; both texts number alike                         |
| Interface language and translation stored apart        | Either can be changed without moving the other                                          |
| An unchosen translation is null, not a default         | It can follow the interface language until the person chooses                           |
| The Spanish switch applied in one function             | One rule for every route and action; stored choices are never rewritten                 |
| Dictionaries as plain modules, no i18n library         | Two languages, typed keys, functions for plurals; nothing to configure or parse         |
| Marks stay per translation, with a count of the other  | A highlight is on a text; the reader is told what the other holds instead of guessing   |
| A pane's translation shown from local state            | The router can hold an address change back; the text must not wait                      |
| History changed with a null state                      | Next ignores a call that hands it back its own state object                             |
| Comparing by window width; navigation steps aside      | Two columns must be readable, and must not be squeezed by the sidebar                   |
| Classifications as CHECKed text on `ideas`, no tables  | Fixed product values, not a person's taxonomy; a new value is a plain migration         |
| `captured` and a null type rewritten in a second step  | The deployment live during 0007 still wrote them; 0008 rewrote and refuses them         |
| Archiving is a date, not a status                      | An archived idea keeps its status and comes back with it; either changes alone          |
| Archive and restore leave `updated_at` alone           | Putting an idea away is not an edit, and must not reorder the library                   |
| A save has no default classification                   | Defaults are for new ideas; an update that names only a title must not reset a status   |
| No preached flag or count on an idea                   | Preaching history will be the one record of it; a second copy would drift               |
| `last_developed_at` beside `updated_at`, no backfill   | `updated_at` moves for a status change; old ideas are measured from their creation      |
| Classification words in the dictionaries, one builder  | Labels, meanings, and examples exist once per language and reach any control as a list  |
| Profile fields are columns on `users`, not Clerk data  | One place for each setting, beside the language and behind the same access check        |
| Ministry role is free text and grants nothing          | People describe themselves in their own words; access is `users.role` and nothing else  |
| Preaching class gates a suggestion, never data         | An account's contexts and record are its own whether or not it attends a class today    |
| The outline editor's state is one store outside React  | Saving must outlive the page that started it, and be tested without rendering           |
| Outline words are saved without revalidating the page  | A revalidating action returns the whole page: too much for each pause in typing         |
| Dragging a point is Pointer Events, with no package    | The menu and the keyboard already move points; a library would add only the gesture     |
| Leaving is held only for a failed save or a conflict   | A save on its way finishes after leaving; asking at every click would be noise          |
| Setup owed is a status of its own, not a date          | A date alone cannot tell an account that finished from one that never owed it           |
| Existing accounts marked in the migration itself       | A default would have sent every one of them through setup on the next request           |
| Setup enforced in the access helpers                   | Every page, action, and route already asks them; one rule, and nothing to forget        |
| `/onboarding` in a shell beside `(app)`                | The `(app)` layout is closed to an unfinished account, and its navigation leads nowhere |
| The stored step only moves forward                     | A stale tab or a repeated request cannot undo progress; Back is the browser's own       |
| Running setup again writes nothing about setup         | An account that owes none cannot be reset or completed by looking at the steps          |
| A hand-written service worker, no Serwist              | An allowlist this small is easier to audit than a plugin's defaults                     |
| The worker never stores a page                         | A page is an account's; only the offline page, fetched without credentials, is kept     |
| The worker's version is the deployment's               | Each deployment is a new script, so the browser finds the update by itself              |
| An update waits to be asked, and never over edits      | A reload would end a save on its way or throw away what is typed                        |
| The installed app opens on the dashboard               | It is for signed-in use; a guest goes to sign-in, never to the public page              |
| Installing is offered in Settings and one card         | Found once without interrupting the work; dismissed or installed, it stays away         |
