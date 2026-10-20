"use client";

import { useMemo, useRef, useState } from "react";

import { useLocale, useT } from "@/i18n/client";
import {
  fitMargins,
  inUnit,
  marginLimits,
  marginStep,
  papers,
  pxPerInch,
  type Margins,
  type PageSetup,
  type PaperSize,
} from "../pagination/geometry";

type Side = "left" | "right";

/**
 * The ruler above Print Layout's sheet, in the manner of a word processor's
 * (PS-1B.2B.1, the owner's request). It is drawn at the paper's own scale,
 * 96 CSS pixels to the inch (the unit the browser prints with), and scales
 * with the sheet, so its marks match the printed page exactly. Inches are
 * counted from the left margin, as word processors do, and metric paper is
 * marked in centimetres.
 *
 * Each side margin is the edge between the grey margin and the white text
 * area: drag it, or focus it and use the arrow keys (an eighth of an inch,
 * or 2.5 mm, a step; Home and End go to the limits). While it moves, a guide
 * runs down the page and the margin is shown; the pages follow at most once
 * a frame (`onChange`), and the value settled on is remembered (`onCommit`).
 * It is outside the editor and never touches the document.
 */
export function MarginRuler({
  setup,
  onChange,
  onCommit,
}: {
  setup: PageSetup;
  onChange: (margins: Margins) => void;
  onCommit: (margins: Margins) => void;
}) {
  const t = useT("editorLab").print;
  const locale = useLocale();
  const ruler = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  // The margin being dragged, drawn at once; `latest` is the same, for the handlers between renders.
  const latest = useRef(setup.margins);
  const [dragging, setDragging] = useState<Side | null>(null);
  const [draft, setDraft] = useState<Margins | null>(null);

  const { size } = setup;
  const margins = draft ?? setup.margins;
  const paper = papers[size];
  const step = marginStep(size);
  const format = (px: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(inUnit(size, px));
  const marks = useMemo(() => rulerMarks(size, margins.left), [size, margins.left]);

  const withSide = (base: Margins, side: Side, value: number) =>
    fitMargins(size, { ...base, [side]: Math.round(value / step) * step });

  /** Shows the new margin now and sends it to the pages in the next frame. */
  const move = (next: Margins) => {
    latest.current = next;
    setDraft(next);
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      onChange(latest.current);
    });
  };

  const xOf = (clientX: number) => {
    const box = ruler.current!.getBoundingClientRect();
    const scale = box.width / (ruler.current!.offsetWidth || 1) || 1;
    return (clientX - box.left) / scale;
  };

  const edge = (side: Side) => {
    const value = margins[side];
    const other = side === "left" ? margins.right : margins.left;
    const max = paper.width - other - marginLimits.minText;
    const x = side === "left" ? value : paper.width - value;
    const label = side === "left" ? t.leftMargin : t.rightMargin;
    const text = t.marginValue(format(value), paper.unit);
    return (
      <div
        key={side}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemin={inUnit(size, marginLimits.minSide)}
        aria-valuemax={inUnit(size, max)}
        aria-valuenow={inUnit(size, value)}
        aria-valuetext={text}
        title={`${label}: ${text}`}
        data-testid={`lab-margin-${side}`}
        data-side={side}
        data-active={dragging === side ? "true" : undefined}
        className="lab-margin-edge"
        style={{ left: x }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          latest.current = setup.margins;
          setDragging(side);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const pointer = xOf(event.clientX);
          move(withSide(latest.current, side, side === "left" ? pointer : paper.width - pointer));
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (frame.current) cancelAnimationFrame(frame.current);
          frame.current = 0;
          setDragging(null);
          setDraft(null);
          onChange(latest.current);
          onCommit(latest.current);
        }}
        onKeyDown={(event) => {
          const now = setup.margins[side];
          const next =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? now + step
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? now - step
                : event.key === "Home"
                  ? marginLimits.minSide
                  : event.key === "End"
                    ? max
                    : null;
          if (next === null) return;
          event.preventDefault();
          const settled = withSide(setup.margins, side, next);
          onChange(settled);
          onCommit(settled);
        }}
      >
        {dragging === side && (
          <>
            <span className="lab-margin-guide" aria-hidden />
            <span className="lab-margin-value" aria-hidden>
              {text}
            </span>
          </>
        )}
      </div>
    );
  };

  return (
    <div
      ref={ruler}
      className="lab-ruler"
      role="group"
      aria-label={t.margins}
      data-testid="lab-ruler"
      style={{ width: paper.width }}
    >
      <div className="lab-ruler-margin" style={{ left: 0, width: margins.left }} aria-hidden />
      <div className="lab-ruler-margin" style={{ right: 0, width: margins.right }} aria-hidden />
      <svg
        className="lab-ruler-marks"
        width={paper.width}
        height={24}
        viewBox={`0 0 ${paper.width} 24`}
        aria-hidden
      >
        {marks.map((mark) => (
          <g key={mark.x}>
            <line
              x1={mark.x}
              x2={mark.x}
              y1={24 - mark.length}
              y2={24}
              className="lab-ruler-tick"
            />
            {mark.label !== null && (
              <text x={mark.x} y={11} textAnchor="middle" className="lab-ruler-number">
                {mark.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {edge("left")}
      {edge("right")}
    </div>
  );
}

type Mark = { x: number; length: number; label: string | null };

/**
 * The marks of the ruler for one paper, counted from the left margin:
 * inches in eighths (a number each inch, a longer mark each half), or
 * centimetres in quarters (a number each centimetre).
 */
export function rulerMarks(size: PaperSize, origin: number): Mark[] {
  const paper = papers[size];
  const unit = paper.unit === "in" ? pxPerInch : pxPerInch / 2.54;
  const parts = paper.unit === "in" ? 8 : 4;
  const marks: Mark[] = [];
  const first = Math.ceil((-origin / unit) * parts);
  const last = Math.floor(((paper.width - origin) / unit) * parts);
  for (let index = first; index <= last; index += 1) {
    const x = origin + (index / parts) * unit;
    const whole = index % parts === 0;
    const half = index % (parts / 2) === 0;
    const quarter = parts === 8 && index % 2 === 0;
    marks.push({
      x: Math.round(x * 100) / 100,
      // A whole unit shows its number instead of a mark; the margin's own place is marked.
      length: whole ? (index === 0 ? 7 : 0) : half ? 6 : quarter ? 4 : 3,
      label: whole && index !== 0 ? String(Math.abs(index / parts)) : null,
    });
  }
  return marks;
}
