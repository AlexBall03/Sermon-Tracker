import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { DashboardPhone, DashboardWindow } from "../preview/dashboard-preview";
import { Preview } from "../preview/frames";

/**
 * The hero: what the product is, the way in, and the dashboard itself. Which
 * dashboard is shown follows the screen, at the same `md` boundary where the
 * application changes from its tab bar to its link row: a phone below it, the
 * window from it up. That is decided in CSS alone.
 */
export function Hero({ locale }: { locale: Locale }) {
  const t = dictionary(locale, "marketing").hero;
  return (
    // Clipped sideways: the glow behind the window reaches past the container.
    <section className="overflow-x-clip">
      <div className="container-page pt-10 pb-14 sm:pt-14 lg:pt-16 lg:pb-20">
        <p className="flex animate-rise items-center gap-2.5 text-sm font-medium text-muted-foreground">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
          {t.eyebrow}
        </p>
        <h1 className="mt-5 max-w-[17ch] animate-rise font-display text-[clamp(2.5rem,10.5vw,4.25rem)] leading-[1.04] font-medium tracking-[-0.02em] text-balance [animation-delay:60ms] xl:text-[4.75rem]">
          {t.title}
        </h1>
        {/* One column: the actions sit directly under the copy they follow from. */}
        <div className="mt-6 animate-rise [animation-delay:120ms] lg:mt-7">
          <p className="max-w-[40rem] text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            {t.body}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={routes.signIn} className={buttonVariants({ size: "lg" })}>
              {t.signIn}
              <ArrowRight data-trailing aria-hidden />
            </Link>
            {/* A plain anchor: next/link does not scroll again to a hash already in the URL. */}
            <a href="#how-it-works" className={buttonVariants({ variant: "outline", size: "lg" })}>
              {t.how}
            </a>
          </div>
        </div>

        <Preview
          description={t.desktopAlt}
          className="mt-10 animate-rise [animation-delay:200ms] max-md:hidden lg:mt-14"
        >
          <div data-hero="window" className="hero-glow">
            <div className="lit-edge rounded-2xl shadow-raised">
              {/* Drawn at a wide screen's width and scaled to the container at each breakpoint. */}
              <DashboardWindow locale={locale} className="[zoom:0.66] lg:[zoom:0.87] xl:[zoom:1]" />
            </div>
          </div>
        </Preview>
        <Preview
          description={t.mobileAlt}
          className="mt-10 animate-rise [animation-delay:200ms] md:hidden"
        >
          <div data-hero="phone" className="hero-glow mx-auto w-fit">
            <DashboardPhone locale={locale} />
          </div>
        </Preview>
      </div>
    </section>
  );
}
