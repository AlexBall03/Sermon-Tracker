import type { LucideIcon } from "lucide-react";

type StatusPageProps = {
  icon: LucideIcon;
  /** A short code above the title, such as "404". */
  eyebrow?: string;
  title: string;
  body: string;
  /** The ways on from here: the main one first, as buttons or links styled as buttons. */
  children: React.ReactNode;
  /** A small line under the actions, such as a reference to quote. */
  note?: React.ReactNode;
  /** `alert` where the page replaces one that failed. */
  role?: "alert";
};

/**
 * A page that has nothing to show but what happened: something failed, or
 * nothing is at this address. Centered in the space under the bar, a little
 * above the middle, with no card. It has no state and reads no strings, so
 * Server and Client Components both use it, and so does the root error page,
 * which has no providers.
 */
export function StatusPage({
  icon: Icon,
  eyebrow,
  title,
  body,
  children,
  note,
  role,
}: StatusPageProps) {
  return (
    <div className="container-page grid min-h-[calc(100svh-var(--bar-h))] place-items-center py-12 max-md:min-h-[calc(100svh-var(--bar-h)*2-var(--bar-lift))]">
      <div
        role={role}
        className="flex w-full max-w-md animate-rise flex-col items-center pb-[8vh] text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full border bg-secondary text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        {eyebrow && (
          <p className="mt-6 text-xs font-semibold tracking-[0.14em] text-muted-foreground tabular-nums">
            {eyebrow}
          </p>
        )}
        <h1
          className={`font-display text-3xl leading-tight font-medium text-balance ${eyebrow ? "mt-2" : "mt-6"}`}
        >
          {title}
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-pretty text-muted-foreground">
          {body}
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
          {children}
        </div>
        {note && <p className="mt-6 text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}
