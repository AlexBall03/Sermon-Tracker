"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CloudOff, WifiOff } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { usePendingCaptures } from "./pending-captures";

/**
 * Whether this browser has dismissed the dashboard's note about working
 * offline: a preference of the browser, in `localStorage`, never a column.
 */
export const offlineNoticeKey = "offline-notice";

const listeners = new Set<() => void>();
let remembered = false;

function dismissed() {
  try {
    return window.localStorage.getItem(offlineNoticeKey) === "dismissed" || remembered;
  } catch {
    return remembered;
  }
}

function dismiss() {
  try {
    window.localStorage.setItem(offlineNoticeKey, "dismissed");
  } catch {
    // Storage refused: dismissed for this page's life.
  }
  remembered = true;
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/** For tests. */
export function resetOfflineNoticeForTests() {
  remembered = false;
}

/** Matches the collapse's duration below. */
const leaveMs = 300;

/**
 * The dashboard's word about working offline. Where captures are waiting on
 * this device it says so, with the way to them, until they are saved or
 * deleted: that is never dismissed, because those thoughts are nowhere else.
 * Otherwise it says once what works offline, until this browser dismisses
 * it. A card, not a layer; nothing is drawn on the server or before
 * hydration, so it never flashes.
 */
export function OfflineNotice({
  className,
  introduce = true,
}: {
  className?: string;
  /** False while another invitation (the tour) is open: the introduction waits for it. */
  introduce?: boolean;
}) {
  const t = useT("offline");
  const pending = usePendingCaptures();
  const gone = useSyncExternalStore(subscribe, dismissed, () => true);
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("gone"), leaveMs);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const waiting = Array.isArray(pending) ? pending.length : 0;
  if (waiting > 0) {
    return (
      <section
        aria-labelledby="offline-pending-title"
        className={cn(
          "lit-edge mt-8 animate-rise rounded-xl border bg-surface px-5 py-4 shadow-card sm:px-6",
          className,
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <CloudOff className="size-5 shrink-0 text-primary" aria-hidden />
            <h2 id="offline-pending-title" className="font-medium">
              {t.pending.count(waiting)}
            </h2>
          </div>
          <Link
            href={`${routes.settingsOffline}#offline-capture`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t.pending.review}
          </Link>
        </div>
      </section>
    );
  }

  if (!introduce || phase === "gone" || (gone && phase === "shown")) return null;

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
        phase === "shown" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="min-h-0">
        <section
          aria-labelledby="offline-notice-title"
          inert={phase !== "shown"}
          className="lit-edge mt-8 animate-rise rounded-xl border bg-surface px-5 py-5 shadow-card sm:px-6"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-4">
              <span
                aria-hidden
                className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border border-input bg-surface text-primary shadow-card"
              >
                <WifiOff className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 id="offline-notice-title" className="text-lg font-semibold tracking-[-0.015em]">
                  {t.notice.title}
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t.notice.body}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
              <Link href={routes.settingsOffline} className={buttonVariants()}>
                {t.notice.manage}
              </Link>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  setPhase("leaving");
                  dismiss();
                }}
              >
                {t.notice.dismiss}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
