import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes } from "@/lib/site";

export function BetaNotice() {
  return (
    <section aria-labelledby="beta-heading" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <div className="relative isolate overflow-hidden rounded-3xl bg-brand-surface px-6 py-12 text-on-brand sm:px-12 sm:py-14">
        <div className="absolute -right-16 -bottom-24 -z-10 size-72 rounded-full bg-on-brand/10 blur-3xl" />
        <div className="mb-6 h-px w-12 bg-gold" aria-hidden />
        <h2
          id="beta-heading"
          className="max-w-xl font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
        >
          Currently available by invitation
        </h2>
        <p className="mt-4 max-w-xl leading-relaxed text-on-brand/80">
          Sermon Tracker is being built with a small group of preachers while its core features take
          shape. Accounts are created by invitation during this period.
        </p>
        <Link
          href={routes.signIn}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mt-8 border-on-brand/30 bg-transparent text-on-brand outline-on-brand hover:bg-on-brand/10",
          )}
        >
          Already invited? Sign in
        </Link>
      </div>
    </section>
  );
}
