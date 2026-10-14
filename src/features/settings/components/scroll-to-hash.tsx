"use client";

import { useEffect } from "react";

/** How long the target is kept in view while the page above it settles. */
const settleMs = 1500;

/**
 * Brings the part of the page the address points at (`/settings#install`,
 * `/settings#offline`) into view on arrival, from a notice elsewhere. The page
 * streams, and parts above the target fill in after it is drawn (the install
 * steps, what this device has downloaded), so the browser's own jump can land
 * before the target exists or be pushed away from it. So the target is
 * brought into view once drawn, and again whenever the page changes size
 * while it settles, until the person scrolls or touches the page themselves.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const bring = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    const frame = requestAnimationFrame(bring);
    const observer = new ResizeObserver(bring);
    observer.observe(document.body);

    const stop = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) {
        window.removeEventListener(type, stop);
      }
    };
    const timer = window.setTimeout(stop, settleMs);
    for (const type of ["wheel", "touchstart", "keydown", "pointerdown"]) {
      window.addEventListener(type, stop, { passive: true, once: true });
    }
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, []);
  return null;
}
