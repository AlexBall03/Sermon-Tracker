import { cn } from "@/lib/utils";

/** A marketing section's heading and the paragraph under it, the same on every section. */
export const sectionTitle =
  "font-display text-[2rem] leading-[1.12] font-medium tracking-[-0.015em] text-balance sm:text-[2.625rem]";
export const sectionLead = "mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-muted-foreground";

/**
 * A window too wide for where it is shown, cut off at the right with the edge
 * faded, so it reads as a window that goes on and never widens the page. On a
 * narrow screen it runs out to the screen's edge.
 */
export function Cropped({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "-mr-5 overflow-hidden mask-[linear-gradient(to_right,black_76%,transparent)] py-1 pl-px sm:-mr-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
