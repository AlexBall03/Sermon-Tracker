"use client";

import { useEffect, useRef, useState } from "react";

/** Matches `--animate-menu-out` in globals.css. */
const exitMs = 120;

/**
 * State for a small-screen navigation panel. Closing is a phase of its own so
 * the panel can animate out before it is removed: it stays mounted, inert,
 * for the length of its exit animation. A timer ends the phase rather than
 * `animationend`, which never fires if the panel is hidden mid-exit (for
 * example when the window is widened past the breakpoint). Escape closes the
 * panel and returns focus to the button.
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
  };
}
