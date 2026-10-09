import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { routes, siteConfig } from "@/lib/site";
import { ProductPreview } from "./product-preview";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="bg-grid absolute inset-x-0 top-0 -z-10 h-[44rem]" />

      <div className="container-page pt-16 pb-20 sm:pt-24 lg:pb-28">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <p className="inline-flex animate-rise items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground shadow-card">
            <span className="size-1.5 rounded-full bg-gold" aria-hidden />
            Invitation-only beta
          </p>
          <h1 className="mt-8 animate-rise font-display text-[clamp(3rem,10vw,7.5rem)] leading-[0.95] font-semibold tracking-[-0.03em] text-balance [animation-delay:60ms]">
            {siteConfig.name}
          </h1>
          <p className="mt-6 animate-rise text-sm font-semibold tracking-[0.3em] text-primary uppercase [animation-delay:120ms] sm:text-base">
            {siteConfig.tagline}
          </p>
          <p className="mt-6 max-w-2xl animate-rise text-lg leading-relaxed text-pretty text-muted-foreground [animation-delay:180ms] sm:text-xl">
            Sermon ideas rarely arrive at the desk. Keep every title, text, and single point in one
            place before it is forgotten, and develop it when the time comes.
          </p>
          <div className="mt-10 flex animate-rise flex-wrap items-center justify-center gap-3 [animation-delay:240ms]">
            <Link href={routes.signIn} className={buttonVariants({ size: "lg" })}>
              Sign in
              <ArrowRight />
            </Link>
            <Link href="#preview" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See what is planned
            </Link>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl animate-rise [animation-delay:320ms] sm:mt-20">
          {/* the one emerald glow on this page */}
          <div aria-hidden className="glow-emerald absolute -inset-x-8 -top-20 bottom-8 -z-10" />
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
