import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";

export function BetaNotice() {
  return (
    <section id="beta" aria-labelledby="beta-heading" className="container-page scroll-mt-24 pb-24">
      <div className="relative isolate overflow-hidden rounded-xl border bg-surface px-6 py-12 shadow-card sm:px-12 sm:py-16">
        {/* faint emerald wash in one corner; the panel itself stays neutral */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_100%_100%,var(--glow),transparent)]"
        />
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end lg:gap-16">
          <div>
            <div className="mb-6 h-px w-12 bg-gold" aria-hidden />
            <h2
              id="beta-heading"
              className="max-w-2xl font-display text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl"
            >
              Currently available by invitation
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
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
      </div>
    </section>
  );
}
