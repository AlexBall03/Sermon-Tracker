"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { LayoutGrid, List } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  applyLibraryView,
  libraryViewScript,
  readLibraryView,
  storeLibraryView,
  subscribeLibraryView,
  type LibraryView,
} from "./library-view";

const options = [
  { value: "cards", label: "Cards", icon: LayoutGrid },
  { value: "list", label: "List", icon: List },
] as const satisfies readonly { value: LibraryView; label: string; icon: unknown }[];

/**
 * Applies the stored view before the first paint. As with the splash, the
 * script only means anything in the server's HTML; in the browser React never
 * runs a script it renders, so there it is marked as inert data and the
 * switcher's layout effect does the same job.
 */
export function LibraryViewScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: libraryViewScript }}
    />
  );
}

/**
 * Cards or list. The choice is remembered in this browser and changes only
 * how the results are drawn: the search, filters, order, and page stay as
 * they are, and nothing is fetched.
 */
export function ViewSwitcher({ className }: { className?: string }) {
  // Unknown on the server, so nothing is marked checked until after hydration.
  const current = useSyncExternalStore(subscribeLibraryView, readLibraryView, () => null);

  // Arriving from another page loads no HTML, so the inline script did not run.
  useLayoutEffect(() => applyLibraryView(), []);

  function choose(view: LibraryView) {
    if (view === current) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) return storeLibraryView(view);
    const transition = document.startViewTransition(() => flushSync(() => storeLibraryView(view)));
    // A transition the browser skips (a hidden tab, a second one starting) still
    // applies the change; only its animation is dropped, which is not an error.
    transition.ready.catch(() => {});
    transition.finished.catch(() => {});
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    const at = radios.indexOf(document.activeElement as HTMLElement);
    const next = radios[(at + step + radios.length) % radios.length];
    next.focus();
    next.click();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Library view"
      onKeyDown={onKeyDown}
      className={cn("inline-flex gap-0.5 rounded-lg bg-secondary p-0.5", className)}
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          aria-label={`${label} view`}
          title={`${label} view`}
          // Only the option in force is in the tab order; the arrows move between them.
          tabIndex={current === null || current === value ? 0 : -1}
          onClick={() => choose(value)}
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,box-shadow] duration-150 hover:text-foreground not-aria-checked:hover:bg-accent not-aria-checked:active:bg-foreground/10 aria-checked:cursor-default aria-checked:bg-surface-raised aria-checked:text-foreground aria-checked:shadow-card dark:aria-checked:bg-foreground/10 pointer-coarse:size-10"
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
