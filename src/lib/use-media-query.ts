"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current as the window changes. False on
 * the server and until hydration, so use it for things that appear on
 * interaction (which surface a preview opens in), not for first-paint layout.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia?.(query);
      media?.addEventListener("change", notify);
      return () => media?.removeEventListener("change", notify);
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

/** Room for a popover beside its trigger, or a panel beside the page. */
export const wideEnough = "(min-width: 48rem)";
