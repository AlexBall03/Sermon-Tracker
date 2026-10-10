import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";

/** Closing band: a hairline with a short gold rule on it, and no panel. */
export function BetaNotice() {
  return (
    <section id="beta" aria-labelledby="beta-heading" className="container-page pb-16 lg:pb-24">
      <div className="relative grid gap-8 border-t pt-12 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16 lg:pt-14">
        <span aria-hidden className="absolute -top-px left-0 h-px w-14 bg-gold" />
        <div>
          <h2
            id="beta-heading"
            className="max-w-2xl font-display text-[2rem] leading-[1.12] font-medium tracking-[-0.015em] text-balance sm:text-[2.625rem]"
          >
            Currently available by invitation
          </h2>
          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground">
            Sermon Tracker is being built with a small group of preachers while its core features
            take shape. Accounts are created by invitation during this period.
          </p>
        </div>
        <Link
          href={routes.signIn}
          className={buttonVariants({ size: "lg", className: "justify-self-start" })}
        >
          Already invited? Sign in
          <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
