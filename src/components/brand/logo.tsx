import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";
import { LogoMark } from "./logo-mark";

type LogoProps = {
  className?: string;
  markClassName?: string;
};

/** Primary lockup: icon mark with the serif wordmark set in live text. */
export function Logo({ className, markClassName }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-8 shrink-0", markClassName)} />
      <span className="font-display text-[1.3rem] leading-none font-semibold tracking-tight whitespace-nowrap">
        {siteConfig.name}
      </span>
    </span>
  );
}
