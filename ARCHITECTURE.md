# Architecture

The primary technical reference for Sermon Tracker. Update it when a decision changes.

## Overview

One full-stack Next.js application deployed to Vercel. No separate backend, queues, caches, or global client state. Server Components by default; Client Components only where interaction requires them (currently the theme provider, theme control, and mobile menu).

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
    layout/                 SiteHeader, MobileNav, SiteFooter, ThemeProvider, ThemeToggle
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

`SiteHeader` is a fixed, full-width, 64px glass bar with a bottom hairline. From `md` up it shows section links, the theme control, and Sign in inline. Below `md`, `MobileNav` shows a menu button and an opaque panel under the bar containing the same items; Escape closes it and returns focus. The authenticated shell in Phase 1B/1C should reuse the bar's structure and tokens.

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
