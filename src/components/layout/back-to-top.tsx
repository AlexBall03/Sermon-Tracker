"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type BackToTopProps = {
  /** The shell shows the small-screen tab bar, so the button sits above it there. */
  aboveTabBar?: boolean;
};

/**
 * Whether the button is shown for a page scrolled to `scrollY`: once it has
 * scrolled a full screen, or, on a page too short for that, once it has
 * reached its foot. The position is held within the page, so a phone's
 * overscroll past either end never shows or hides it, and a page with less
 * than half a screen to scroll never shows it.
 */
export function backToTopVisible(scrollY: number, viewport: number, pageHeight: number) {
  const max = pageHeight - viewport;
  if (max < viewport / 2) return false;
  const position = Math.min(Math.max(scrollY, 0), max);
  return position >= Math.min(viewport, max - 1);
}

/**
 * A round floating button in the bottom corner that returns to the top of the
 * page, shown by `backToTopVisible`. It sits under the bar's layer, so an open sheet's scrim
 * covers it. While Scripture is selected in the Bible reader it steps aside:
 * the selection's toolbar rests in the same corner.
 */
export function BackToTop({ aboveTabBar = false }: BackToTopProps) {
  const [visible, setVisible] = useState(false);
  const t = useT("navigation").backToTop;

  useEffect(() => {
    const update = () =>
      setVisible(
        backToTopVisible(
          window.scrollY,
          window.innerHeight,
          document.documentElement.scrollHeight,
        ),
      );
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <button
      type="button"
      aria-label={t}
      inert={!visible}
      // Smoothness comes from `scroll-behavior` on <html>, so reduced motion is respected.
      onClick={() => window.scrollTo({ top: 0 })}
      className={cn(
        // On hover the rim and arrow turn emerald and the arrow rises; the button itself stays put.
        "group fixed right-5 bottom-5 z-40 grid size-11 place-items-center rounded-full glass-float text-muted-foreground transition-[opacity,translate,color,border-color] duration-200 hover:border-primary/70 hover:text-primary active:border-primary active:text-primary sm:right-8 sm:bottom-8",
        aboveTabBar && "max-md:bottom-[calc(var(--bar-h)+var(--bar-lift)+1rem)]",
        !visible && "pointer-events-none translate-y-2 opacity-0",
        "[body:has([data-selection-toolbar])_&]:invisible",
      )}
    >
      <ArrowUp
        className="size-5 transition-transform duration-200 ease-out group-hover:-translate-y-0.5"
        aria-hidden
      />
    </button>
  );
}
