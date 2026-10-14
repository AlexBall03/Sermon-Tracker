"use client";

import { useEffect, useRef } from "react";

const scrolls = (value: string) => value === "auto" || value === "scroll";

/**
 * Whether a finger moving by `dx`, `dy` from `target` would scroll something
 * that can still scroll that way: a list, the form's body, a text box. Only
 * then is the move left to the browser.
 */
export function canScrollWithin(target: EventTarget | null, dx: number, dy: number): boolean {
  const vertical = Math.abs(dy) >= Math.abs(dx);
  for (
    let node = target as Element | null;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (!(node instanceof HTMLElement)) continue;
    const style = getComputedStyle(node);
    if (vertical && scrolls(style.overflowY) && node.scrollHeight > node.clientHeight) {
      const atTop = node.scrollTop <= 0;
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
      if ((dy > 0 && !atTop) || (dy < 0 && !atBottom)) return true;
    }
    if (!vertical && scrolls(style.overflowX) && node.scrollWidth > node.clientWidth) {
      const atStart = node.scrollLeft <= 0;
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
      if ((dx > 0 && !atStart) || (dx < 0 && !atEnd)) return true;
    }
  }
  return false;
}

/**
 * Rendered inside every dialog, and draws nothing. Two things a phone does
 * that the dialog's own scroll lock (an `overflow` style, which Safari on iOS
 * does not honour for a finger) cannot stop:
 *
 * - A drag on the dialog scrolls the page behind it. While the dialog is open
 *   a drag is let through only where it scrolls something inside that can
 *   still scroll that way; at the end of a list it stops there, instead of
 *   carrying on into the page.
 * - With the keyboard up, the browser pans what is visible, and a dialog
 *   fixed to the top of the page goes with it, partly out of sight. The
 *   dialog is given the visible area's top and height (`--vv-top`, `--vv-h`)
 *   so it stays inside what can be seen.
 */
export function DialogViewport() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const popup = marker.current?.closest<HTMLElement>('[data-slot="dialog-content"]');
    if (!popup) return;

    let start: { x: number; y: number } | null = null;
    const onStart = (event: TouchEvent) => {
      const [touch] = Array.from(event.touches);
      start = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onMove = (event: TouchEvent) => {
      const [touch] = Array.from(event.touches);
      if (!start || !touch || event.touches.length > 1 || !event.cancelable) return;
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!canScrollWithin(event.target, dx, dy)) event.preventDefault();
    };
    document.addEventListener("touchstart", onStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onMove, { passive: false, capture: true });

    const viewport = window.visualViewport;
    const follow = () => {
      if (!viewport) return;
      popup.style.setProperty("--vv-top", `${viewport.offsetTop}px`);
      popup.style.setProperty("--vv-h", `${viewport.height}px`);
    };
    follow();
    viewport?.addEventListener("resize", follow);
    viewport?.addEventListener("scroll", follow);

    return () => {
      document.removeEventListener("touchstart", onStart, { capture: true });
      document.removeEventListener("touchmove", onMove, { capture: true });
      viewport?.removeEventListener("resize", follow);
      viewport?.removeEventListener("scroll", follow);
    };
  }, []);

  return <span ref={marker} hidden />;
}
