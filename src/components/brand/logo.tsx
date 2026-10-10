import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";
import { LogoMark } from "./logo-mark";

type LogoProps = {
  className?: string;
  markClassName?: string;
  /** Sizes the wordmark; its optical offset is in ems, so it scales with it. */
  textClassName?: string;
  /** Mark colourway; defaults to the primary emerald tile. */
  markVariant?: ComponentProps<typeof LogoMark>["variant"];
};

/**
 * Primary lockup: icon mark with the wordmark set in live text. Playfair's
 * baseline sits low in a `leading-none` box, which leaves the capitals about
 * 2px below the mark's centre at this size, so the wordmark is raised to put
 * their midpoint on it. Measure the glyphs, not the box, if this changes.
 */
export function Logo({ className, markClassName, textClassName, markVariant }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark variant={markVariant} className={cn("size-7 shrink-0", markClassName)} />
      <span
        className={cn(
          "-translate-y-[0.065em] font-display text-[1.1875rem] leading-none font-semibold tracking-[-0.01em] whitespace-nowrap",
          textClassName,
        )}
      >
        {siteConfig.name}
      </span>
    </span>
  );
}
