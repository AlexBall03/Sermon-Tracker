"use client";

import { useEffect, useRef, useState } from "react";

/** Matches `--animate-menu-out` in globals.css. */
const exitMs = 140;

/** Tailwind's `md`, where the panel's wrapper becomes `md:hidden`. */
const wideQuery = "(min-width: 48rem)";

/** A row's place in the panel's entrance stagger (see `--animate-menu-row` in globals.css). */
export const row = (index: number) => ({ "--i": index }) as React.CSSProperties;

/**
 * State for a small-screen navigation panel. Closing is a phase of its own so
 * the panel can animate out before it is removed: it stays mounted, inert,
 * for the length of its exit animation. A timer ends the phase rather than
 * `animationend`, which never fires if the panel is hidden mid-exit. Escape
 * closes the panel and returns focus to the button. Widening the window past
 * the breakpoint removes the panel at once: hidden but still mounted, it
 * would keep the bar opaque.
 */
export function useNavPanel() {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = phase === "open";

  useEffect(() => {
    if (phase !== "open") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPhase("closing");
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") return;
    const timer = setTimeout(() => setPhase("closed"), exitMs);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase === "closed") return;
    const wide = window.matchMedia(wideQuery);
    function onChange(event: MediaQueryListEvent) {
      if (event.matches) setPhase("closed");
    }
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [phase]);

  return {
    open,
    /** True while the panel is in the document, including while it animates out. */
    mounted: phase !== "closed",
    buttonRef,
    toggle: () => setPhase((value) => (value === "open" ? "closing" : "open")),
    close: () => setPhase((value) => (value === "open" ? "closing" : value)),
    /** Spread onto the panel element. The headers stay opaque while `data-nav-panel` exists. */
    panelProps: {
      "data-nav-panel": "",
      inert: phase === "closing",
      className: phase === "closing" ? "animate-menu-out" : "animate-menu",
    },
    /** Spread onto the layer that dims the page behind the panel. Tapping it closes the panel. */
    scrimProps: {
      "aria-hidden": true,
      onClick: () => setPhase((value) => (value === "open" ? "closing" : value)),
      className: phase === "closing" ? "pointer-events-none animate-scrim-out" : "animate-scrim",
    },
  };
}
