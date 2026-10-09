# Phase 1A.1 Handoff — Visual Redesign

Completed 9 October 2026. The design-system reference is [ARCHITECTURE.md](../ARCHITECTURE.md) > Design system; this file records what changed and what the next session needs.

## 1. What changed

- **Foundations** moved from cream and forest green to neutral charcoal (dark) and warm off-white (light). Emerald is now an accent; the green gradient panels are gone.
- **Navbar** replaced: the floating pill is now a fixed, full-width glass bar with section links, a theme control, Sign in, and a mobile menu.
- **Hero** rebuilt as a centred editorial composition with a larger headline and a product preview on the page's single emerald glow.
- **Product preview** is a miniature app window (sidebar, quick-capture field, idea list) built from React and CSS, labelled illustrative and hidden from assistive technology.
- **Capabilities** changed from three identical cards to an editorial numbered list with hairlines, icons, and an emerald rule that draws across on hover.
- **Library section** now shows three idea cards (sermon with a linked point, point, undecided) instead of repeating a list.
- **Beta notice** is a neutral panel with a gold rule and a faint emerald corner wash.
- **Theme control** is Light / Dark / System instead of a two-state toggle.
- **Logo**: the bookmark moved from below the spine to a ribbon over the top of the left page, and the book was re-centred vertically on the tile. Nothing else in the mark changed, except that the `light` and `mono` variants needed a contrasting ribbon colour (gold and black) because their old ribbon colour matched the page it now sits on. Raster icons and the share image were regenerated; the share card background is now charcoal.
- No dependencies were added. No routes, metadata, or architecture changed.

## 2. Colour system

| Role             | Light     | Dark      |
| ---------------- | --------- | --------- |
| Canvas           | `#F8F7F4` | `#101114` |
| Surface          | `#FFFFFF` | `#1B1D22` |
| Raised surface   | `#FFFFFF` | `#24262C` |
| Quiet fill       | `#F0EFEB` | `#24262C` |
| Text             | `#18191C` | `#F5F2EA` |
| Secondary text   | `#63666D` | `#A3A4AA` |
| Emerald (accent) | `#127A5B` | `#2DA985` |
| Gold (secondary) | `#A47B35` | `#D5B574` |

Light emerald is `#127A5B` rather than the suggested `#168765`: the lighter shade came out just under 4.5:1 both as text on the canvas and under white button text. Readable gold text in light mode uses `gold-ink` (`#7D5F24`).

## 3. Light and dark mode

`next-themes` (unchanged) sets the `dark` class before first paint, defaults to the system preference, and persists a manual choice. Each theme has its own token block, including its own shadows and glow strength. `ThemeToggle` marks its selection only after hydration and cross-fades theme changes with the View Transitions API when the browser supports it and reduced motion is not requested.

## 4. Navbar

`src/components/layout/site-header.tsx`: fixed, full width, 64px, `glass`, bottom hairline, content aligned to `container-page`. `mobile-nav.tsx` handles widths below `md`: a menu button with `aria-expanded`, and a panel under the bar with the section links, Sign in, and a labelled theme control. Escape closes it and returns focus to the button. Shells that render the header give `main` `pt-16`.

## 5. Glass and glow conventions

- `glass` is for the navigation bar, menus, and dialogs. Cards are opaque.
- `glow-emerald` goes behind one featured element per view (currently the hero preview and the sign-in card). It is static.
- `shadow-glow` is the interaction-scale version: primary button hover, the quick-capture field, capability icons on hover.
- Dark mode shows the glow as light; light mode reduces it to a soft tint and relies on tinted shadows.

## 6. Reusable pieces

- Tokens: `surface`, `surface-raised`, `glow`, and `shadow-card` / `shadow-raised` / `shadow-glow` are new. `on-brand`, `brand-surface-*`, and `bg-brand-surface` were removed.
- Utilities: `container-page`, `glass`, `glow-emerald`, `bg-grid`, `animate-rise`, `animate-menu`.
- Components: `Button` (now `rounded-lg`), `ThemeToggle` (`showLabels` for wide layouts), `MobileNav`, `ProductPreview`.
- Radius scale: 8 / 10 / 14px for `md` / `lg` / `xl`.

## 7. Validation

| Check               | Result                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| `npm run lint`      | Pass                                                                      |
| `npm run typecheck` | Pass                                                                      |
| `npm run test`      | 13 of 13 pass                                                             |
| `npm run build`     | Pass; every route prerendered as static                                   |
| `npm run test:e2e`  | 17 pass, 1 skipped (the mobile-menu test does not apply on desktop)       |
| Visual review       | Screenshots at 390, 768, 1440, 1920 in both themes; menu, scroll, sign-in |
| Browser console     | No errors or hydration warnings on `/` or `/sign-in`, either theme        |
| Theme flash         | A stored dark preference with a light OS is dark at first paint           |
| Routes              | `/robots.txt`, `/sitemap.xml`, `/sign-in`, share image, favicon all 200   |

Visual review was done from headless Chromium screenshots, not on physical devices or in Safari or Firefox.

## 8. Outstanding concerns

- **Brand board is out of date.** `docs/brand/brand-board.png` still shows the green-dominant palette and the bookmark below the book. It was not regenerated.
- **Safari and Firefox** were not checked. Backdrop blur and view transitions degrade gracefully where unsupported, but that is untested here.
- **Theme radio group** supports arrow keys, but every option is a tab stop rather than using a roving tabindex.
- The items listed in [HANDOFF-1A.md](HANDOFF-1A.md) (logo sign-off, no outlined wordmark file, audit advisories) still stand.

## 9. Readiness for Phase 1B

Ready. Clerk's sign-in mounts inside the existing `(auth)` card. The `(app)` shell should reuse `container-page`, the header's bar structure, `surface` cards with `shadow-card`, and emerald only for the selected navigation item and primary actions, as the hero preview illustrates.

## Process cleanup

A production server was started twice on port 3200 for screenshots and stopped each time; Playwright's managed server on port 3100 stopped with its run. Nothing is listening on 3000, 3100, or 3200. No Git state-changing commands were run.
