import { cn } from "@/lib/utils";

/**
 * The bookmark ribbon from the logo mark, hung from the top edge of a panel
 * to mark the featured one. Emerald, running to gold at its tip.
 * The parent must be positioned; pass a horizontal position in `className`.
 */
export function Ribbon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -top-px h-9 w-4 bg-linear-to-b from-primary from-60% to-gold [clip-path:polygon(0_0,100%_0,100%_100%,50%_76%,0_100%)]",
        className,
      )}
    />
  );
}
