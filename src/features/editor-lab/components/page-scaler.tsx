"use client";

import { useLayoutEffect, useRef } from "react";

import type { LayoutMode } from "../pagination/plugin";

/**
 * Print Layout's sheets, scaled to fit the space they are given (PS-1B.1
 * §C.9). The sheet is always laid out at the paper's width, so a narrower
 * window or a panel beside it shrinks the picture and never paginates again.
 * The scale is a transform, which changes no layout (CSS `zoom` could change
 * where lines wrap). It follows its size with a ResizeObserver and renders
 * nothing on a keystroke. In Regular Layout it is a plain wrapper.
 */
export function PageScaler({
  layout,
  pageWidth,
  children,
}: {
  layout: LayoutMode;
  pageWidth: number;
  children: React.ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = outer.current;
    const sheet = inner.current;
    if (!box || !sheet) return;
    const clear = () => {
      sheet.style.width = "";
      sheet.style.transform = "";
      sheet.style.marginInline = "";
      box.style.height = "";
      delete sheet.dataset.scale;
    };
    if (layout !== "print") {
      clear();
      return;
    }
    const fit = () => {
      const scale = Math.min(1, box.clientWidth / pageWidth);
      sheet.style.width = `${pageWidth}px`;
      sheet.style.transform = scale < 1 ? `scale(${scale})` : "";
      sheet.style.marginInline = scale < 1 ? "0" : "auto";
      sheet.dataset.scale = String(scale);
      // A transform leaves the layout box at full size: the box takes the scaled height instead.
      box.style.height = scale < 1 ? `${sheet.offsetHeight * scale}px` : "";
    };
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    observer.observe(sheet);
    fit();
    return () => {
      observer.disconnect();
      clear();
    };
  }, [layout, pageWidth]);

  return (
    <div ref={outer} className="lab-scaler" data-layout={layout}>
      <div ref={inner} className="lab-sheet-column" data-testid="lab-sheet-column">
        {children}
      </div>
    </div>
  );
}
