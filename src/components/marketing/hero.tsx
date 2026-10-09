import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { routes, siteConfig } from "@/lib/site";
import { sampleIdeas, type SampleIdea } from "./sample-ideas";

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-10 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-16 lg:pb-28">
      <div className="max-w-xl">
        <p className="inline-flex animate-rise items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground">
          <span className="size-1.5 rounded-full bg-gold" aria-hidden />
          Invitation-only beta
        </p>
        <h1 className="mt-6 animate-rise font-display text-6xl leading-[0.95] font-semibold tracking-tight [animation-delay:60ms] sm:text-7xl lg:text-[5.25rem]">
          {siteConfig.name}
        </h1>
        <p className="mt-5 animate-rise text-sm font-semibold tracking-[0.28em] text-primary uppercase [animation-delay:120ms] sm:text-base">
          {siteConfig.tagline}
        </p>
        <p className="mt-6 animate-rise text-lg leading-relaxed text-muted-foreground [animation-delay:180ms]">
          Sermon ideas rarely arrive at the desk. Sermon Tracker gives preachers one place to
          capture a title, a text, or a single point before it is forgotten, and to develop it when
          the time comes.
        </p>
        <div className="mt-8 flex animate-rise flex-wrap items-center gap-3 [animation-delay:240ms]">
          <Link href={routes.signIn} className={buttonVariants({ size: "lg" })}>
            Sign in
            <ArrowRight />
          </Link>
          <Link href="#preview" className={buttonVariants({ variant: "ghost", size: "lg" })}>
            See what is planned
          </Link>
        </div>
      </div>

      <HeroArt />
    </section>
  );
}

/** Decorative composition echoing the logo: ruled page, gold bookmark, idea slips. */
function HeroArt() {
  const [sermon, point, undecided] = sampleIdeas;

  return (
    <div
      aria-hidden
      className="relative mx-auto w-full max-w-md animate-rise [animation-delay:200ms] lg:max-w-none"
    >
      <div className="relative isolate overflow-hidden rounded-3xl bg-brand-surface px-5 pt-16 pb-8 text-on-brand shadow-2xl shadow-black/20 sm:px-8 sm:pt-20 sm:pb-10">
        {/* ruled page lines */}
        <div className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(to_bottom,transparent_0_2.4rem,color-mix(in_oklab,var(--on-brand)_7%,transparent)_2.4rem_calc(2.4rem+1px))]" />
        {/* soft glow */}
        <div className="absolute -top-28 -left-20 -z-10 size-72 rounded-full bg-on-brand/10 blur-3xl" />
        {/* bookmark ribbon */}
        <div className="absolute top-0 right-9 h-14 w-7 bg-gold [clip-path:polygon(0_0,100%_0,100%_100%,50%_82%,0_100%)] sm:right-12 sm:h-24" />

        <p className="absolute top-6 left-5 text-[0.7rem] font-semibold tracking-[0.24em] text-on-brand/70 uppercase sm:left-8">
          Illustrative preview
        </p>

        <div className="space-y-3">
          <IdeaSlip idea={sermon} className="sm:mr-10" />
          <IdeaSlip idea={point} className="sm:ml-10" />
          <IdeaSlip idea={undecided} className="sm:mr-16" />
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-full border border-on-brand/20 bg-on-brand/10 py-2 pr-4 pl-2 backdrop-blur-md">
          <span className="grid size-8 place-items-center rounded-full bg-gold text-gold-foreground">
            <Plus className="size-4" />
          </span>
          <span className="text-sm text-on-brand/80">Capture a thought…</span>
        </div>
      </div>
    </div>
  );
}

function IdeaSlip({ idea, className }: { idea: SampleIdea; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-card px-4 py-3.5 text-card-foreground shadow-lg shadow-black/10",
        className,
      )}
    >
      <div className="flex items-center justify-between text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        <span>{idea.kind}</span>
        <span>{idea.scripture}</span>
      </div>
      <p className="mt-1.5 font-display text-lg leading-snug font-semibold">{idea.title}</p>
    </div>
  );
}
