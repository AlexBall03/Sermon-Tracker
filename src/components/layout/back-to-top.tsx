"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";

type BackToTopProps = {
  /** The shell shows the small-screen tab bar, so the button sits above it there. */
  aboveTabBar?: boolean;
};

/**
 * A round floating button in the bottom corner that returns to the top of the
 * page. It appears once the page has scrolled a full screen, so short pages
 * never show it. It sits under the bar's layer, so an open sheet's scrim
 * covers it. While Scripture is selected in the Bible reader it steps aside:
 * the selection's toolbar rests in the same corner.
 */
export function BackToTop({ aboveTabBar = false }: BackToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight);
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
      aria-label="Back to top"
      inert={!visible}
      // Smoothness comes from `scroll-behavior` on <html>, so reduced motion is respected.
      onClick={() => window.scrollTo({ top: 0 })}
      className={cn(
        // On hover the rim and arrow turn emerald and the arrow rises; the button itself stays put.
        "group fixed right-5 bottom-5 z-40 grid size-11 place-items-center rounded-full glass-float text-muted-foreground transition-[opacity,translate,color,border-color] duration-200 hover:border-primary/70 hover:text-primary active:border-primary active:text-primary sm:right-8 sm:bottom-8",
        aboveTabBar && "max-md:bottom-[calc(var(--bar-h)+env(safe-area-inset-bottom)+1rem)]",
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
