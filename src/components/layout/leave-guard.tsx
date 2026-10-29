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
import { useT } from "@/i18n/client";
import { holdUnsavedWork, releaseUnsavedWork } from "@/lib/unsaved-work";

type Pending = { to: "link"; href: string } | { to: "back" } | { to: "forward" };

/** Marks the history entry the guards add, so it is added once per page. Its value is a token. */
const guardKey = "__leaveGuard";

// Next replaces `history.pushState` on the instance to keep its router in
// step. The guard's entry is the same URL and must not look like navigation,
// so it goes through the browser's own method.
const pushEntry = (state: unknown) =>
  History.prototype.pushState.call(window.history, state, "", window.location.href);

const here = () => window.location.pathname + window.location.search;

/*
 * The guards' one history entry, shared by every guard on the page. It exists
 * while any of them holds unsaved work, and is taken away again once none
 * does, so a page that was briefly unsaved (an editor saving as it goes)
 * leaves no extra entry behind for Back to stumble on.
 *
 * It is taken away only when it is certainly the guards' own and on top: the
 * current entry carries the token it was made with, at the address it was
 * made for. Only then is `history.back()` called, and the `popstate` that
 * answers is kept from the router only while it lands on that same address
 * (the page's own entry, beneath the guards'). Nothing is taken away when a
 * guard unmounts (the page may be on its way somewhere), after leaving was
 * agreed, or while another guard on the page still holds work.
 */
const holding = new Set<object>();
let entry: { token: string; at: string } | null = null;
/** How long a removal's own `popstate` is waited for; a later one is the person's, never swallowed. */
const removalAnswerMs = 1000;

const tokenOf = (state: unknown) =>
  typeof state === "object" && state !== null && guardKey in state
    ? (state as Record<string, unknown>)[guardKey]
    : undefined;

/** A guard now holds unsaved work: the page gets its entry, once. */
function claimEntry(guard: object) {
  holding.add(guard);
  const state: unknown = window.history.state;
  const current = tokenOf(state);
  if (current !== undefined) {
    // Already marked (an earlier guard of this page): it stays the page's entry.
    if (typeof current === "string") entry = { token: current, at: here() };
    return;
  }
  const token = crypto.randomUUID();
  pushEntry({ ...(state as object | null), [guardKey]: token });
  entry = { token, at: here() };
}

/** A guard holds no unsaved work any more (on the page, never by unmounting). */
function releaseEntry(guard: object) {
  holding.delete(guard);
  if (holding.size > 0 || !entry) return;
  const { token, at } = entry;
  entry = null;
  // Only the guards' own entry, still on top, at the address it was made for.
  if (tokenOf(window.history.state) !== token || here() !== at) return;
  const swallow = (event: PopStateEvent) => {
    stop();
    // Landed on the page's own entry: the same page, which the router must not reload.
    if (here() === at && tokenOf(window.history.state) === undefined) {
      event.stopImmediatePropagation();
    }
  };
  const timer = window.setTimeout(() => stop(), removalAnswerMs);
  function stop() {
    window.clearTimeout(timer);
    window.removeEventListener("popstate", swallow, true);
  }
  window.addEventListener("popstate", swallow, true);
  window.history.back();
}

/** A guard goes away (its page unmounting): it holds nothing, and no history is touched. */
function forgetGuard(guard: object) {
  holding.delete(guard);
}

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
 * reversible the guard adds one history entry for the same page, and takes it
 * away again once the work is saved (`releaseEntry` above), so Back after a
 * save leaves the page at the first press.
 *
 * `onLeave` runs when leaving is confirmed in our dialog and must throw the
 * unsaved work away. (The browser's own warning gives no such moment, but it
 * unloads the page, which loses the work anyway.)
 *
 * Code that navigates on purpose (after a delete, say) must clear `dirty`
 * first or call `allowLeaving()`. Render the returned element once.
 */
export function useLeaveGuard(dirty: boolean, description: string, onLeave?: () => void) {
  const t = useT("navigation").leave;
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  // True once leaving has been agreed, so the guard does not catch its own navigation.
  const leaving = useRef(false);
  // True while a history move made by the guard itself is in flight.
  const restoring = useRef(false);

  // This guard, for the page's shared history entry.
  const [self] = useState(() => ({}));
  const wasDirty = useRef(false);

  const allowLeaving = useCallback(() => {
    leaving.current = true;
  }, []);

  // The entry is taken away when the work stops being unsaved while the page stays: an
  // effect on that change, never a cleanup (a cleanup also runs as the page goes away).
  useEffect(() => {
    if (dirty) {
      wasDirty.current = true;
      return;
    }
    if (!wasDirty.current) return;
    wasDirty.current = false;
    if (leaving.current) forgetGuard(self);
    else releaseEntry(self);
  }, [dirty, self]);
  useEffect(() => () => forgetGuard(self), [self]);

  // Said apart from the effect below, which also guards history: an update of the
  // application asks this before it reloads (lib/unsaved-work.ts).
  useEffect(() => {
    if (!dirty) return;
    const key = {};
    holdUnsavedWork(key);
    return () => releaseUnsavedWork(key);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    leaving.current = false;
    const guarded = here();
    claimEntry(self);

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
        holding.delete(self);
        claimEntry(self);
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
  }, [dirty, self]);

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
          <AlertDialogTitle>{t.title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.stay}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={leave}>
            {t.leave}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { dialog, allowLeaving };
}
