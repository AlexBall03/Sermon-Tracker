import { Plus } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { appLinks, type AppLink } from "@/components/layout/app-links";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/*
 * The two frames every reconstruction of the application is drawn in: a
 * window with the application bar, and a phone with the bar and the tab bar.
 * They are pictures. Nothing in them is a link, a button, or a heading, and a
 * `Preview` hides the whole drawing from assistive technology and describes it
 * once instead.
 */

/**
 * One reconstruction: the drawing, which is for the eye only, and one
 * sentence saying what it shows. The drawing takes no pointer either, so the
 * application's own hover styles, copied with its classes, never fire here.
 */
export function Preview({
  description,
  className,
  children,
}: {
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={className}>
      <div aria-hidden className="pointer-events-none select-none">
        {children}
      </div>
      <figcaption className="sr-only">{description}</figcaption>
    </figure>
  );
}

/** A row's place among the rows that arrive with it, for `stagger`. */
export const place = (index: number) => ({ "--i": index }) as React.CSSProperties;

type FrameProps = {
  locale: Locale;
  /** The destination shown as current. */
  current: AppLink["id"];
  initials: string;
  className?: string;
  children: React.ReactNode;
};

const avatar =
  "grid shrink-0 place-items-center rounded-full border border-input bg-surface font-semibold text-muted-foreground shadow-card";

/**
 * A window of the application at desktop width: the bar with its four
 * destinations, the Capture control, and the account button, as `AppHeader`
 * draws them from `md` up.
 */
export function WindowFrame({ locale, current, initials, className, children }: FrameProps) {
  const t = dictionary(locale, "navigation");
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-background", className)}>
      <div className="flex h-14 items-center justify-between gap-8 border-b border-(--nav-border) bg-surface/60 px-6">
        <Logo />
        <div className="flex flex-1 items-center justify-between gap-6">
          <div className="flex items-center gap-0.5">
            {appLinks(t).map((link) => (
              <span
                key={link.id}
                className={cn(
                  "relative rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap",
                  link.id === current
                    ? "text-foreground after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground",
                )}
              >
                {link.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-input bg-surface pr-4 pl-3 text-sm font-semibold shadow-card">
              <Plus className="size-4 text-primary" />
              {t.capture}
            </span>
            <span className={cn(avatar, "size-9 text-xs")}>{initials}</span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/** The screen a phone's reconstruction is drawn on, before it is scaled into the frame. */
const screen = { width: 390, height: 800 };

/**
 * A phone showing the application below `md`: the bar with the logo and the
 * account button, the page, and the tab bar with capture in its centre. The
 * screen is drawn at a phone's real width and scaled as a whole, so type and
 * spacing keep the proportions they have on a phone.
 */
export function PhoneFrame({ locale, current, initials, className, children }: FrameProps) {
  const t = dictionary(locale, "navigation");
  const links = appLinks(t);
  const middle = Math.ceil(links.length / 2);
  const tab = ({ id, label, icon: Icon }: AppLink) => (
    <span
      key={id}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium",
        id === current ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </span>
  );
  return (
    <div
      className={cn(
        "w-fit rounded-[2.5rem] border border-input bg-surface-raised p-2 shadow-raised",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[2rem] border bg-background">
        <div
          className="flex [zoom:0.75] flex-col"
          style={{ width: screen.width, height: screen.height }}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-(--nav-border) bg-surface/60 px-5">
            <Logo />
            <span className={cn(avatar, "size-9 text-xs")}>{initials}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          <div className="flex h-14 shrink-0 items-stretch border-t border-(--nav-border) bg-surface/60 px-5">
            {links.slice(0, middle).map(tab)}
            <span className="flex flex-1 items-center justify-center">
              <span className="grid size-11 place-items-center rounded-full border border-input bg-surface shadow-card">
                <Plus className="size-5 text-primary" />
              </span>
            </span>
            {links.slice(middle).map(tab)}
          </div>
          {/* The home indicator, where the real tab bar leaves room for it. */}
          <div className="flex h-5 shrink-0 items-center justify-center bg-surface/60">
            <span className="h-1 w-28 rounded-full bg-foreground/25" />
          </div>
        </div>
      </div>
    </div>
  );
}
