# Handoff: Universal Social Sharing Card

13 October 2026. A companion milestone to Phase 4B, without a number. No migration, no new package. **Status: implemented and verified locally (section 5).** Not deployed, so no platform has fetched it yet.

## 1. What was implemented

One share card for every link to the site, replacing the mark-and-wordmark card from Phase 1.

| File                                 | What                                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| `src/app/opengraph-image.png`        | The card: 1200 × 630 PNG, about 240 KB, committed                  |
| `src/app/opengraph-image.alt.txt`    | Its alt text                                                       |
| `scripts/brand/share-card.mjs` (new) | The page the card is shot from                                     |
| `scripts/generate-brand-assets.mjs`  | Renders it; `npm run brand:assets -- share` renders the card alone |
| `src/app/layout.tsx`                 | `openGraph.url`, and a note on how the image reaches both cards    |
| `tests/e2e/public.spec.ts`           | A test of the tags, the image's address, type, and size            |

## 2. The card

Always dark, whatever the visitor's theme, in the application's own dark tokens (charcoal `#0e0f11`, surfaces `#17191c`, ivory text, emerald `#2da985`, the lamp `#5ff0be` on the lit edge, gold on one short rule).

- **Left, inside 64px margins:** the real mark (`public/brand/mark.svg`) with the wordmark in Playfair Display; the headline **Every Great Sermon Starts Somewhere.** in Playfair Display 500 at 64px over three lines; a short gold rule; **Capture ideas. Build outlines. Keep your preaching record.** in Figtree 500 at 24px.
- **Right:** the dashboard in a window, turned slightly away in perspective, bleeding off the right and bottom edges, with the lit edge on its top border and one emerald glow behind it: the bar with its four destinations and Capture, "Welcome back, Alex", Continue Working with two sermons and their outlines, Revisit an Idea, and At a Glance. In front of its right side, a phone with the same dashboard and the tab bar. The product fades into the dark at the foot.
- **Simplified for small sizes:** the type on the screens is about a quarter larger than the application's, two rows instead of four, and no small controls.
- **Nothing is invented.** The names, statuses, dates, outline sizes, and figures come from `demoWorkspace("en")` (`src/components/marketing/demo.ts`) and the dictionaries, imported by the script itself, so the card shows the landing page's fictional account and cannot disagree with it. No real account is read.

## 3. How it is made, and why that way

- A committed PNG, shot by Playwright's Chromium from an HTML page, as the earlier card was. The brief preferred a deterministic, committed asset; an image route would have added a renderer to the build for one picture, and Satori-style renderers do not do perspective, masks, or the lit edge.
- The script imports TypeScript modules from `src` with Node's own type stripping (Node 24). A resolve hook in `share-card.mjs` maps `@/` and extensionless imports, as the bundler does. Node prints a warning that the modules' type is not declared; it is harmless.
- It loads its fonts from Google Fonts (`display=block`, and it waits for `document.fonts.ready`), so it needs the network when run. It is an authoring step, not part of the build.
- **Remake it** whenever the dashboard's look or the demo changes: `npm run brand:assets -- share`, look at it, commit it.

## 4. Metadata

- The root layout keeps Next's file convention: `opengraph-image.png` beside it gives `og:image` (absolute, on `https://sermontracker.com`), `og:image:width`, `og:image:height`, `og:image:type`, and `og:image:alt`.
- **X gets the same file without a second one.** When `twitter` names no images, Next fills `twitter:image` from the Open Graph image (`node_modules/next/dist/lib/metadata/metadata-resolution-primitives.js`, the "If there's openGraph information but not configured in twitter" branch). The card is `summary_large_image`.
- Added `openGraph.url` ("/", made absolute by `metadataBase`). The title and description were already set; the landing page's canonical stays its own.
- Every page inherits the card, the signed-in ones too; it carries only public, fictional content, and those pages are `noindex`.

## 5. Verification

- Looked at the card at 1200, 600, and 300 pixels wide (downscaled with `sharp`): the headline, the brand, and the dashboard read at all three; the supporting line is small but legible at 300. Two compositions were rejected on the way (the phone covered the sermon titles; then it was cut by the edge).
- `public.spec.ts`, "shares one card", desktop and Pixel 7, against the production build: **pass** on both, in the first run and the final one ([HANDOFF-4B.md](HANDOFF-4B.md), section 9). The image answers 200 as `image/png`, is 1200 × 630, and `og:image` and `twitter:image` are the same absolute address on `https://sermontracker.com`.

**Not done, because the card is not deployed:** the platforms' own validators. After deploying, check them:

- Facebook: [Sharing Debugger](https://developers.facebook.com/tools/debug/) ("Scrape Again" refreshes its copy)
- LinkedIn: [Post Inspector](https://www.linkedin.com/post-inspector/) (inspecting refreshes it)
- X: post the link in a draft; X has no public validator now, and refreshes on its own within about a week
- Slack, iMessage, Discord: paste the link; each keeps its own copy for a while

**Caches.** Every service keeps the image it fetched. To have it fetched again sooner, use the refresh in the tools above. If one still holds on, a query string makes it a new address (`https://sermontracker.com/?v=2`); the image itself already changes address with every build, because Next adds a hash to it.

## 6. Limitations

- One card, in English, for every page and language. Cards per sermon, per page, or per language are not built (out of scope).
- The perspective and the phone's tilt are Chromium's rendering; another renderer was not tried.
