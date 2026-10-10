# Phase 1B.2 Handoff — Final Design Polish & UX Quality Assurance

Written 9 October 2026. [ARCHITECTURE.md](../ARCHITECTURE.md) > Design system is the reference; this is the summary of what changed and what was checked.

## Status in one paragraph

A refinement pass over the Phase 1B.1 design. The identity, palette, tokens, and typefaces are unchanged. The hero's actions now sit under its copy, the landing page's vertical rhythm is about a sixth tighter and consistent, every hover has a pressed state, compact controls grow to 44px on touch screens, and Clerk's sign-in form now matches the application's own button and input. No behaviour, data, routing, or access logic changed. **Signed-in screens were again reviewed with sample data, not a live session** (see Validation).

## 1. Summary of changes

| Area           | Change                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Hero           | Copy and actions in one left-aligned column; padding trimmed so the product window keeps its place on the page     |
| Landing rhythm | Sections `py-14 lg:py-20` (was `py-16 lg:py-24`); content blocks `mt-10 lg:mt-14`; closing band and footer to suit |
| Stage examples | The three example cards are one fixed height, and the two sermon cards' footers share a line height                |
| Navigation     | Pressed states; the bar turns opaque while the mobile menu is open; logo links share one hover                     |
| Controls       | 44px touch targets on coarse pointers; theme options get hover, pressed, and a clearer dark selected state         |
| Menus          | Unused checkbox, radio, and submenu parts restyled to match the menu item                                          |
| Feedback       | Spinner and `aria-busy` on busy buttons; an icon on success and error messages                                     |
| Tables         | Row hover removed (rows are not links)                                                                             |
| Clerk form     | Gradient sheen removed, 40px button and input, visible input border, soft focus halo, neutral footer strip         |

## 2. Components refined

`hero.tsx`, `product-preview.tsx`, `capabilities.tsx`, `app-preview.tsx`, `beta-notice.tsx`, `site-header.tsx`, `app-header.tsx`, `mobile-nav.tsx`, `home-link.tsx`, `theme-toggle.tsx`, `account-menu.tsx`, `ui/button.tsx`, `ui/dropdown-menu.tsx`, `users-table.tsx`, `invitations-panel.tsx`, `confirm-dialog.tsx`, `(app)/layout.tsx`, `(auth)/auth-notice.tsx`, `lib/clerk-appearance.ts`.

Left alone because they already looked right: the product window, the library diagram, the footer, `PageHeader`, the statistics strip, `Input`, `AlertDialog`, the auth shell, the dashboard placeholder, and every token in `globals.css`.

## 3. Marketing page

- **Hero.** Before, the two buttons sat at the far right edge of the container from `lg`, roughly 600px from the sentence they follow. They are now directly beneath it at every width. The measure of the copy went from 34rem to 38rem so it breaks into three even lines at desktop sizes.
- **Spacing.** At `lg` the gap between sections was 192px and is now 160px; the closing band's bottom padding went from 112px to 96px. Mobile sections went from 64px to 56px of padding.
- **Transitions.** A tinted band behind the Library section was considered and rejected: its bottom edge would sit 80px above the closing band's hairline and gold rule, giving two competing lines. Sections are separated by spacing alone, with the one hairline before the invitation.
- **Stage examples.** The Develop and Preach cards were 3px different in height, so their top edges did not line up. All three are now `h-30`.

- **Footer.** Rebuilt as two rows after owner feedback: the lockup and tagline with the page's links (How it works, Library, Beta access, Sign in) opposite, then a hairline and the small print (year and name; beta status). Before, it was one row with a single link.
- **Logo lockup.** The wordmark sat about 2px below the mark's centre and nearly 4px below the navigation's baseline. Measured from the glyphs, it is now raised so the capitals' midpoint is on the mark's centre.

- **Footer credit.** "Developed by:" with the developer's name linking to their portfolio (`siteConfig.developer`), opening in a new tab. Its underline is always present in a transparent colour, so it fades in with the text colour.
- **Logo mark.** Three replacement marks were drawn and shown; the owner kept the open Bible and asked for a better ribbon. It stays over the top of the left page, as the owner wants: it is now wider with a deeper, slightly uneven tail, gently swaying edges, soft top corners, a faint shadow on the page, shaded where it folds over the page edge, and the two lines of text beside it stop short of it instead of running underneath. (A version hanging from the spine was tried and rejected.) `LogoMark`, `public/brand/mark.svg`, and `src/app/icon.svg` were changed together and the raster assets regenerated with `npm run brand:assets`.

- **Sample content.** The sermon titles in the hero preview, the three stages, and the library diagram now come from the owner's own list of ideas ("His Grace is Sufficient", "It is Well", "A Still Small Voice", "You're Not Alone", "The story isn't over"). The points and Scripture references were written to suit them and should be checked by the owner. All of it lives in `components/marketing/sample-ideas.ts`.

## 4. Typography and spacing

No scale changes. The section heading and supporting-copy classes were checked and are identical across the three sections. The hero copy stays one step larger than section copy on purpose. Clerk's primary button is now 14px semibold like `Button`, and its field label is weight 500 like `Label`.

## 5. Hover, focus, and pressed states

- Navigation links, the row-menu trigger, and unselected theme options darken on press (`active:bg-foreground/10`). Buttons already pressed in.
- Unselected theme options gain a quiet hover fill. In dark the selected option is now lighter than its track on any background; before, it looked recessed inside the mobile panel.
- The header logo links fade slightly on hover, as the auth shell's already did.
- Keyboard focus is the 2px `ring` outline everywhere, and the border-plus-halo on inputs, including Clerk's. Checked by tabbing in both themes.
- Every clickable element shows the hand cursor (base rule in `globals.css`; menu items no longer use `cursor-default`). Audited by script across the landing page, sign-in, administration, both menus, the dialog, and both mobile menus: the only exception is the already-selected theme option, by design.
- In dark, `primary-hover` is mixed towards the lamp green rather than white, so a hovered primary button gets brighter without washing out.
- Durations are 150–200ms throughout; nothing lifts or scales up.

## 6. Glass and glow conventions

Unchanged, and re-checked while scrolling in both themes: `glass` on the bar, `glass-float` on menus and dialogs, opaque everywhere else, never nested. One addition: **the bar is opaque while a mobile menu is open**, so the bar and its opaque panel are one surface. Glow remains the lit edge, the hero glow (borrowed faintly by the auth card), and the input focus halo. The primary button's hover ring and halo were removed after owner feedback (`shadow-glow` and `--elevation-glow` no longer exist); its hover is now a colour step only. Outline buttons take an emerald hairline on hover. The Clerk card is now opaque so the glow behind it no longer tints the card's footer strip green.

## 7. Responsive

- No horizontal overflow at 390, 768, 1024, 1440, or 1920 on the landing page, or at 390 and 1280 on administration.
- On touch screens `sm` and icon buttons, menu rows, the row-menu and account triggers, and the theme options are 44px. Measured under Pixel 7 emulation: Resend 44px, row menu 44px, menu item 44px.
- The hero stacks the same way at every width, so there is no layout change at `lg` other than the headline going to one line.

## 8. Accessibility

- Success and failure messages no longer differ by colour alone.
- Busy buttons announce `aria-busy`; the spinner is `aria-hidden` and is static under reduced motion.
- Touch targets as above. Accessible names, roles, heading order, and the skip link are unchanged.
- Contrast pairs were not changed and were not machine-audited.

## 9. Validation

| Check                  | Result                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| `npm run lint`         | Pass                                                                             |
| `npm run typecheck`    | Pass                                                                             |
| `npm run format:check` | Pass                                                                             |
| `npm run test`         | 68 of 68 pass                                                                    |
| `npm run build`        | Pass, as the first step of the end-to-end run, with local Clerk development keys |
| `npm run test:e2e`     | 35 pass, 1 skipped (mobile-menu test on desktop), desktop + mobile               |

No test was changed.

Visually reviewed in headless Chromium against the owner's running dev server, before and after, then refined and re-checked:

- Landing page: full page in light and dark at 1440 and light at 390; the hero at 768, 1024, and 1920; the scrolled bar in both themes; the open mobile menu in both themes.
- Sign-in with the live Clerk form, light and dark at 1440 and dark at 390, including the focused input.
- Application bar, account menu, administration (statistics, table, row menu, confirmation dialog, invitations, status messages, busy button), and the application mobile menu, in light and dark at 390 and 1280 — **rendered on a temporary route with sample data, which has been deleted.** No console errors or hydration warnings on any of these.

Refinements made after the first look: the dark selected theme option, the stage cards' footer line height, and Clerk's focus ring (the first override lost to Clerk's own rule).

Not inspected, and not claimed:

- `/dashboard` and `/admin` in a real signed-in session, Clerk's profile modal, the invitation sign-up form, and Google's button (it is not enabled on the development instance, so its styling in `clerk-appearance.ts` is untested).
- Safari and Firefox.
- Hover states were checked by reading classes and by the pressed/focus screenshots, not each one by mouse.

## 10. Remaining issues

- Carried over from 1B.1: guests sent to sign-in from an application path land on Clerk's hosted page when real keys are configured. It is a routing setting (`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` or `signInUrl` on `clerkMiddleware`) and was left alone.
- `AuthFormFallback` is 23rem, the height of the email-only form. With Google enabled the real form is taller and the card will grow slightly as it loads.
- The filled destructive button in dark mode is a bright salmon. It is legible and on-token, but louder than the rest of dark mode; worth a look when a destructive action first appears outside administration.
- `Ribbon` is still unused, and `Badge` still lives in the users table file.
- The limitations in [HANDOFF-1B.md](HANDOFF-1B.md) still stand.

## 11. Readiness for Phase 1C

Ready. The guidance in [HANDOFF-1B.1.md](HANDOFF-1B.1.md) section 14 still applies. In addition:

- Give every new hover a pressed state, and every compact control a `pointer-coarse:` size of 44px.
- Use `ActionStatus` for action results and the `LoaderCircle` pattern for busy buttons.
- Do not add hover to rows or cards unless the whole thing is a link.

## Process cleanup

No dev server was started: the owner's server on port 3000 was already running, was used for review, and was left running. The only server started was Playwright's managed production server on port 3100, which stopped with its run. Headless browsers were closed by their scripts. The temporary `src/app/design-preview/` route was deleted; the screenshot scripts lived outside the repository. No Git state-changing commands were run.
