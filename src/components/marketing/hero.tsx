import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { routes, siteConfig } from "@/lib/site";
import { ProductPreview } from "./product-preview";

export function Hero() {
  return (
    // Clipped sideways: the glow behind the window reaches past the container.
    <section className="overflow-x-clip">
      <div className="container-page pt-10 pb-14 sm:pt-14 lg:pt-16 lg:pb-20">
        <p className="flex animate-rise items-center gap-2.5 text-sm font-medium text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          <span>
            <span className="font-semibold text-foreground">{siteConfig.name}</span> is in
            invitation-only beta
          </span>
        </p>
        {/*
         * The tagline is the headline: its three words are the product's three
         * stages. `w-min` stacks them on small screens while keeping one text
         * node; from `lg` they run as a single line.
         */}
        <h1 className="mt-5 w-min animate-rise font-display text-[clamp(3rem,13.5vw,4.5rem)] leading-[1.02] font-medium tracking-[-0.02em] [animation-delay:60ms] lg:w-auto lg:text-[4.5rem] lg:whitespace-nowrap xl:text-[5.25rem]">
          {siteConfig.tagline}
        </h1>
        {/* One column: the actions sit directly under the copy they follow from. */}
        <div className="mt-6 animate-rise [animation-delay:120ms] lg:mt-7">
          <p className="max-w-[38rem] text-[1.0625rem] leading-relaxed text-pretty text-muted-foreground sm:text-lg">
            Sermon ideas rarely arrive at the desk. Keep every title, text, and single point in one
            place before it is forgotten, and develop it when the time comes.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={routes.signIn} className={buttonVariants({ size: "lg" })}>
              Sign in
              <ArrowRight data-trailing />
            </Link>
            <Link
              href="#capabilities"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              See how it works
            </Link>
          </div>
        </div>

        <ProductPreview />
      </div>
    </section>
  );
}
