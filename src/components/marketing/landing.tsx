import type { Locale } from "@/i18n/locales";
import { Reveals } from "./reveals";
import { Closing } from "./sections/closing";
import { Features } from "./sections/features";
import { Hero } from "./sections/hero";
import { HowItWorks } from "./sections/how-it-works";
import { MobileApp } from "./sections/mobile-app";

/**
 * The landing page's sections, in order. Everything on it is static but its entrances (`Reveals`): the
 * screens it shows are reconstructions drawn from the demonstration workspace
 * (demo.ts), and nothing here reads an account, a database, or the clock. It
 * takes the language as a prop, so it can be rendered without a request.
 */
export function Landing({ locale }: { locale: Locale }) {
  return (
    <>
      <Hero locale={locale} />
      <HowItWorks locale={locale} />
      <Features locale={locale} />
      <MobileApp locale={locale} />
      <Closing locale={locale} />
      <Reveals />
    </>
  );
}
