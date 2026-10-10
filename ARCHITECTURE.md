# Architecture

The primary technical reference for Sermon Tracker. Update it when a decision changes.

## Overview

One full-stack Next.js application deployed to Vercel. No separate backend, queues, caches, or global client state. Server Components by default; Client Components only where interaction requires them (theme, navigation menus, and the admin tables and forms). Clerk handles identity; PostgreSQL handles application authorization.

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
    (app)/                  Authenticated shell: dashboard, settings, admin
    icon.svg                Favicon (small-size mark)
    apple-icon.png          Generated
    opengraph-image.png     Generated share card (+ .alt.txt)
    robots.ts, sitemap.ts
  proxy.ts                  Clerk session and guest/signed-in redirects (routing only)
  db/                       Drizzle schema, connection, test database
  features/
    auth/                   Provisioning and the access helpers
    admin/                  User and invitation services, server actions, components
    dashboard/              Dashboard view, greeting, and the summary figures to come
    settings/               Account management: schemas, server action, Clerk hooks, components
  components/
    ui/                     shadcn primitives restyled to the tokens, and small shared pieces
                            (Badge, Avatar, StatStrip, ActionStatus, ConfirmDialog)
    brand/                  LogoMark, Logo, Ribbon
    layout/                 SiteHeader, MobileNav, AppHeader, AccountMenu, PageHeader, SiteFooter, ThemeProvider, ThemeToggle
    marketing/              Landing-page sections and their sample content
  lib/
    site.ts                 Site config and the route map
    action-result.ts        The `{ ok, message }` shape every action reports
    format.ts               Date formatting that is identical on server and browser
    env.ts                  Zod-validated environment access
    clerk-appearance.ts     Clerk components mapped to the design tokens
    utils.ts                cn()
public/brand/               mark.svg, icon-192.png, icon-512.png
scripts/                    generate-brand-assets.mjs, db/ (migration commands)
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

| Path                 | Purpose                                    | Phase | Indexed |
| -------------------- | ------------------------------------------ | ----- | ------- |
| `/`                  | Public landing page                        | 1A    | Yes     |
| `/sign-in`           | Clerk sign-in                              | 1B    | No      |
| `/accept-invitation` | Account creation from an invitation link   | 1B    | No      |
| `/access-denied`     | Shown to disabled or unauthorised accounts | 1B    | No      |
| `/dashboard`         | Authenticated home                         | 1C.1  | No      |
| `/settings`          | Account management and appearance          | 1C.1  | No      |
| `/admin`             | Restricted administration                  | 1B    | No      |
| `/library`           | Unified idea library                       | 2     | No      |
| `/history`           | Preaching history                          | 3     | No      |
| `/analytics`         | Statistics (not in the route map yet)      | 5     | No      |

Route groups separate the three shells without affecting URLs:

- `(marketing)` exists. Public header and footer.
- `(auth)` exists. Minimal centred layout.
- `(app)` exists. Authenticated shell with the application bar; `robots: noindex` in its layout. Quick capture (Phase 2) goes in the bar, before the theme control.

The paths above are defined once in `src/lib/site.ts` (`routes`, `privateRoutes`, `appRoutes`), which also drives `robots.txt` and the proxy.

## Authentication and authorization

**Clerk** verifies identity: passwords, Google sign-in, sessions, recovery, invitations. **The `users` table** decides what a person may do: role (`admin`, `user`) and status (`active`, `disabled`). Nothing about authorization is stored in Clerk or trusted from the browser.

### Request flow

1. `src/proxy.ts` runs Clerk and handles routing only: a guest on an application path goes to sign-in (Clerk builds the return URL and only honours same-origin targets), and a signed-in visitor on `/`, `/sign-in`, or `/accept-invitation` goes to `/dashboard`.
2. `getAccess()` in `src/features/auth/access.ts` resolves the caller once per request: Clerk user ID, then `provisionUser`, then the status check. It calls `connection()` first so the decision is never prerendered or cached.
3. Pages and layouts call `requireActiveUser()` or `requireAdmin()`, which redirect to `/sign-in` or `/access-denied`. Server actions and route handlers call `authorize("active" | "admin")`, which returns a failure value instead.

The proxy is never the only check. Every page under `(app)` and every server action authorises itself, because a layout does not re-run on navigation and a server action can be called directly.

| Situation                                   | Result                       |
| ------------------------------------------- | ---------------------------- |
| Guest visits `/`                            | Landing page                 |
| Guest visits `/dashboard` or `/admin`       | Redirect to `/sign-in`       |
| Signed-in visitor on `/` or `/sign-in`      | Redirect to `/dashboard`     |
| Standard user visits `/admin`               | Redirect to `/access-denied` |
| Disabled or uninvited account, any app path | Redirect to `/access-denied` |
| Administrator visits `/admin`               | Administration               |

### Provisioning

`provisionUser` (`src/features/auth/provisioning.ts`) runs on a signed-in request:

- An existing row is returned unchanged. A disabled account is never re-enabled by signing in.
- A new identity gets a row only if it is authorised: its Clerk ID equals `INITIAL_ADMIN_CLERK_USER_ID`, or its Clerk public metadata has `appAccess: true`. Invitations sent from `/admin` attach that metadata and Clerk copies it to the account; public metadata can only be written with the secret key.
- The insert is `ON CONFLICT DO NOTHING` on the unique `clerk_user_id`, followed by a read, so concurrent first requests produce one row.

Registration itself is closed by Clerk's Restricted sign-up mode (a dashboard setting; see docs/ENVIRONMENTS.md). The metadata check is a second barrier in case that setting is ever changed. A consequence: a user created by hand in the Clerk dashboard is not admitted unless `appAccess: true` is added to their public metadata there, or they are the initial administrator.

There is no webhook. If a Clerk identity is deleted in the Clerk dashboard, the application row remains: nobody can sign in as it, the admin directory shows it as "Sign-in identity removed", and it can be disabled. Rows are not deleted in this phase.

### Initial administrator

The Clerk ID in `INITIAL_ADMIN_CLERK_USER_ID` becomes `admin` when its row is created. If the row already existed, it is promoted only while the table has no administrator at all. It is identified by Clerk ID, never by email; no request parameter is involved; and a role later set by another administrator is not overwritten.

### Administration

`/admin` shows real counts (users from the database, pending invitations from Clerk), the user directory, and invitations. Mutations are the server actions in `src/features/admin/actions.ts`: each calls `authorize("admin")`, validates input with Zod, and takes the acting administrator from the session. An administrator cannot change their own account. `updateUser` runs in a transaction that takes a shared advisory lock and refuses any change that would leave no active administrator. Clerk is the source of truth for invitations; "resend" sends a new invitation and then revokes the old one.

Disabling an account takes effect on that person's next request, because status is read from the database every time. Their Clerk session is not revoked; it simply no longer grants anything.

### Dashboard

`/dashboard` greets the person by first name (`welcomeTitle`, with a nameless fallback, also used if Clerk cannot be reached) and renders `DashboardView`: an empty state where recent ideas will go, shortcuts to settings and (administrators only, decided on the server) administration, the three-stage workflow, and the four figures it will later summarise. Those figures (`features/dashboard/summary.ts`) have no data until Phases 2 and 3, so each is shown as a label with a sentence, never a number and never zero. Give an entry a `value` when its data exists. There is no analytics route or link; that page is Phase 5.

### Account management

`/settings` is the application's own interface over Clerk. Clerk remains the identity provider: it stores and checks credentials, verifies email addresses, runs OAuth, and owns sessions. The application stores none of it and adds no table.

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
- Account deletion is not implemented.

### Caching

Cache Components is on. Nothing user-specific uses `use cache`. The `(app)` layout puts the shell behind `<Suspense>`, and Clerk's forms sit behind `<Suspense>` because they read the URL. `<ClerkProvider>` is inside `<body>` and is rendered only when Clerk keys are configured, so the public site builds and runs without credentials.

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
- **Gold is a detail**: the stage numerals, the ribbon tip, the short rule on the closing band. Never a fill or a button.
- Quiet fills are translucent ink (or white in dark), so they work on the canvas and on a card alike. `accent` keeps the shadcn meaning (a subtle interactive highlight) so added primitives behave.
- Each theme is designed separately: light uses hairlines, soft shadows, and a tinted shadow for glow; dark uses lighter surfaces for elevation, a top inner highlight, and a real (but tight) emerald light.

### Glass

Glass is for things that float over other content, and nothing else:

- `glass` — the fixed bar. Neutral tint, 16px blur, hairline; add the border side you need. `glass-settle` makes it clear at the very top of the page and glass once content is under it, with a CSS scroll-driven animation (no script; always glass where unsupported).
- `glass-float` — dropdown menus and dialogs. Denser than the bar so text stays readable over anything, with its own border, inner highlight, and raised shadow. Dialogs raise the opacity further (`--float` override in `ui/alert-dialog.tsx`).
- Both fall back to an opaque surface when `backdrop-filter` is unavailable.
- Cards, tables, forms, and the mobile navigation panels are opaque. Do not nest glass inside glass: a backdrop filter inside the blurred bar cannot see the page.

### Glow

Three uses, and no others (none of them on a button):

- `lit-edge` — the signature. A static 1px emerald line centred on the top border of a featured surface, with an 8px bloom. One per view: the hero window, the auth card. It makes the element `position: relative`; put it on a wrapper if the element clips its overflow.
- `hero-glow` — one radial gradient behind the hero window (and, faintly, the auth card). Nothing is blurred or animated. It reaches past its element, so an ancestor must clip sideways (`overflow-x-clip`), or narrow screens scroll horizontally.
- `shadow-focus` on a focused input.

Buttons do not glow. The primary button's hover is a colour step to `primary-hover`; an earlier emerald ring and halo on hover was removed at the owner's request.

### Other utilities

- `container-page` — the shared content container (76rem max, responsive gutters). Header, sections, and footer all use it so edges align.
- `h-bar` / `pt-bar` — the bar height (`--bar-h`, 56px). A shell that renders the fixed header offsets `main` with `pt-bar`. `html` has `scroll-padding-top` of the same value, so in-page anchors need no offset of their own.
- `animate-menu` — short entrance for panels and status messages. `animate-menu-out` is its exit, used by the mobile navigation panels through `useNavPanel` (`components/layout/use-nav-panel.ts`), which keeps a closing panel mounted and inert until the animation ends.
- `animate-rise` — the hero's entrance on load, staggered with `[animation-delay:…]`.
- `animate-type`, `animate-caret`, `animate-clear`, `animate-settle`, `animate-file` — the hero's capture illustration. It plays once and rests on the filed state. Not for reuse.

### Geometry and layout

- Radius follows hierarchy, from `--radius` 8px: `rounded-md` 6px (chips, menu items), `rounded-lg` 8px (buttons, inputs), `rounded-xl` 12px (cards, tables, menus, dialogs), `rounded-2xl` 16px (the hero window). `rounded-full` is for dots and the avatar.
- Marketing sections are `py-14 lg:py-20` and sit directly on the canvas, so two neighbours are 160px apart at `lg`; the space above a section's content block is `mt-10 lg:mt-14`. Sections are separated by that spacing alone. The one rule is the closing band's hairline. Application pages are `container-page py-10 lg:py-12` and start with `PageHeader`.
- Not everything is a card. The three stages hang from a rule; the closing band is a hairline; empty states are dashed outlines.

### Typography

- `font-sans` (Montserrat): all interface text — navigation, controls, tables, forms, body copy. Body carries `-0.008em` tracking because Montserrat sets wide. Dense data is 14px with `tabular-nums`.
- `font-display` / `font-serif` (Playfair Display): landing headlines, page titles, dialog titles, and sermon material (idea titles, and Scripture references in italic). Always weight 500 or 600 with slight negative tracking; never bold.
- Scale: hero `4.5–5.25rem` (one line from `lg`, three stacked words below), with its copy and actions in one left-aligned column beneath it; marketing section headings `2rem → 2.625rem`; application page titles `1.875rem → 2.125rem`; in-page section headings are sans, `text-lg font-semibold`. Supporting copy is `1.0625rem` in `muted-foreground`, capped near `max-w-xl`.
- No uppercase tracked labels, and no serif inside tables, forms, or controls.

### Motion and interaction

- Interactions answer in 150–200ms with colour, border, and shadow. Nothing lifts or scales up on hover. Buttons press in slightly (`scale-[0.98]`) on click, and a trailing icon marked `data-trailing` nudges forward (leading icons and spinners stay put).
- Everything that acts on a click shows the hand cursor: a base rule in `globals.css` covers buttons, `role="button"`, menu items, and `summary` (Tailwind 4 leaves buttons on the arrow), and links have it natively. Disabled controls keep the arrow, as does the theme option that is already selected.
- Only interactive elements have hover states. Illustrations, informational cards, and table rows do not.
- Every hover has a matching pressed state: buttons press in, and quiet controls (navigation links, icon buttons, the theme options) darken to `active:bg-foreground/10`.
- Compact controls are for a pointer. On touch screens (`pointer-coarse:`) small and icon buttons, menu rows, menu triggers, and the theme options grow to 44px.
- Load motion is one sequence: the hero rises in, then the capture illustration plays once. There are no scroll-triggered entrances and no looping animation.
- A global `prefers-reduced-motion` rule removes animation, delays, and smooth scrolling; the capture illustration is then static with the thought already filed.
- Every focusable element gets a visible 2px `outline` in the `ring` colour. Disabled controls are 50% opacity with no pointer events; busy actions change their label ("Sending…", "Working…"), show a spinner (`LoaderCircle` with `animate-spin`), and set `aria-busy`. Action results (`ActionStatus`) carry an icon as well as a colour.
- The root layout provides a skip link; each shell must render `<main id="main">`.
- Text colour pairs were chosen for WCAG AA contrast in both themes.

### Theming

`next-themes` sets a `class` on `<html>`, follows the system preference by default, persists a manual choice in `localStorage`, and applies it before first paint. `ThemeToggle` is a Light / Dark radio group with no System option: until the visitor picks one, the site follows the operating system and the matching option shows as selected. Its checked state is set only after hydration, so server and client markup match. A theme change cross-fades through the View Transitions API where supported and motion is allowed. Do not add a second theme mechanism.

### Navigation

`SiteHeader` is a fixed, full-width, 56px glass bar with a bottom hairline (`glass glass-settle`). Its logo is `HomeLink`, which on the landing page scrolls to the very top and clears any section hash, since a link to the current URL would otherwise do nothing. From `md` up it shows section links, the theme control, and Sign in inline. Below `md`, `MobileNav` shows a menu button and an opaque panel under the bar containing the same items in 44px rows; Escape closes it and returns focus. While the panel is open the bar turns opaque to match it (the panel carries `data-nav-panel`, and the header reacts with `has-[…]`), so the two read as one sheet even at the top of the page where the bar is otherwise clear.

`AppHeader` is the same bar for the authenticated shell: Dashboard and (for administrators) Admin links, the theme control, and `AccountMenu` (name, email, Settings, Administration for administrators, sign out; the trigger shows the profile picture or initials). Settings is reached from the account menu and the dashboard, not the link row. Below `md` the same items move into a panel. Add a destination to `appLinks()` only once its page exists. The current page link is ink with a 2px emerald rule just beneath its label, via `aria-current` (it sat on the bar's bottom edge until the owner asked for it closer to the text). The bar, menus, and dialogs are all `z-50`; menus and dialogs render in a portal at the end of `<body>`, so they sit above the bar. The skip link is `z-60`.

The logo link in a bar must be `flex items-center`: as an inline box it sits on the text baseline and lands a few pixels above the row's centre.

Clerk's sign-in, sign-up, and profile components are styled through `src/lib/clerk-appearance.ts`, which maps Clerk's variables to the CSS tokens so they follow the theme class, and matches Clerk's card to `AuthNotice` (same radius, hairline, and shadow), its primary button to `Button` (40px, no gradient sheen, same colour-only hover), and its inputs to `Input` (hairline, darker on hover, emerald line and soft halo on focus). Clerk draws input borders as box shadows and its own focus ring is a solid 4px band, so the focus override is `!important`. The card is given an opaque background so the glow behind it cannot tint Clerk's translucent footer strip. Clerk's components load from its CDN, so there is no local source to read: inspect the rendered `cl-*` elements when changing this file. The auth shell is the logo above one card; the shell's wrapper supplies the lit edge and glow to whichever card it holds.

### Components

shadcn/ui is configured in `components.json`. Add a primitive with `npx shadcn@latest add <name>` only when a feature needs it, then restyle it to the tokens as `ui/button.tsx` does.

- **Button**: `default` (emerald; hover is a colour step only), `secondary`, `outline`, `ghost`, `destructive`, `link`. `outline` is the secondary action beside a primary one; on hover its hairline turns emerald (`border-primary/70`), as does the account trigger's and Clerk's social button. For navigation styled as a button, apply `buttonVariants()` to a `<Link>`.
- **Input**: white surface, hairline, darker border on hover, emerald border and `shadow-focus` on focus, `aria-invalid` in destructive.
- **Dropdown menu, alert dialog**: `glass-float`. Destructive items and confirmations use the destructive colour.
- **`PageHeader`** (`components/layout/page-header.tsx`): title, one line of context, hairline. Every application page starts with it.
- **`Badge`** (`ui/badge.tsx`): `accent`, `muted`, `danger`.
- **`StatStrip`** (`ui/stat-strip.tsx`): summary figures as one divided strip. A stat is a number, "Unavailable" when it could not be loaded, or a sentence (`pending`) when the measure does not exist yet.
- **`ActionStatus`** and **`ConfirmDialog`** (`ui/`): the result line and the confirmation used by every consequential action.
- **`Avatar`** (`ui/avatar.tsx`): profile picture or initials. A plain `<img>`, since Clerk serves and sizes the image.
- **Settings layout**: `SettingsSection` (heading left, controls right, hairline between sections) and `SettingsBlock`; `TextField` is a labelled input with its error or hint.
- **Card**: there is no card component. A card is `rounded-xl border bg-surface shadow-card`; an empty state is `rounded-xl border border-dashed border-input`.
- **Tables**: plain header row, 14px rows, no row hover (rows are not links). Below `sm`, secondary columns fold into the first cell rather than scrolling sideways.

### Logo

- `LogoMark` (`components/brand/logo-mark.tsx`) is the icon as inline SVG with four variants: `primary`, `dark`, `light`, `mono`. The tile stays emerald; on the neutral bar it is the one solid block of green.
- The bookmark is a gold ribbon over the top of the left page, and the book is centred vertically on the tile. The ribbon is drawn as cloth, not a rectangle: its edges sway slightly, its top corners are soft, its tail is cut a little unevenly, and it casts a faint shadow on the page (omitted in the `mono` variant). It is shaded (black at 18%) where it folds over the page's top edge, and the two lines of text beside it stop short of it instead of running underneath. The owner wants it kept in this position.
- `Logo` is the lockup: mark plus the wordmark in live Playfair Display, raised slightly (`-translate-y-[0.065em]`) so the midpoint of its capitals sits on the mark's centre and its text lines up with the navigation beside it. Playfair's baseline sits low in a `leading-none` box; judge this by measuring the glyphs, not the element's box.
- `Ribbon` (`components/brand/ribbon.tsx`) is the bookmark from the mark as a UI marker. It is currently unused and kept for the Phase 2 library.
- `public/brand/mark.svg` is the standalone primary mark. `src/app/icon.svg` is a simplified small-size version for the favicon. Keep all three in step.
- `npm run brand:assets` regenerates `apple-icon.png`, `icon-192.png`, `icon-512.png`, and `opengraph-image.png` from `mark.svg`. The share card is charcoal with the wordmark in Playfair Display.
- If a designer-made vector is supplied, replace the paths in `LogoMark`, `mark.svg`, and `icon.svg`, then rerun the script.
- Never substitute a generic icon or emoji for the logo.

## SEO and metadata

- Base metadata is in the root layout: title template, description, Open Graph, Twitter card, `metadataBase` of `https://sermontracker.com`.
- The landing page sets its canonical URL. `/sign-in`, `/accept-invitation`, `/access-denied`, and everything under `(app)` are `noindex`.
- `robots.ts` disallows every application path. On any Vercel deployment that is not production (`VERCEL_ENV`), the whole site is `noindex` and `robots.txt` disallows everything.
- A page that sets its own `openGraph` object replaces the inherited one, including the share image. Extend it deliberately.
- There is no web app manifest yet; it belongs to Phase 7 (PWA). The icons it will need already exist in `public/brand/`.

## Domain decisions

These are settled and constrain later phases. None are implemented yet.

**Unified ideas.** One library holds sermon ideas, reusable point ideas, and undecided ideas. They are one kind of record distinguished by type, not separate systems. An undecided idea can later become a sermon or a point.

**Sermons and points are many-to-many.** A point may belong to zero, one, or many sermons and remains an independent, reusable record. The association itself carries per-sermon data: order, optional parent for subpoints, sermon-specific wording, sermon-specific notes, and Scripture overrides.

**Outlines are built from existing records.** An outline has a title or subject, a main Scripture, an optional introduction, ordered main points with optional subpoints, an optional conclusion, and references and notes. Introduction and conclusion are both optional and are distinct structural sections of the sermon, not point records. This is an outline organiser, not a manuscript editor.

**Quick capture is a primary feature.** A thought must be saveable in seconds, especially on mobile, from anywhere in the authenticated shell and without choosing a type first.

**Offline comes later (Phase 7).** To keep synchronisation feasible: use client-generatable IDs (UUIDs) for idea records, keep `created_at`/`updated_at` on every record, and route mutations through a small number of well-defined server actions rather than scattering writes.

**Sharing creates independent copies (Phase 6).** Accepting a shared idea copies it; it does not link two users to one record.

## Testing

- **Vitest**: configuration logic, component rendering (jsdom), the migration guard, and the auth, admin, dashboard, and settings code. Database tests run the committed migrations on PGlite, an in-memory PostgreSQL; Clerk is always mocked, so no test verifies Clerk itself.
- **Playwright** (desktop Chrome and a mobile viewport): page rendering, metadata, navigation, theme behaviour, keyboard access, and horizontal overflow. It builds and serves the production app on port 3100 and stops the server when the run ends.
- Keep the suite proportionate. Test behaviour that matters, not markup.

## Security

- The repository is public. No secrets in source, docs, tests, or examples.
- Secret variables stay server-side; only values prefixed `NEXT_PUBLIC_` reach the browser. Database and Clerk server modules import `server-only`.
- Authorization is decided on the server from the database on every request. Client-side role checks only decide what to show.
- Migration commands identify the database before touching it and refuse on any doubt. See [docs/DATABASE.md](docs/DATABASE.md).
- See [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

## Decisions log

| Decision                                            | Reason                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Route groups for marketing, auth, and app shells    | Each shell has its own layout; auth can wrap `(app)` without touching public pages |
| Hex values taken from the written brief             | The brand board labels differ by a character in places; the brief is authoritative |
| Canonical origin is a constant, not an env variable | Previews should still canonicalise to production                                   |
| Static generated share image rather than `next/og`  | Uses the real fonts and mark with no build-time network dependency                 |
| No manifest in Phase 1                              | Installability is Phase 7 scope                                                    |
| `@vitejs/plugin-react` not installed                | Vitest transforms JSX itself; the plugin conflicted on peer dependencies           |
| Playwright serves a production build on port 3100   | Tests what ships, and avoids a dev server on 3000                                  |
| Neon WebSocket pool, not the HTTP driver            | The last-administrator check needs an interactive transaction                      |
| Role and status as text with CHECK constraints      | Adding a value is a plain migration; no enum type to alter                         |
| Provision on first request, no Clerk webhook        | Nothing in this phase needs lifecycle events; one less public endpoint             |
| Database identity stamp plus a declared environment | A hostname is not proof; a mismatch anywhere stops the command                     |
| Previews share the development database and Clerk   | No production credentials outside production; one fewer environment to migrate     |
| Access denial is a redirect to `/access-denied`     | `forbidden()` is still experimental in Next.js 16                                  |
| Own account UI instead of Clerk's `UserProfile`     | Settings should look like the application; Clerk still does all identity work      |
| Credential changes call Clerk from the browser      | Only the Frontend API enforces current password, emailed code, and reverification  |
| Name changes go through a server action             | Our validation and access check; works whatever the instance's profile settings    |
| Settings is one page with no settings table         | Nothing to store: identity is Clerk's and the theme is already in `localStorage`   |
| Unavailable figures are described, not shown as 0   | A zero would be a false statement about the person's work                          |
