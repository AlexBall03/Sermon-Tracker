# Architecture

The primary technical reference for Sermon Tracker. Update it when a decision changes.

## Overview

One full-stack Next.js application deployed to Vercel. No separate backend, queues, caches, or global client state. Server Components by default; Client Components only where interaction requires them (currently the theme provider and toggle).

| Concern       | Choice                                                         |
| ------------- | -------------------------------------------------------------- |
| Framework     | Next.js 16 App Router, Turbopack, Cache Components enabled     |
| Language      | TypeScript, strict                                             |
| Styling       | Tailwind CSS v4, semantic CSS-variable tokens                  |
| UI primitives | shadcn/ui (`base-nova` style on Base UI), added only as needed |
| Validation    | Zod                                                            |
| Auth (1B)     | Clerk                                                          |
| Database (1B) | Neon PostgreSQL with Drizzle ORM                               |
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
    (auth)/                 Centred shell for sign-in
      sign-in/page.tsx      Interim notice until Clerk lands in 1B
    icon.svg                Favicon (small-size mark)
    apple-icon.png          Generated
    opengraph-image.png     Generated share card (+ .alt.txt)
    robots.ts, sitemap.ts
  components/
    ui/                     shadcn primitives, restyled to the tokens
    brand/                  LogoMark, Logo
    layout/                 SiteHeader, SiteFooter, ThemeProvider, ThemeToggle
    marketing/              Landing-page sections and their sample content
  lib/
    site.ts                 Site config and the route map
    env.ts                  Zod-validated environment access
    utils.ts                cn()
public/brand/               mark.svg, icon-192.png, icon-512.png
scripts/                    generate-brand-assets.mjs
tests/e2e/                  Playwright specs
docs/                       Roadmap, database, environments, handoff, brand board
```

Conventions:

- Unit and component tests sit beside the code as `*.test.ts(x)`. End-to-end specs live in `tests/e2e`.
- Feature code for later phases goes in `src/features/<feature>/` (components, server actions, queries, schemas together). Create a folder when its first feature is built, not before.
- Import through the `@/` alias.
- Read environment variables only through `src/lib/env.ts`.

## Routing

| Path         | Purpose                                  | Phase | Indexed |
| ------------ | ---------------------------------------- | ----- | ------- |
| `/`          | Public landing page                      | 1A    | Yes     |
| `/sign-in`   | Sign-in (interim notice now, Clerk next) | 1A/1B | No      |
| `/dashboard` | Authenticated home                       | 1C    | No      |
| `/library`   | Unified idea library                     | 2     | No      |
| `/history`   | Preaching history                        | 3     | No      |
| `/settings`  | User preferences                         | 1C+   | No      |
| `/admin`     | Restricted administration                | 1B    | No      |

Route groups separate the three shells without affecting URLs:

- `(marketing)` exists. Public header and footer.
- `(auth)` exists. Minimal centred layout.
- `(app)` will be added in Phase 1B/1C for the authenticated shell (navigation plus an always-reachable quick-capture control). It will set `robots: noindex` in its layout.

Phase 1B attaches Clerk in `src/proxy.ts`, protects everything under `(app)`, and redirects signed-in visitors from `/` to `/dashboard`. Nothing in Phase 1A simulates authentication. The paths above are defined once in `src/lib/site.ts` (`routes`, `privateRoutes`), which also drives `robots.txt`.

## Design system

Reference: [docs/brand/brand-board.png](docs/brand/brand-board.png).

### Tokens

All tokens live in `src/app/globals.css` in three layers:

1. **Brand palette** (`--brand-*`): the only raw brand hex values. Emerald `#0E6B4F`, Forest `#0B3D2E`, Sage `#A7B89F`, Gold `#D4AF6B`, Cream `#F8F6ED`, Charcoal `#1F2937`.
2. **Semantic tokens**, defined separately for light (`:root`) and dark (`.dark`): `background`, `foreground`, `surface`, `card`, `popover`, `muted`, `border`, `input`, `primary`, `secondary`, `accent`, `gold`, `gold-ink`, `gold-foreground`, `destructive`, `ring`, `nav`, `nav-border`, `on-brand`.
3. **`@theme inline` mapping**, which exposes them as Tailwind utilities (`bg-primary`, `text-muted-foreground`, ...).

Rules:

- Components use semantic utilities only. Do not write brand hex values or `--brand-*` variables in components. The one exception is the logo mark, which is a fixed asset.
- `accent` keeps the shadcn meaning (a subtle interactive highlight) so added primitives behave. The brand gold is `gold`. Use `gold-ink` when gold must be readable text; plain `gold` fails contrast on cream.
- Green stays dominant. Gold is for small accents: a rule, a numeral, a bookmark.
- Dark mode is its own palette of forest-tinted surfaces with a lighter emerald primary, not an inversion.

### Utilities

- `bg-brand-surface` — emerald-to-forest gradient panel. Pair with `text-on-brand`.
- `glass` — translucent blurred surface. Reserved for navigation, floating elements, and dialogs. Content cards stay opaque (`bg-card`).
- `animate-rise` — short entrance fade. Use sparingly.

### Typography

- `font-display` (Playfair Display): the wordmark and marketing headings. Use sparingly inside the authenticated app.
- `font-sans` (Montserrat): body copy and all application UI.
- Eyebrow labels are uppercase with wide tracking, echoing the tagline on the brand board.

### Motion and accessibility

- Transitions are short and tied to interaction. A global `prefers-reduced-motion` rule disables animation and smooth scrolling.
- Every focusable element gets a visible `outline` in the `ring` colour. On brand-gradient surfaces add `outline-on-brand`.
- The root layout provides a skip link; each shell must render `<main id="main">`.
- Text colour pairs were chosen for WCAG AA contrast in both themes.

### Theming

`next-themes` sets a `class` on `<html>`, follows the system preference by default, and persists a manual choice. The toggle renders both icons and lets CSS choose, avoiding a hydration mismatch.

### Components

shadcn/ui is configured in `components.json`. Add a primitive with `npx shadcn@latest add <name>` only when a feature needs it, then restyle it to the tokens as `ui/button.tsx` does (pill shape, semantic colours). For navigation styled as a button, apply `buttonVariants()` to a `<Link>`.

### Logo

- `LogoMark` (`components/brand/logo-mark.tsx`) is the icon as inline SVG with the board's four variants: `primary`, `dark`, `light`, `mono`.
- `Logo` is the lockup: mark plus the wordmark in live Playfair Display text.
- `public/brand/mark.svg` is the standalone primary mark. `src/app/icon.svg` is a simplified small-size version for the favicon.
- `npm run brand:assets` regenerates `apple-icon.png`, `icon-192.png`, `icon-512.png`, and `opengraph-image.png` from `mark.svg`.
- The mark was redrawn as flat vector from the raster brand board. If a designer-made vector is supplied, replace the paths in `LogoMark`, `mark.svg`, and `icon.svg`, then rerun the script.
- Never substitute a generic icon or emoji for the logo.

## SEO and metadata

- Base metadata is in the root layout: title template, description, Open Graph, Twitter card, `metadataBase` of `https://sermontracker.com`.
- The landing page sets its canonical URL. `/sign-in` is `noindex`.
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

- **Vitest** (jsdom): configuration logic and component rendering, including accessible names.
- **Playwright** (desktop Chrome and a mobile viewport): page rendering, metadata, navigation, theme behaviour, keyboard access, and horizontal overflow. It builds and serves the production app on port 3100 and stops the server when the run ends.
- Keep the suite proportionate. Test behaviour that matters, not markup.

## Security

- The repository is public. No secrets in source, docs, tests, or examples.
- Secret variables stay server-side; only values prefixed `NEXT_PUBLIC_` reach the browser.
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
