"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * Where the Appearance sheet sits on a small screen (A1-UI.2B.2): above the
 * on-screen keyboard and no taller than 60% of what is visible, so Apply and
 * Cancel stay in reach while a value is typed. Read from the visual viewport,
 * which shrinks for the keyboard where the layout viewport does not (iOS).
 * Given as CSS properties the sheet reads only below `lg`; a docked panel
 * ignores them.
 */
export function useSheetViewport(active: boolean): CSSProperties | undefined {
  const [box, setBox] = useState<{ bottom: number; height: number } | null>(null);
  useEffect(() => {
    const viewport = typeof window === "undefined" ? null : window.visualViewport;
    if (!active || !viewport) return;
    const update = () =>
      setBox({
        bottom: Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop),
        height: viewport.height,
      });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [active]);
  if (!active || !box) return undefined;
  return {
    "--sheet-bottom": `${Math.round(box.bottom)}px`,
    "--sheet-max": `${Math.round(box.height * 0.6)}px`,
  } as CSSProperties;
}
