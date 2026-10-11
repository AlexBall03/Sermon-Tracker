/**
 * Moves the page to a position in one continuous ease, frame by frame.
 *
 * The browser's own smooth scrolling is not used for this: started while a
 * menu is closing, it was seen to jump, stand still for a moment, and then
 * go, which reads as a stutter. Here every frame is set by hand, so the
 * motion is the same each time, its end is known exactly (`onArrive`), and
 * the reader's own wheel, touch, or key takes over at once.
 *
 * Returns a function that stops it. `onArrive` is called once, when the page
 * is there or the reader has taken over; never after it has been stopped.
 */
export function glideTo(top: number, onArrive: () => void): () => void {
  const limit = document.documentElement.scrollHeight - window.innerHeight;
  const to = Math.max(0, Math.min(top, Math.max(0, limit)));
  const from = window.scrollY;
  const distance = to - from;
  // Longer for further, within limits: a short hop is brisk and a long one is not a blur.
  const duration = Math.min(900, Math.max(320, Math.abs(distance) * 0.45));
  const interruptions = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

  let frame = 0;
  let over = false;
  const finish = (arrived: boolean) => {
    if (over) return;
    over = true;
    cancelAnimationFrame(frame);
    for (const type of interruptions) window.removeEventListener(type, yieldToReader);
    if (arrived) onArrive();
  };
  // The reader moved the page themselves: leave it where they put it.
  function yieldToReader() {
    finish(true);
  }

  if (Math.abs(distance) < 2) {
    finish(true);
    return () => finish(false);
  }

  for (const type of interruptions) window.addEventListener(type, yieldToReader, { passive: true });
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    // Ease in and out: it gathers pace, and settles.
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    // `instant`, because the page's own `scroll-behavior: smooth` would ease each step again.
    window.scrollTo({ top: from + distance * eased, behavior: "instant" });
    if (progress < 1) frame = requestAnimationFrame(step);
    else finish(true);
  };
  frame = requestAnimationFrame(step);
  return () => finish(false);
}
