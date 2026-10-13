"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { projectDrop, type Drop, type ListedPoint } from "../editor/drop";
import { subtreeIds, type TreeRow } from "../tree";

/** A drag under way: which point, and where it would land if let go now. */
export type Dragging = {
  id: string;
  drop: Drop;
  /** Where the drop line is drawn, in pixels from the top of the list. */
  top: number;
};

/** How far the pointer must travel before a press on the grip becomes a drag. */
const threshold = 4;
/** How near the top or foot of the window the pointer scrolls the page, and how fast. */
const edge = 72;
const scrollSpeed = 14;

/** The width of one level of indentation, which the list's own CSS also sets (`--outline-step`). */
export const indentStep = () => (window.matchMedia?.("(min-width: 40rem)").matches ? 28 : 16);

type Options = {
  /** The list the points are drawn in; each point's element carries `data-entry-id`. */
  list: React.RefObject<HTMLElement | null>;
  rows: readonly TreeRow[];
  /** The points on screen, in order. */
  listed: readonly ListedPoint[];
  onDrop: (id: string, drop: Drop) => void;
};

/**
 * Dragging a point by its grip, with a mouse, a pen, or a finger. Pointer
 * Events and nothing else: the grip takes the pointer when pressed
 * (`touch-action: none` on it keeps a finger from scrolling the page
 * instead), the list is read as the pointer moves, and `projectDrop` says
 * where the point would go. Nothing moves until the pointer is let go; Escape,
 * or a cancelled touch, leaves everything where it was.
 *
 * Dragging is one way to move a point and never the only one: the row menu and
 * the keyboard do the same through the same `planMove`.
 */
export function useOutlineDrag({ list, rows, listed, onDrop }: Options) {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  // What the handlers read: the latest of each, without being made again.
  const latest = useRef({ rows, listed, onDrop });
  useEffect(() => {
    latest.current = { rows, listed, onDrop };
  });
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const start = useCallback(
    (id: string, event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || stop.current) return;
      const grip = event.currentTarget;
      const pointerId = event.pointerId;
      const origin = { x: event.clientX, y: event.clientY };
      const startDepth = latest.current.listed.find((point) => point.id === id)?.depth ?? 0;
      let active = false;
      let last: Dragging | null = null;
      let pointer = origin;
      let frame = 0;
      event.preventDefault();
      grip.setPointerCapture?.(pointerId);

      const measure = () => {
        const container = list.current;
        if (!container) return;
        const { rows: allRows, listed: allListed } = latest.current;
        const moving = new Set(subtreeIds(allRows, id));
        const others = allListed.filter((point) => !moving.has(point.id));
        const bounds = container.getBoundingClientRect();
        const boxes = others.map((point) =>
          container
            .querySelector<HTMLElement>(`[data-entry-id="${point.id}"]`)
            ?.getBoundingClientRect(),
        );
        // The gap is after every point whose middle the pointer has passed.
        const gap = boxes.filter((box) => box && pointer.y > box.top + box.height / 2).length;
        const next = boxes[gap];
        const previous = boxes[gap - 1];
        const top = next ? next.top - bounds.top : previous ? previous.bottom - bounds.top : 0;
        const wanted = startDepth + Math.round((pointer.x - origin.x) / indentStep());
        last = { id, drop: projectDrop(allRows, others, id, gap, wanted), top };
        setDragging(last);
      };

      const tick = () => {
        frame = 0;
        if (!active) return;
        const height = window.innerHeight;
        if (pointer.y < edge) window.scrollBy(0, -scrollSpeed);
        else if (pointer.y > height - edge) window.scrollBy(0, scrollSpeed);
        measure();
        // Keep scrolling while the pointer rests at an edge.
        if (pointer.y < edge || pointer.y > height - edge) frame = requestAnimationFrame(tick);
      };

      const onMove = (moved: PointerEvent) => {
        if (moved.pointerId !== pointerId) return;
        pointer = { x: moved.clientX, y: moved.clientY };
        if (!active) {
          if (Math.hypot(pointer.x - origin.x, pointer.y - origin.y) < threshold) return;
          active = true;
        }
        moved.preventDefault();
        if (!frame) frame = requestAnimationFrame(tick);
      };

      const finish = (commit: boolean) => {
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onUp);
        grip.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        if (frame) cancelAnimationFrame(frame);
        if (grip.hasPointerCapture?.(pointerId)) grip.releasePointerCapture(pointerId);
        stop.current = null;
        const landed = active && commit ? last : null;
        active = false;
        setDragging(null);
        if (landed) latest.current.onDrop(landed.id, landed.drop);
      };
      const onUp = (released: PointerEvent) => {
        if (released.pointerId !== pointerId) return;
        // The place is read once more where the pointer was let go.
        if (active) {
          pointer = { x: released.clientX, y: released.clientY };
          measure();
        }
        finish(true);
      };
      const onCancel = (cancelled: PointerEvent) => {
        if (cancelled.pointerId === pointerId) finish(false);
      };
      const onKey = (pressed: KeyboardEvent) => {
        if (pressed.key !== "Escape") return;
        pressed.preventDefault();
        pressed.stopPropagation();
        finish(false);
      };

      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onUp);
      grip.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
      stop.current = () => finish(false);
    },
    [list],
  );

  return { dragging, start };
}
