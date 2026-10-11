/** Where and when a finger was. */
export type TouchPoint = { x: number; y: number; time: number };

/**
 * Reads a touch as a turn of the page, or as nothing.
 *
 * It is a turn only when it is plainly sideways: far enough to be meant, much
 * more across than up or down (so scrolling the chapter is never taken for
 * one), and quick (so a finger resting or dragging slowly is not either).
 * Towards the left is the next chapter, as a page is turned; towards the
 * right is the one before.
 */
export function swipeDirection(start: TouchPoint, end: TouchPoint): 1 | -1 | null {
  const across = end.x - start.x;
  const along = end.y - start.y;
  if (Math.abs(across) < 64) return null;
  if (Math.abs(across) < Math.abs(along) * 2.2) return null;
  if (end.time - start.time > 650) return null;
  return across < 0 ? 1 : -1;
}
