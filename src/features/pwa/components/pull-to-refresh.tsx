"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, LoaderCircle } from "lucide-react";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { isStandalone } from "../standalone";

/** How far the finger must travel, after resistance, before letting go refreshes. */
export const pullThreshold = 72;
/** The furthest the indicator follows the finger. */
const pullMax = 112;
/** The finger travels twice as far as the indicator: a pull that feels held back. */
const resistance = 0.5;
/** How long the page takes to glide back, as `html[data-pull="settling"] #main` in globals.css. */
const settleMs = 300;

/** How far the indicator has come for a finger that has moved `distance` down. */
export function pullDistance(distance: number) {
  return Math.max(0, Math.min(pullMax, distance * resistance));
}

/** True when the touch began inside something that scrolls by itself and is not at its top. */
function insideScrolled(target: EventTarget | null) {
  for (
    let node = target as HTMLElement | null;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (node.scrollTop > 0) return true;
  }
  return false;
}

/** A dialog, a sheet, or a menu is open: the pull is theirs, not the page's. */
const layerOpen = () =>
  document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;

/**
 * Pull to refresh, in the installed application only: a browser tab has its
 * own. Pulling down from the top of the page brings a small round indicator
 * out from under the bar, its ring filling as it comes. The installed app has
 * no vibration to say the pull has gone far enough, so it is shown instead: the
 * ring turns emerald, the arrow turns over, the indicator grows a little, and
 * the words change. The page comes down with it (the window's own bounce is
 * off in the installed app) and stays under it until the refresh is done.
 * Letting go then asks the server for the page again
 * (`router.refresh`), which keeps everything in the page as it is, half-typed
 * words included; letting go short of it puts the indicator away.
 */
export function PullToRefresh() {
  const t = useT("pwa").refresh;
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const start = useRef<{ x: number; y: number } | null>(null);
  const current = useRef(0);

  useEffect(() => {
    if (!isStandalone()) return;

    const reset = () => {
      start.current = null;
      current.current = 0;
      setDragging(false);
      setPull(0);
    };
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || window.scrollY > 0) return;
      if (layerOpen() || insideScrolled(event.target)) return;
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onMove = (event: TouchEvent) => {
      const from = start.current;
      if (!from) return;
      const dx = event.touches[0].clientX - from.x;
      const dy = event.touches[0].clientY - from.y;
      // A sideways swipe, or a scroll back up the page, is not a pull.
      if (current.current === 0 && (Math.abs(dx) > Math.abs(dy) || dy < 0)) {
        if (Math.abs(dx) > 8 || dy < -8) start.current = null;
        return;
      }
      if (window.scrollY > 0) return reset();
      current.current = pullDistance(dy);
      setDragging(true);
      setPull(current.current);
    };
    const onEnd = () => {
      if (!start.current) return;
      const armed = current.current >= pullThreshold;
      reset();
      if (armed) startRefresh(() => router.refresh());
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, [router]);

  const armed = pull >= pullThreshold;
  const shown = refreshing || pull > 0;
  // Where the indicator rests while the page is fetched again.
  const offset = refreshing ? pullThreshold * 0.75 : pull;

  // The page follows the indicator down, is held there while it is fetched
  // again, and glides back (`html[data-pull]` in globals.css).
  useEffect(() => {
    const root = document.documentElement;
    if (shown) {
      root.dataset.pull = dragging ? "dragging" : "settling";
      root.style.setProperty("--pull", `${offset}px`);
      return;
    }
    if (!root.dataset.pull) return;
    root.dataset.pull = "settling";
    root.style.setProperty("--pull", "0px");
    const done = window.setTimeout(() => {
      delete root.dataset.pull;
      root.style.removeProperty("--pull");
    }, settleMs);
    return () => window.clearTimeout(done);
  }, [shown, dragging, offset]);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.pull;
      document.documentElement.style.removeProperty("--pull");
    },
    [],
  );
  const progress = refreshing ? 1 : Math.min(1, pull / pullThreshold);
  const label = refreshing ? t.refreshing : armed ? t.release : t.pull;
  const ring = 2 * Math.PI * 17;

  return (
    <div
      aria-hidden={!shown}
      className="pointer-events-none fixed inset-x-0 top-bar z-40 flex justify-center"
    >
      <div
        className={cn(
          "flex flex-col items-center gap-1.5",
          // Following the finger is never animated; coming back and going away are.
          !dragging &&
            "transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-opacity",
        )}
        style={{
          translate: `0 ${offset - 48}px`,
          opacity: shown ? Math.max(progress, 0.35) : 0,
        }}
      >
        <div
          className={cn(
            "relative grid size-10 place-items-center rounded-full glass-float text-muted-foreground",
            "transition-[scale,color] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] motion-reduce:transition-colors",
            (armed || refreshing) && "scale-110 text-primary",
          )}
        >
          <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden>
            <circle
              cx="20"
              cy="20"
              r="17"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              className={cn(
                "transition-[stroke] duration-200",
                armed || refreshing ? "stroke-primary" : "stroke-muted-foreground/50",
              )}
              strokeDasharray={ring}
              strokeDashoffset={ring * (1 - progress)}
            />
          </svg>
          {refreshing ? (
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <ArrowDown
              className={cn(
                "size-4 transition-transform duration-200 motion-reduce:transition-none",
                armed && "rotate-180",
              )}
              aria-hidden
            />
          )}
        </div>
        <span
          className={cn(
            "rounded-full glass-float px-2.5 py-0.5 text-xs font-medium transition-colors duration-200",
            armed || refreshing ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {refreshing ? t.refreshing : armed ? t.release : ""}
      </span>
    </div>
  );
}
