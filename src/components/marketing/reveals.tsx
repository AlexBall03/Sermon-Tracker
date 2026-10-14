"use client";

import { useEffect } from "react";

/**
 * Turns on the landing page's entrances. Everything marked `reveal`
 * (globals.css) fades and rises once, the first time it comes into view, and
 * the rows inside a reconstruction (`stagger`) follow it in.
 *
 * The page is whole without this: nothing is hidden until the script has
 * run, what is already on screen then is never hidden at all, and with
 * reduced motion it does nothing.
 */
export function Reveals() {
  useEffect(() => {
    // Without the means to see what is in view, nothing is hidden to begin with.
    if (!("IntersectionObserver" in window) || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    const show = (target: HTMLElement) => target.setAttribute("data-shown", "");

    // What is on screen now stays as it is: only what is still below arrives.
    for (const target of targets) {
      if (target.getBoundingClientRect().top < window.innerHeight) show(target);
    }
    root.dataset.reveal = "on";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      // A little way in, so the movement is seen and not finished at the window's edge.
      { rootMargin: "0px 0px -6% 0px" },
    );
    for (const target of targets) {
      if (!target.hasAttribute("data-shown")) observer.observe(target);
    }
    return () => {
      observer.disconnect();
      delete root.dataset.reveal;
    };
  }, []);

  return null;
}
