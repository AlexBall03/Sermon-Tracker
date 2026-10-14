"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

import { startPwa } from "./pwa";

/**
 * Mounted once, in the root layout, and draws nothing. It starts the
 * installed application's listeners and the service worker (`pwa.ts`), and
 * keeps the browser's `theme-color` (the installed window's title bar, a
 * phone's status bar) on the page's own background when a theme was chosen
 * by hand, which the layout's media queries cannot know.
 */
export function PwaRuntime() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    startPwa();
  }, []);

  useEffect(() => {
    if (!resolvedTheme) return;
    // Read from the page once the theme's class is applied: the color is the token's.
    const frame = requestAnimationFrame(() => {
      const color = getComputedStyle(document.body).backgroundColor;
      if (!color) return;
      document
        .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute("content", color));
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return null;
}
