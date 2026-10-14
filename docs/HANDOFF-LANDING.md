# Handoff: Public Landing Page Modernization

13 October 2026. No migration and no schema change; one new package, `@clerk/localizations` (section 3a). **Status: implemented; checked as section 6 says.** Not deployed. This milestone has no phase number: it came between the Dashboard Redesign and Phase 4B. The brief for it was headed "Phase 4B"; the owner chose to keep the name it had in the roadmap, so Phase 4B is still the product tour, and nothing of the tour was started.

## 1. What was implemented

`/` is rebuilt around the application as it is now. It was the Phase 1 page: English only, with illustrations captioned as "still being built".

- **Hero**: "From First Thought to Finished Sermon.", one paragraph, Sign In and "See how it works", and the dashboard reconstructed: a window from `md` up, a phone below it.
- **How It Works** (`#how-it-works`): Capture, Develop, Outline, Preach, Revisit, each with a small example, and a line saying none of it is a required order.
- **Features** (`#features`): Library, Bible, Outlines, Preaching Record, Dashboard, each with its screen. Windows sit right of their words and phones left, so they alternate.
- **Mobile App** (`#mobile-app`): a phone with the dashboard scrolled on, the icon as a home screen shows it, and three steps to install from the browser.
- **Closing band** (`#access`): Sign In, and one line that accounts are by invitation for now.
- Header and footer links in the page's order, the section being read marked in the header, the language choice in the footer.
- English and Spanish throughout, the page's title and description included.
- Entrances as the page is scrolled, and the rows of each reconstructed screen arriving after it.

Removed: `hero.tsx`, `product-preview.tsx`, `app-preview.tsx`, `capabilities.tsx`, `beta-notice.tsx`, `sample-ideas.ts`, `src/app/(marketing)/page.test.tsx` (replaced by `landing.test.tsx`), the capture illustration's five animations in `globals.css`, and `siteConfig.blurb`.

Not built, on purpose: a "Request Account" action or route, a manifest or service worker, any offline behavior, an interactive demonstration, screenshots, a device check on the server.

## 2. How it works

The full account is "Landing page" in `ARCHITECTURE.md`. In short:

- `src/components/marketing/preview/` redraws five screens as plain markup inside `WindowFrame` or `PhoneFrame`. They copy the real components' classes and read the same dictionaries, and reuse only pure pieces. The real components are not rendered.
- Every screen is a `<figure>` whose drawing is hidden from assistive technology and holds nothing focusable, with one hidden caption.
- `demo.ts` is the one fictional workspace ("Alex", initials AB). Its lists and figures are worked out from the same ideas and occasions by the application's own constants.
- A window is drawn at desktop width and scaled with `zoom` (0.66, 0.87, 1 in the hero, by breakpoint); in a feature row it is cropped at the right. A phone is drawn at 390px and scaled to 0.75.
- The `(marketing)` layout and the page read the language from `getPreferences()` behind `<Suspense>`. **The landing page is no longer prerendered whole**: each visit reads the access state and the settings row, as the sign-in pages already did.
- `Reveals` switches the entrances on; `reveal`, `stagger`, and `mark-in` are in `globals.css`.

## 3. Decisions taken with the owner

- **No "Request Account".** No request route exists, and the owner intends anyone to be able to create an account later. The way in is Sign In.
- **The Mobile App copy is written as if the PWA exists**, because Phase 5 is close. This replaces the roadmap's earlier line that promoting installation was not part of this milestone.
- **The name stays unnumbered.**
- The demonstration account is "Alex", "AB".
- Scroll entrances and motion inside the examples were asked for during the work. The first version tied the entrance to the scroll position in CSS alone; it was replaced with a timed entrance on first view, which is what is there now.

## 3a. Added afterwards, at the owner's request

- **Clerk's sign-in and account-creation forms are in Spanish** when the page is. New package: `@clerk/localizations` (the one dependency this work added). `AppClerkProvider` (`src/components/layout/clerk-provider.tsx`) replaces the `ClerkProvider` the root layout mounted, with the same options, and passes Clerk its Spanish when `<html lang>` says Spanish. Nesting a localized provider around the form was not possible: Clerk ignores a nested provider. The titles of the sign-in and accept-invitation pages are in the visitor's language too.
- **"Back to home"** in words under the card on the sign-in, accept-invitation, and access-denied pages, beside the language choice.
- Checked with type checking, lint and formatting on the files changed, `npx playwright test auth public dashboard` (72 passed, 4 skipped; the two Spanish checks skipped because they read the language too early, were made to wait, and then passed on their own run: 6 passed), and in the browser on the sign-in page in both languages. The signed-in dashboard journey passed with the new provider. The accept-invitation form in Spanish was not seen: it needs an invitation ticket.

- **The card no longer folds after signing in.** Once a person is signed in Clerk's form draws nothing, and for the moment before the application opened the card collapsed. `src/app/(auth)/clerk-forms.tsx` (`SignInForm`, `SignUpForm`) keeps the form mounted but hidden and fills the card with the loading placeholder. **Not seen working:** it needs a real sign-in through the form, which the tests do not do (they sign in with a ticket) and which was not done by hand. `npx playwright test auth dashboard` passed afterwards (44 passed).
- `AuthNotice` no longer adds its own "Back to home" button and takes no `locale`: the link under every card replaced it, and the two stood together on the invitation-required page.

## 4. Rules this changed

Recorded in `ARCHITECTURE.md` and `AGENTS.md`:

- "There are no scroll-triggered entrances" now holds for the application only. The landing page has them.
- The landing page's reconstructions are a second drawing of five screens. They must be changed when those screens change.

## 5. Files

- New: `src/components/marketing/{landing.tsx, landing.test.tsx, demo.ts, reveals.tsx}`, `sections/{hero, how-it-works, features, mobile-app, closing, shared}.tsx`, `preview/{frames, dashboard-preview, library-preview, outline-preview, phone-previews}.tsx`, `src/components/layout/section-links.tsx`, `src/i18n/dictionaries/{en,es}/marketing.ts`.
- Moved: `src/app/(auth)/guest-language.tsx` to `src/components/layout/guest-language.tsx` (it takes a `className` now; the auth shell passes the one it had).
- Changed: `src/app/(marketing)/{layout,page}.tsx`, `site-header.tsx`, `mobile-nav.tsx`, `home-link.tsx`, `site-footer.tsx`, `src/lib/site.ts` (the description), `src/app/globals.css`, both dictionary indexes, `tests/e2e/{public,auth,loading}.spec.ts`.
- Nothing under `(app)`, `(setup)`, `src/features`, `src/db`, or the proxy was changed.

## 6. Verification

| Check                                                                                                                                                      | Result                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `npx tsc --noEmit`                                                                                                                                         | Passed                                                  |
| `npx eslint` on `src/components/marketing`, `src/components/layout`, `src/app/(marketing)`, `src/app/(auth)`, the dictionaries, `tests/e2e/public.spec.ts` | Passed                                                  |
| `npx prettier --check --end-of-line auto` on the files changed                                                                                             | Passed                                                  |
| `npx vitest run src/components/marketing src/i18n src/components/layout`                                                                                   | 83 passed, 9 files                                      |
| `npx playwright test public loading auth` (which makes the production build), desktop and mobile                                                           | 75 passed, 1 skipped (the mobile menu test, on desktop) |
| Browser, the owner's dev server: 1280, 820, and 390 wide, dark; Spanish in light at the same three widths; the hero in light in English                    | Looked at; no sideways scroll at any of them            |
| The entrance on scroll, and the Mobile App section's new side                                                                                              | Looked at in dark at one wide width                     |
| Whole unit suite; signed-in end-to-end specs                                                                                                               | **Not run**: nothing they cover was changed             |
| Production or preview                                                                                                                                      | **Not touched**                                         |

The first end-to-end run had one failure, on mobile: the theme test looked for the menu button before the header had arrived, now that the header waits for the language. The helper waits for the bar; the second run passed.

Not looked at: the entrances and the examples' motion at phone and tablet widths, and in light; the page in a browser without `zoom` support older than Firefox 126; a screen reader's reading of the page.

## 7. For the owner's attention

- **If this is deployed before Phase 5, the Mobile App section overstates.** "Add to Home Screen" gives a browser shortcut until the manifest exists. The copy is `marketing.mobile` in both dictionaries.
- **The page costs a settings read per visit now**, where it was static. If that matters before launch, the alternative is a language in the address.
- The Spanish copy and the Spanish sermon titles in the demonstration were written here and have not been read by a Spanish speaker.
- Open Graph text and the share image are still English, from the root layout.
