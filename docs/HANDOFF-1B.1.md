# Phase 1B.1 Handoff — Design Overhaul & UI/UX Refinement

Written 9 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) > Design system is the reference; this is the summary of what changed and what was checked.

## Status in one paragraph

The whole interface was moved from the emerald-led "Lit glass" look to a neutral, editorial one: warm paper and charcoal foundations, opaque cards, glass only on floating layers, and emerald kept as a signature. The landing page was recomposed, and the navigation, primitives, auth shell, dashboard placeholder, and administration were restyled to one system. No behaviour, data, or access logic changed. Lint, type checking, unit tests, the production build, and end-to-end tests pass. **Signed-in screens were reviewed with sample data, not a live session** (see section 12).

## 1. Design improvements

- Neutral canvas and surfaces in both themes; the ambient emerald field, tinted glass panels, and solid green panels are gone.
- One memorable device, the lit edge, on the hero window and the auth card, with one diffused glow behind the hero.
- Not everything is a card: the three stages hang from a rule, the invitation section is a hairline band, empty states are dashed outlines.
- Bar reduced from 64px to 56px; content container from 80rem to 76rem; radii tightened (8px controls, 12px cards, 16px hero window).

## 2. Typography

- Back to the brand pairing: **Playfair Display** (headlines, page titles, dialog titles, sermon material) and **Montserrat** (all interface text). Bricolage Grotesque and Newsreader were removed.
- Playfair is always weight 500–600, never bold. Montserrat body text carries slight negative tracking; dense data is 14px with tabular numerals.
- The hero headline is solid ink on one line from `lg`, three stacked words below. The gradient-clipped headline is gone.
- Application page titles are serif but modest (30–34px); section headings inside the app are sans.

## 3. Design tokens

- `src/app/globals.css` rewritten. Removed: `deep*`, `field-*`, `sheen`, `action-*`, and the `glass-panel`, `glass-blur`, `surface-deep`, `reveal` utilities, and the `inverse` button variant.
- Added: `primary-hover`, `primary-soft`, `destructive-foreground`, `float` / `float-border`, `glow`, `shadow-focus`, `--bar-h` (`h-bar`, `pt-bar`), and the `glass-float`, `glass-settle`, `hero-glow` utilities.
- Quiet fills (`muted`, `secondary`, `accent`) are translucent ink or white, so they work on canvas and card alike.

## 4. Landing page

- **Hero**: headline, then copy and actions on one row, then a full-width product window.
- **Product preview**: a miniature of the planned application — application bar with quick capture, views rail, idea list, and a detail pane showing a point "Used in 2 sermons". The capture sequence plays once. Still `aria-hidden`, non-interactive, and captioned as an illustration.
- **Capture / Develop / Preach**: three columns on one thread, following a single sample idea from passing thought to sermon to the Sunday it was preached.
- **Library**: points on the left, sermons on the right, joined by lines; one point serves two sermons; an undecided idea sits apart. Below `sm` the lines drop out and the cards stack.
- **Invitation band** and **footer**: neutral, no panel. Messaging unchanged.
- Sample content lives in `components/marketing/sample-ideas.ts`.

## 5. Authentication and administration

- Auth shell: logo above one neutral card. `clerk-appearance.ts` matches Clerk's card, title, primary button, and input focus to the system.
- Dashboard placeholder: `PageHeader`, a dashed empty state, plain cards.
- Administration: `PageHeader`; statistics as one divided neutral strip; a plain table whose Role and Status fold under the name below `sm` so the actions stay on screen; invitation form without a panel; revoke shown in the destructive colour; a directed empty state for invitations.
- No change to actions, validation, provisioning, roles, or access checks.

## 6. Glass

`glass` for the bar, `glass-float` for menus and dialogs, opaque everywhere else, opaque fallback without `backdrop-filter`. The bar is clear at the top of the page and becomes glass on scroll through a CSS scroll timeline. Never nest glass.

## 7. Emerald glow

`lit-edge` (one per view), `hero-glow` (hero and auth card), `shadow-glow` (primary button hover), `shadow-focus` (inputs). Light uses tinted shadows; dark uses a tight real light. Anything using `hero-glow` needs an ancestor with `overflow-x-clip`.

## 8. Hover and animation

150–200ms colour, border, and shadow changes; press-in on click; no hover lift; hover only on interactive elements. One load sequence in the hero; no scroll-triggered or looping animation. Reduced motion is respected globally.

## 9. Light and dark

Designed separately on the same token names. `next-themes` behaviour is unchanged: system by default, manual choice persisted, no flash. `themeColor` and the share card were updated to the new canvas colours.

## 10. Responsive

- No horizontal overflow at 390, 768, 1024, 1280, 1440, or 1920.
- Hero stacks to three words with full-width window; the window drops its rail below `md` and its detail pane below `lg`.
- Mobile menus use 44px rows. The admin table no longer scrolls sideways on phones.

## 11. Accessibility

Visible focus outlines everywhere; skip link; `aria-current` on navigation; illustrations hidden from assistive technology; status messages announced; dialog focus handling from Base UI unchanged; contrast pairs chosen for AA in both themes (not machine-audited).

## 12. Tests and visual validation

| Check                  | Result                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run lint`         | Pass                                                               |
| `npm run typecheck`    | Pass                                                               |
| `npm run format:check` | Pass                                                               |
| `npm run test`         | 68 of 68 pass                                                      |
| `npm run build`        | Pass, with the local Clerk development keys                        |
| `npm run test:e2e`     | 35 pass, 1 skipped (mobile-menu test on desktop), desktop + mobile |

The end-to-end run first failed one test: with real Clerk keys `/sign-in` had two `h1`s (a visually hidden one and Clerk's own). The hidden headings on `/sign-in` and `/accept-invitation` were removed; Clerk's form supplies the heading.

One unit test changed: the users table renders each role and status badge twice (column, and folded under the name), so the assertions count two.

Visually reviewed, then refined and re-checked:

- Landing page: light and dark at 1440 in Chrome; light and dark at 390, 768, 1024, 1920 and the scrolled bar in headless Chromium.
- Sign-in with the live Clerk form (light, signed out) and access-denied (dark, 390).
- Application bar, account menu, administration (statistics, table, row menu, confirmation dialogs, invitations), dashboard placeholder, and loading state, in light and dark at 390, 1280, and 1440 — **rendered on a temporary route with sample data, which has been deleted.**

Refinements made after the first pass: horizontal overflow from the hero glow, logo lockup vertical alignment, preview list filled to match the detail pane, equal-height stage examples, wrapping library titles, denser dialog glass, admin table on phones, Clerk input focus ring.

Not inspected, and not claimed:

- `/dashboard` and `/admin` in a real signed-in session, Clerk's profile modal, the invitation sign-up form, and Google's button. The Chrome session available was signed out.
- Safari and Firefox. Firefox will show the bar as always-glass (no scroll timeline).
- Hover states were checked by reading the classes, not one by one in a browser.

## 13. Known limitations

- **Guests sent to sign-in from an application path land on Clerk's hosted page**, not the styled `/sign-in`, when real Clerk keys are configured (seen at `/dashboard` while signed out). The proxy's `redirectToSignIn` does not know the local sign-in path. This predates the phase and is routing, so it was left alone; the likely fix is `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` or the `signInUrl` option on `clerkMiddleware`.
- Clerk's primary button keeps Clerk's own gradient sheen, and its footer strip keeps Clerk's tint.
- `Ribbon` is now unused; kept for the Phase 2 library.
- `Badge` still lives in the users table file.
- The limitations in [HANDOFF-1B.md](HANDOFF-1B.md) still stand.

## 14. Readiness for Phase 1C

Ready. Build the dashboard on:

- `PageHeader` at the top of every application page, inside `container-page py-10 lg:py-12`.
- Cards as `rounded-xl border bg-surface shadow-card`; empty states as dashed outlines.
- Serif (`font-serif`) for idea titles and italic Scripture, sans for everything else — the product preview shows the intended row and detail patterns.
- The space before the theme control in `AppHeader` for quick capture, styled like the preview's capture field.

## Process cleanup

No dev server was started: the owner's own server on port 3000 was already running and was used for review, and left running. The only server started was Playwright's managed production server on port 3100, which stops with its run. Temporary files (`src/app/design-preview/`, two `scripts/.*.tmp.mjs` helpers) were deleted. No Git state-changing commands were run.
