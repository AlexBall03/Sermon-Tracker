"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Pending = { to: "link"; href: string } | { to: "back" } | { to: "forward" };

/** Marks the history entry this guard adds, so it is added once per page. */
const guardKey = "__leaveGuard";

// Next replaces `history.pushState` on the instance to keep its router in
// step. The guard's entry is the same URL and must not look like navigation,
// so it goes through the browser's own method.
const pushEntry = (state: unknown) =>
  History.prototype.pushState.call(window.history, state, "", window.location.href);

const here = () => window.location.pathname + window.location.search;

/**
 * Asks before unsaved work is left behind, however the page is being left.
 * While `dirty` is true:
 *
 * - closing, reloading, or leaving the site shows the browser's own warning;
 * - a click on any link to another page of the app is held, and our dialog asks;
 * - the browser's Back and Forward buttons are undone, and our dialog asks.
 *
 * The router has no way to refuse a navigation, so links are caught as the
 * click begins and history moves are reversed after the fact. For Back to be
 * reversible the guard adds one history entry for the same page; after a
 * save, the first Back press therefore appears to do nothing.
 *
 * `onLeave` runs when leaving is confirmed in our dialog and must throw the
 * unsaved work away. (The browser's own warning gives no such moment, but it
 * unloads the page, which loses the work anyway.)
 *
 * Code that navigates on purpose (after a delete, say) must clear `dirty`
 * first or call `allowLeaving()`. Render the returned element once.
 */
export function useLeaveGuard(dirty: boolean, description: string, onLeave?: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  // True once leaving has been agreed, so the guard does not catch its own navigation.
  const leaving = useRef(false);
  // True while a history move made by the guard itself is in flight.
  const restoring = useRef(false);

  const allowLeaving = useCallback(() => {
    leaving.current = true;
  }, []);

  useEffect(() => {
    if (!dirty) return;
    leaving.current = false;
    const guarded = here();

    const state: unknown = window.history.state;
    const marked = typeof state === "object" && state !== null && guardKey in state;
    if (!marked) pushEntry({ ...(state as object | null), [guardKey]: true });

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };

    const onClick = (event: MouseEvent) => {
      if (leaving.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      // A new tab leaves this page as it is.
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      // Another site unloads the page, which the browser's warning covers.
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === guarded) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ to: "link", href: url.pathname + url.search + url.hash });
    };

    const onPopState = (event: PopStateEvent) => {
      if (leaving.current) return;
      // The router must not act on a move that is about to be undone.
      event.stopImmediatePropagation();
      if (restoring.current) {
        restoring.current = false;
        return;
      }
      if (here() === guarded) {
        // Back, onto the entry beneath the guard's: the same page. Put the guard's back.
        pushEntry({ ...(window.history.state as object | null), [guardKey]: true });
        setPending({ to: "back" });
      } else {
        // Forward, to another page. Return, and ask.
        restoring.current = true;
        window.history.go(-1);
        setPending({ to: "forward" });
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture, on the outermost targets: ahead of the router's own listeners.
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [dirty]);

  function leave() {
    const target = pending;
    setPending(null);
    if (!target) return;
    leaving.current = true;
    // Discard the work for real: the router keeps a page it has left, state and all,
    // and would otherwise show the abandoned edits again on return.
    onLeave?.();
    if (target.to === "link") router.push(target.href);
    // Past the guard's entry and the page's own.
    else if (target.to === "back") window.history.go(-2);
    else window.history.go(1);
  }

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay on this page</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={leave}>
            Leave without saving
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog, allowLeaving };
}
