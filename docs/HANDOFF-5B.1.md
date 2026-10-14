# Phase 5B.1 handoff: Settings workspace

Implemented 14 October 2026. No migration, no new package. Next: Phase 5C.

## What changed

`/settings` was one long page of six sections. It is now an overview with seven category pages under a shared layout (`src/app/(app)/settings/layout.tsx`):

| Page                   | Holds                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| `/settings`            | Overview: every category as a card (icon, title, description)            |
| `/settings/profile`    | Picture, name, email addresses; Church & Ministry (`#ministry`)          |
| `/settings/bible`      | Interface language and Bible translation; the reader's copy shortcut     |
| `/settings/appearance` | Theme                                                                    |
| `/settings/app`        | Install the app (`#install`), Restart Product Tour, Run Account Setup    |
| `/settings/offline`    | Offline Storage (`#offline-capture`, `#offline-bible`), with a usage bar |
| `/settings/sync`       | Coming Soon for Phase 5C, with no controls or statuses                   |
| `/settings/account`    | Access (read-only), password, connected accounts, devices                |

- **Desktop (`lg` and up):** a sidebar (`SettingsNav`) sits beside the page and stays in reach below the bar while the page scrolls. It marks the current category with `aria-current="page"`: a neutral surface and a 2px emerald rule.
- **Phone:** the overview is the category list. Each page starts with "Back to Settings" (`BackLink`), so the tab bar is untouched and nothing scrolls sideways.
- **Cards:** `SettingsBlock` is now a card (`rounded-xl border bg-surface shadow-card`) and a `region` named by its title. `SettingsSection` is gone.
- **Categories:** the list is `settingsCategories` (`src/features/settings/categories.ts`). Their words are `settings.categories` in English and Spanish.

## Navigation and old links

- The dashboard notices now link straight to the new pages:
  - `InstallNotice` → `/settings/app#install`
  - `OfflineNotice` → `/settings/offline` and `/settings/offline#offline-capture`
  - `ScrollToHash` on the target page keeps the block in view while the page streams in.
- **Old addresses:** a hash never reaches the server, so `LegacySettingsHash` on the overview reads it and calls `router.replace` (mapping in `legacySettingsHashes`). An unknown hash stays on the overview, so nothing can loop. It covers:
  - `#install`, `#offline`, `#offline-capture`, `#offline-bible`
  - the old section ids: `#personal`, `#ministry`, `#bible-language`, `#appearance`, `#account`
- **Onboarding:** in review mode, "Exit setup" and "Back to Settings" now return to `/settings/app`, where Run Account Setup lives.
- **Connected accounts:** connecting an account now returns to `/settings/account`.
- **Unsaved typing:** moving between categories unmounts a page's forms, so the name form and Church & Ministry now guard typed lines with `useLeaveGuard`. Password fields are not guarded.

## Verification

Run:

- **Focused Vitest, 9 files:**
  - the new `settings/page.test.tsx`, covering every page, access, en/es, the sidebar's `aria-current`, legacy-hash mapping and unknown hashes, and the read-only account
  - `church-ministry-settings` (new leave-guard cases), `account-forms`, `scroll-to-hash`
  - `install-notice`, the offline `components.test`
  - the onboarding page and wizard tests
  - `site.test`
  - **Result: 95 passed.** One earlier run had two timeouts in the new guard tests under parallel load; their waits now allow 3 seconds, and two further runs passed.
- **ESLint** on the changed files: clean.
- **`next build`:** succeeds, and its type check passes. All eight settings routes build as partial prerenders.

Not run:

- `npm run build`'s migration step: no migration in this phase.
- **The whole unit suite.**
- **End-to-end specs.** `onboarding.spec.ts`, `tour.spec.ts`, and `pwa.spec.ts` were updated for the new addresses but not run, because onboarding and tour change the shared account.
- **A signed-in browser pass** at phone and desktop widths, in both themes and both languages.
