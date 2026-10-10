import { cn } from "@/lib/utils";

type BadgeProps = {
  tone: "accent" | "muted" | "danger";
  children: string;
};

/** A small status marker. The dot means tone is never carried by colour alone. */
export function Badge({ tone, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone === "accent" && "bg-primary-soft text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "danger" && "bg-destructive/10 text-destructive",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
