import { LogoMark } from "@/components/brand/logo-mark";
import { siteConfig } from "@/lib/site";
import { SplashController } from "./splash-controller";
import { SplashScript } from "./splash-script";

const words = siteConfig.tagline.split(" ");

/** A word's place in the tagline's arrival. */
const place = (index: number) => ({ "--i": index }) as React.CSSProperties;

/**
 * The loading screen, as one short sequence: a soft emerald light comes up,
 * the mark settles into focus with a single sheen crossing it, the name comes
 * up beside that sheen, the tagline's three words follow, and a line of
 * light passes along a hairline beneath for as long as the page is loading.
 * It is in the server's HTML, so it is the first thing painted;
 * `SplashController` takes it down. Styles and the whole choreography are in
 * globals.css under "Splash", and play from the moment the screen is shown.
 *
 * Two things here are the owner's choice and stay: the one glow behind, and
 * the passing light beneath. The light is the only sign of progress, and it
 * claims none: nothing here measures how far loading has got.
 */
export function SplashScreen() {
  return (
    <>
      <SplashScript />
      <div
        data-splash-screen
        role="status"
        aria-label={`Loading ${siteConfig.name}`}
        className="fixed inset-0 z-[100] place-items-center overflow-hidden bg-background"
      >
        {/*
         * The one large glow, centred on the content, and a fine grain over it so it fades
         * smoothly instead of in steps. Both are out of the layout (`absolute` here as well as in
         * the stylesheet), so nothing about them can move the content off centre.
         */}
        <div aria-hidden className="splash-glow absolute" />
        <div aria-hidden className="splash-grain absolute inset-0" />

        <div className="splash-content relative flex flex-col items-center px-6 text-center">
          <div className="splash-mark">
            {/* The tile clips the sheen to the mark's own rounded square. */}
            <div className="splash-tile relative overflow-hidden rounded-[23%]">
              <LogoMark className="block size-24 sm:size-28" />
              <span aria-hidden className="splash-sheen" />
            </div>
          </div>
          <p className="splash-name mt-8 font-display text-[2.25rem] leading-none font-semibold tracking-[-0.02em] sm:text-[2.875rem]">
            {siteConfig.name}
          </p>
          <p aria-hidden className="mt-4 flex gap-2 text-base text-muted-foreground sm:text-lg">
            {words.map((word, index) => (
              <span key={word} className="splash-word" style={place(index)}>
                {word}
              </span>
            ))}
          </p>
          <div
            aria-hidden
            className="splash-rule mt-10 h-px w-52 overflow-hidden rounded-full bg-border sm:w-64"
          >
            <div className="splash-light h-full w-1/2" />
          </div>
        </div>
      </div>
      <SplashController />
    </>
  );
}
