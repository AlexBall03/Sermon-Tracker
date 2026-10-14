# Handoff: Loading Experience 2.0

13 October 2026. A companion milestone to Phase 4B, without a number. No migration, no new package. **Status: implemented and verified in development (section 6).** Not deployed.

## 1. What was implemented

The splash screen was redesigned, inside the system that already decides when it shows and takes it down, and the moment after signing in was made seamless. _When_ it appears did not change: the first page of a browser session, and the first page after signing in (`src/lib/splash.ts`, untouched). The progress bar is untouched.

| File                                                          | Change                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/components/layout/splash-screen.tsx`                     | New markup: the glow, a grain over it, the mark on its own shadow with a sheen, the name               |
| `src/app/globals.css` ("Splash")                              | The sequence, the lift, the hidden page behind, and a still version under reduced motion               |
| `src/components/layout/splash-controller.tsx`                 | New timing (`introMs`, `reducedMs`, `reducedFadeMs`) and `holdSplash` for the moment of sign-in        |
| `src/app/(auth)/clerk-forms.tsx`                              | Holds the card at full size until Clerk's form is drawn, and raises the splash in the frame it empties |
| `src/app/(auth)/auth-notice.tsx`, `src/app/(auth)/layout.tsx` | The placeholder as tall as Clerk's card at each width; the links under the card hold their room        |
| `src/components/layout/splash-script.tsx`                     | A comment                                                                                              |

## 2. The sequence

All CSS. Every part counts from the moment the screen is displayed, so the paths that raise it after a navigation play it from the start too.

| When    | What                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0       | The one glow blooms behind the content, then breathes slowly. It eases out over several stops, under a grain at 5% opacity, so it fades smoothly instead of in visible steps |
| 80ms    | The real `LogoMark` comes into focus, from 92% and a 6px blur, resting on a soft emerald shadow of its own                                                                   |
| 300ms   | The name rises out of a slight blur                                                                                                                                          |
| 450ms   | One band of light crosses the tile, clipped to its rounded square                                                                                                            |
| 520ms   | "Capture. Develop. Preach.", word by word, 110ms apart                                                                                                                       |
| 600ms   | The hairline opens from its centre                                                                                                                                           |
| 900ms + | The light passes along the hairline for as long as the page is loading. It is the only sign of progress and measures nothing                                                 |
| Leaving | The content lifts 12px, grows 2%, and fades in 0.22s; the glow widens; the screen fades onto the page in 0.48s, and the page's paused entrances begin                        |

Kept from before, as the owner chose: the one large glow behind, and the passing light beneath.

**A first version was replaced the same day at the owner's word** ("the loading screen looks like garbage"). It had hairline rings around the mark, a second light along the foot of the screen, a halo, and the name drawn out by a moving mask. Rendered, the rings read as a target, both gradients showed visible bands, the light theme went muddy, and the mask left a stray edge beside the name. All four were removed. The owner's screenshot also showed the content sitting below the light, which is what happens when the stylesheet the browser has is older than the markup (a development reload). The light and the grain are now `absolute` in the markup as well, so they can never push the content down.

## 3. From signing in to the application

The owner saw the sign-in card collapse to a thin line three times: once after signing in, then (after a first fix) before the form appeared, then after signing in again. Each was filmed here frame by frame against a production build before it was fixed. There were three separate causes on this one page:

1. **Before the form.** The placeholder card stood only until the page hydrated. Clerk's `<SignIn>` draws nothing until Clerk's script has arrived from its servers, about a second later, so for that second the card had no height: measured at 0px from 106ms to 1,142ms on a return visit.
2. **After signing in.** Clerk clears its form as a sign-in completes, sometimes a frame before `isSignedIn` turns true. A first fix that raised the splash on `isSignedIn` therefore still let one cleared frame through with the real form, though not with the test helper's sign-in.
3. **The links under the card.** "Back to home" and the language choice stream in after the page with no fallback, and the column is centred, so their arrival moved the logo and the card about 45px up the screen.

What is there now:

- `Held` (`clerk-forms.tsx`) keeps its state on the element, `data-form`: `loading`, `shown`, or `done`. Only at `shown` is Clerk's form seen. Otherwise the placeholder card stands in its place, and the form is laid out unseen beneath it. The state is set from a `ResizeObserver` on the form, whose callbacks run after layout and **before the frame is painted**:
  - `loading` to `shown` when Clerk's form is drawn (taller than 48px), so the two swap in one frame;
  - `shown` to `done` the moment the drawn form empties, which Clerk does only as a sign-in completes. The splash is raised (`holdSplash()`) in that same callback, so the frame that would have shown the collapse is painted with the splash. `isSignedIn` turning true does the same, for any path that gets there first.
- A held splash stays up until the address changes, then goes as any splash does, at once if its opening has played. If the next page never comes, it lets go after `giveUpMs` (8 seconds).
- The placeholder is as tall as Clerk's card at each width (23rem, 25.0625rem below `sm`), and the links under the card hold their room while they stream in (`BeneathSpace` in `app/(auth)/layout.tsx`).
- A sign-in that ends in a full page load is as before: the inline script raises the splash on the new document.

## 4. Timing

| Constant (`splashTiming`) | Before             | Now   | Meaning                                                                   |
| ------------------------- | ------------------ | ----- | ------------------------------------------------------------------------- |
| `introMs`                 | 1800 (`visibleMs`) | 1200  | Never down before this, so the opening is never cut off. No rest after it |
| `fadeMs`                  | 450                | 480   | The lift                                                                  |
| `reducedMs`               | none               | 500   | With reduced motion: a still picture, shown long enough not to be a flash |
| `reducedFadeMs`           | none               | 200   | With reduced motion: a plain short fade                                   |
| `giveUpMs`                | 8000               | 8000  | Stops waiting for `load`, or for the page after a held sign-in            |
| script's last resort      | 10000              | 10000 | If the application's script never runs                                    |

A page that is ready sooner is let go 0.6 seconds earlier than before; a slow one goes the moment `load` fires, as before. It is never shown for ordinary navigation.

## 5. Decisions

- **No minimum beyond the opening.** Taking the splash down before its sequence has played would flash half a picture; resting on the finished picture serves nothing, so that was removed.
- **The page behind is hidden while the screen covers it**: `visibility: hidden` on everything in `<body>` but the splash, its script, and the progress bar, only while `data-splash="on"`. It changes nothing seen and means Tab and a screen reader cannot reach what is behind it. It returns the moment the screen starts to lift. A key pressed during the first 1.2 seconds of a first visit reaches nothing.
- **Reduced motion is a still picture**: the global rule leaves every animation at its end, and a rule beside it rests the light in the middle of its hairline and keeps a 0.2 second fade.
- **No progress measure.** The browser does not say how far a page has got, and nothing here pretends to.
- The status is still the English "Loading Sermon Tracker": the root layout is static and does not know the language.

## 6. Verification

| Check                                                                                                                                                                                                     | Result                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loading.test.tsx`: timings, reduced motion, give-up, React's double effect, raised again while leaving, the sign-in by navigation, the sign-in hold and its give-up (17 tests)                           | **Pass**, 17 of 17, on the final code                                                                                                             |
| `loading.spec.ts`, desktop and Pixel 7, against a production build: shown once and gone, its timing measured inside the page, the page behind hidden, reduced motion                                      | **Pass**, 10 of 10, on the first design and again on the final code                                                                               |
| Screenshots of a production build at 150, 450, 800, and 1150ms: desktop dark and light, phone dark                                                                                                        | Looked at; the final design is the one described above                                                                                            |
| `/sign-in` filmed on a production build, its state logged on every animation frame: a return visit at 1280px (dark), a first visit behind the splash at 1280px and 390px, a return visit at 390px (light) | **No frame with a collapsed card.** The card keeps its height and position from first paint through the swap to Clerk's form (moving at most 1px) |
| An address with no account submitted                                                                                                                                                                      | Clerk's error grows the card; it stays shown and no splash goes up                                                                                |
| Clerk's form emptied, read by a second `ResizeObserver` after the page's own, as the frame is about to be painted                                                                                         | The card is already the placeholder at full height, and the splash is up and displayed                                                            |
| A real sign-in on the page with Clerk's test helper, then Clerk's own navigation to `/dashboard`                                                                                                          | The splash goes up at once, the dashboard arrives beneath it, and it lifts 1.2 seconds after it rose                                              |

Not done: a real phone, a screen reader, and **a sign-in typed into Clerk's form**. A test here has no way to type the owner's credentials, so the form's own completion was reproduced by emptying Clerk's form on the page (what Clerk does as it completes) rather than by typing a code. The owner is asked to sign in once and confirm.

## 7. Next

Nothing is owed. Phase 5 (PWA) will decide what an installed application shows on launch; this splash is for a page loaded in a browser.
