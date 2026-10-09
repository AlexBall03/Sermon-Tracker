# Phase 1A Handoff

Completed 9 October 2026. Read [ARCHITECTURE.md](../ARCHITECTURE.md) for the full technical picture; this file covers what a new session needs to continue.

## What was implemented

- Next.js 16 App Router application (React 19, TypeScript strict, Tailwind v4, Turbopack, Cache Components on), ESLint, Prettier with Tailwind class sorting.
- Design system in `src/app/globals.css`: brand palette, semantic tokens for intentionally separate light and dark themes, `bg-brand-surface` and `glass` utilities, reduced-motion handling, visible focus states.
- Typography: Playfair Display (display) and Montserrat (UI) through `next/font`.
- Logo: `LogoMark` inline SVG in four variants and `Logo` lockup, redrawn from the brand board. Favicon, Apple touch icon, 192/512 icons, and a share image generated from it.
- Public landing page at `/`: glass header, hero, three capabilities (Capture, Develop, Preach), illustrative library preview, invitation-only notice, footer.
- `/sign-in`: an honest interim notice. No form, no fake authentication.
- Theme switching with `next-themes` (system default, persisted choice).
- SEO: title template, description, Open Graph, Twitter card, canonical, `robots.txt`, `sitemap.xml`, theme-color. Application paths are disallowed; non-production Vercel deployments are fully `noindex`.
- shadcn/ui configured (`components.json`); `Button` installed and restyled.
- Tests: 12 Vitest tests, 7 Playwright tests run on desktop and mobile.
- Documentation: README, ARCHITECTURE, ROADMAP, DATABASE, ENVIRONMENTS, this handoff. Project rules for coding agents are in `AGENTS.md`.

## Decisions worth knowing

- Route groups: `(marketing)` and `(auth)` exist; `(app)` is to be created for the authenticated shell.
- `accent` is the shadcn subtle-highlight token. Brand gold is `gold`, with `gold-ink` for readable text.
- Brand hex values follow the written brief where the board's labels differ.
- The canonical origin is a constant in `src/lib/site.ts`.
- The share image and raster icons are static files produced by `npm run brand:assets`, not generated at request time.
- No web app manifest; that is Phase 7.
- The scaffold's `next.config.ts` defaults were kept (`cacheComponents`, `partialPrefetching`, the Tailwind Turbopack loader).
- Next.js 16.4 differs from older versions. `AGENTS.md` points to the bundled docs in `node_modules/next/dist/docs/`; check them before using an API from memory.

## Validation results

| Check               | Result                                       |
| ------------------- | -------------------------------------------- |
| `npm run lint`      | Pass                                         |
| `npm run typecheck` | Pass                                         |
| `npm run test`      | 12 of 12 pass                                |
| `npm run build`     | Pass; every route prerendered as static      |
| `npm run test:e2e`  | 14 of 14 pass (7 tests, desktop + mobile)    |
| Browser console     | No errors on `/` or `/sign-in`, either theme |
| Visual review       | Light and dark, desktop and mobile           |

## Outstanding items

- **Logo sign-off.** The mark is a flat vector redraw of the raster brand board; the board's soft shading is not reproduced. Compare `public/brand/mark.svg` with `docs/brand/brand-board.png` and either approve it or supply a designer vector (replacement steps are in ARCHITECTURE.md > Logo).
- **Wordmark lockup file.** The lockup is rendered in live text. There is no standalone SVG of the full logo with outlined lettering for use outside the site.
- **Brand board in a public repo.** `docs/brand/brand-board.png` (1.6 MB) will be published with the repository. Remove it before the first commit if that is not wanted.
- `npm install` reports audit advisories in the dependency tree; they have not been reviewed.

## Manual steps for the repository owner

1. `git init`, make the first commit, and create `master` and `dev`. No Git state was created or changed in Phase 1A.
2. Create the public GitHub repository and push.
3. Create the Vercel project, set the production branch to `master`, and attach `sermontracker.com`. No environment variables are needed yet.

## Phase 1B prerequisites

- A Clerk application, with development and production instances, configured for invitation-only access (public sign-up disabled).
- A Neon project with separate development and production databases (branches).
- Decide how administrators are identified (for example a Clerk role or metadata flag) for `/admin`.
- The Vercel project from the steps above, so variables can be scoped per environment.

Phase 1B then: adds `src/proxy.ts` with Clerk, replaces the `/sign-in` body, creates the `(app)` route group with `noindex`, redirects signed-in visitors from `/` to `/dashboard`, installs Drizzle, and implements the migration workflow in [DATABASE.md](DATABASE.md).

## Process cleanup

The only servers started were Playwright's managed production servers on port 3100. They were stopped by Playwright at the end of each run, and nothing was listening on ports 3000 or 3100 afterwards. No pre-existing processes were touched.
