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
    (app)/                  Authenticated shell: dashboard, admin
    icon.svg                Favicon (small-size mark)
    apple-icon.png          Generated
    opengraph-image.png     Generated share card (+ .alt.txt)
    robots.ts, sitemap.ts
  proxy.ts                  Clerk session and guest/signed-in redirects (routing only)
  db/                       Drizzle schema, connection, test database
  features/
    auth/                   Provisioning and the access helpers
    admin/                  User and invitation services, server actions, components
  components/
    ui/                     shadcn primitives, restyled to the tokens
    brand/                  LogoMark, Logo
    layout/                 SiteHeader, MobileNav, AppHeader, AccountMenu, SiteFooter, ThemeProvider, ThemeToggle
    marketing/              Landing-page sections and their sample content
  lib/
    site.ts                 Site config and the route map
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
| `/dashboard`         | Authenticated home (placeholder until 1C)  | 1B/1C | No      |
| `/library`           | Unified idea library                       | 2     | No      |
| `/history`           | Preaching history                          | 3     | No      |
| `/settings`          | User preferences                           | 1C+   | No      |
| `/admin`             | Restricted administration                  | 1B    | No      |

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

### Caching

Cache Components is on. Nothing user-specific uses `use cache`. The `(app)` layout puts the shell behind `<Suspense>`, and Clerk's forms sit behind `<Suspense>` because they read the URL. `<ClerkProvider>` is inside `<body>` and is rendered only when Clerk keys are configured, so the public site builds and runs without credentials.

## Design system

Direction (Phase 1A.1): modern editorial SaaS on neutral foundations, with emerald as the accent, gold as a small second accent, selective glass, and a restrained emerald glow. `docs/brand/brand-board.png` is the original board; it predates this direction (green-dominant palette, bookmark below the book) and is kept as a historical reference for the mark and typography only.

### Tokens

All tokens live in `src/app/globals.css` in three layers:

1. **Brand palette** (`--brand-*`): the only raw brand hex values. Emerald `#127A5B` (light) and `#2DA985` (dark), gold `#A47B35` and `#D5B574`, ink `#18191C`, paper `#F5F2EA`.
2. **Semantic tokens**, defined separately for light (`:root`) and dark (`.dark`).
3. **`@theme inline` mapping**, which exposes them as Tailwind utilities (`bg-surface`, `text-muted-foreground`, `shadow-raised`, ...).

| Token                        | Light                 | Dark                  | Use                                    |
| ---------------------------- | --------------------- | --------------------- | -------------------------------------- |
| `background`                 | `#F8F7F4`             | `#101114`             | Page canvas                            |
| `surface` / `card`           | `#FFFFFF`             | `#1B1D22`             | Cards, panels, alternate section bands |
| `surface-raised` / `popover` | `#FFFFFF`             | `#24262C`             | Menus, dialogs, selected segments      |
| `muted`, `secondary`         | `#F0EFEB`             | `#24262C`             | Quiet fills                            |
| `accent`                     | `#EBE9E4`             | `#2A2D34`             | Hover highlight (shadcn meaning)       |
| `foreground`                 | `#18191C`             | `#F5F2EA`             | Primary text                           |
| `muted-foreground`           | `#63666D`             | `#A3A4AA`             | Secondary text                         |
| `border` / `input`           | `#E4E2DC` / `#D3D1CA` | white 9% / 16%        | Hairlines, control borders             |
| `primary` / `ring`           | `#127A5B`             | `#2DA985` / `#3FBF98` | Actions, selected and focus states     |
| `gold` / `gold-ink`          | `#A47B35` / `#7D5F24` | `#D5B574`             | Decoration / readable gold text        |
| `nav` / `nav-border`         | white 72%             | canvas 70%            | Glass surfaces                         |
| `glow`                       | emerald 16%           | emerald 34%           | Emerald illumination                   |

Shadows are tokens too: `shadow-card` (resting surfaces), `shadow-raised` (the one or two elevated things on a view), `shadow-glow` (emerald; hover on primary actions and featured controls).

Rules:

- Components use semantic utilities only. Do not write hex values or `--brand-*` variables in components. The one exception is the logo mark, which is a fixed asset.
- Foundations are neutral. Emerald is for primary actions, selected navigation, active controls, focus rings, eyebrow labels, and small details. It is never the background of a card, section, or bar.
- Gold is rarer than emerald: a rule, a numeral, a dot. Use `gold-ink` when gold must be readable text; plain `gold` fails contrast on light surfaces.
- Light emerald is `#127A5B`, slightly darker than the `#168765` first proposed, so that it passes AA both as text on the canvas and under white button labels.
- Each theme is designed separately. Dark uses visible emerald illumination and inner highlights; light uses soft tinted shadows and hairline borders.
- `accent` keeps the shadcn meaning (a subtle interactive highlight) so added primitives behave.

### Utilities

- `container-page` — the shared content container (80rem max, responsive gutters). Header, sections, and footer all use it so edges align.
- `glass` — translucent blurred surface. Reserved for the navigation bar, menus, and dialogs. Content cards stay opaque. It sets background, blur, and border colour; add the border side you need. A `glass` element nested inside another cannot blur the page, so panels attached to the bar are opaque.
- `glow-emerald` — blurred radial emerald light. Put it on an absolutely positioned, `aria-hidden` element behind one featured thing per view. Never animate it and never put it behind ordinary cards.
- `bg-grid` — faint neutral grid texture that fades at the edges; hero only.
- `animate-rise`, `animate-menu` — short entrance fades. Use sparingly.

### Geometry and layout

- `--radius` is 10px: `rounded-md` 8px (controls inside controls), `rounded-lg` 10px (buttons, inputs), `rounded-xl` 14px (cards, windows). `rounded-full` is for dots and small chips only.
- Section rhythm is `py-20 lg:py-28`. Alternate `bg-background` and `bg-surface` bands with `border-y` instead of coloured blocks.
- A shell that renders the fixed header offsets `main` with `pt-16`; in-page anchor targets use `scroll-mt-16` or more.

### Typography

- `font-display` (Playfair Display): the wordmark and marketing headings. Use sparingly inside the authenticated app.
- `font-sans` (Montserrat): body copy and all application UI.
- Eyebrow labels are uppercase, `text-xs`, wide tracking, in `primary`.
- Section headings are `text-4xl sm:text-5xl` with `leading-[1.1]`; supporting copy is `text-lg` in `muted-foreground`, capped near `max-w-xl`.

### Motion and accessibility

- Transitions are 200–300ms and tied to interaction. A global `prefers-reduced-motion` rule disables animation and smooth scrolling.
- Every focusable element gets a visible `outline` in the `ring` colour.
- The root layout provides a skip link; each shell must render `<main id="main">`.
- Text colour pairs were chosen for WCAG AA contrast in both themes.

### Theming

`next-themes` sets a `class` on `<html>`, follows the system preference by default, persists a manual choice in `localStorage`, and applies it before first paint. `ThemeToggle` is a Light / Dark radio group with no System option: until the visitor picks one, the site follows the operating system and the matching option shows as selected. Its checked state is set only after hydration, so server and client markup match. A theme change cross-fades through the View Transitions API where supported and motion is allowed. Do not add a second theme mechanism.

### Navigation

`SiteHeader` is a fixed, full-width, 64px glass bar with a bottom hairline. From `md` up it shows section links, the theme control, and Sign in inline. Below `md`, `MobileNav` shows a menu button and an opaque panel under the bar containing the same items; Escape closes it and returns focus.

`AppHeader` is the same bar for the authenticated shell: Dashboard and (for administrators) Admin links, the theme control, and `AccountMenu` (name, email, manage account, sign out). Below `md` the same items move into a panel. The current page link is emerald via `aria-current`. The bar, menus, and dialogs are all `z-50`; menus and dialogs render in a portal at the end of `<body>`, so they sit above the bar. The skip link is `z-60`.

Clerk's sign-in, sign-up, and profile components are styled through `src/lib/clerk-appearance.ts`, which maps Clerk's variables to the CSS tokens so they follow the theme class.

### Components

shadcn/ui is configured in `components.json`. Add a primitive with `npx shadcn@latest add <name>` only when a feature needs it, then restyle it to the tokens as `ui/button.tsx` does (`rounded-lg`, semantic colours, `shadow-glow` on primary hover). For navigation styled as a button, apply `buttonVariants()` to a `<Link>`.

### Logo

- `LogoMark` (`components/brand/logo-mark.tsx`) is the icon as inline SVG with four variants: `primary`, `dark`, `light`, `mono`. The tile stays emerald; on neutral bars it is the one solid block of green.
- The bookmark is a ribbon over the top of the left page (changed in 1A.1 from a ribbon below the spine), and the book is centred vertically on the tile. In the `light` and `mono` variants the ribbon takes a colour that contrasts with the page.
- `Logo` is the lockup: mark plus the wordmark in live Playfair Display text.
- `public/brand/mark.svg` is the standalone primary mark. `src/app/icon.svg` is a simplified small-size version for the favicon. Keep all three in step.
- `npm run brand:assets` regenerates `apple-icon.png`, `icon-192.png`, `icon-512.png`, and `opengraph-image.png` from `mark.svg`. The share card is charcoal with a soft emerald glow.
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

- **Vitest**: configuration logic, component rendering (jsdom), the migration guard, and the auth and admin services. Database tests run the committed migrations on PGlite, an in-memory PostgreSQL; Clerk is mocked.
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
