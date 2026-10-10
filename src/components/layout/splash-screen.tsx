import { LogoMark } from "@/components/brand/logo-mark";
import { siteConfig } from "@/lib/site";
import { SplashController } from "./splash-controller";
import { SplashScript } from "./splash-script";

const words = siteConfig.tagline.split(" ");

/**
 * The loading screen: the mark in one soft emerald light, the name, the three
 * words of the tagline arriving in turn, and a line of light passing along a
 * hairline beneath for as long as the page is loading. It is in the server's
 * HTML, so it is the first thing painted; `SplashController` takes it down.
 * Styles are in globals.css under "Splash".
 *
 * The owner chose this arrangement over one that lit the three stages in
 * sequence: keep the passing light beneath, and the glow behind.
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
        {/* The one light, as behind the landing page's hero: large, soft, slowly breathing, and centred on the content. */}
        <div aria-hidden className="splash-glow" />

        <div className="splash-content relative flex flex-col items-center px-6 text-center">
          <LogoMark className="size-24 animate-rise rounded-[1.5rem] shadow-raised sm:size-28 sm:rounded-[1.75rem]" />
          <p className="mt-8 animate-rise font-display text-[2.25rem] leading-none font-semibold tracking-[-0.02em] [animation-delay:120ms] sm:text-[2.875rem]">
            {siteConfig.name}
          </p>
          <p aria-hidden className="mt-4 flex gap-2 text-base text-muted-foreground sm:text-lg">
            {words.map((word, index) => (
              <span
                key={word}
                className="animate-rise"
                style={{ animationDelay: `${380 + index * 180}ms` }}
              >
                {word}
              </span>
            ))}
          </p>
          <div
            aria-hidden
            className="mt-10 h-px w-52 animate-rise overflow-hidden rounded-full bg-border [animation-delay:500ms] sm:w-64"
          >
            <div className="splash-light h-full w-1/2" />
          </div>
        </div>
      </div>
      <SplashController />
    </>
  );
}
