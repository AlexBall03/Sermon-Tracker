"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationsRead } from "../actions";
import { pollMs, type NotificationItem, type NotificationSummary } from "../model";
import { NotificationList } from "./notification-list";

type State =
  | { phase: "loading" }
  | { phase: "error"; last?: NotificationSummary }
  | { phase: "ready"; data: NotificationSummary };

/**
 * The bar's bell: the unread count, and the latest few in a panel. It asks
 * again every minute while its tab is shown, when the tab is shown again, and
 * when the panel opens; there is no live connection.
 */
export function NotificationBell({ className }: { className?: string }) {
  const t = useT("notifications");
  const [state, setState] = useState<State>({ phase: "loading" });
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    // The bar draws a bell for each screen size; only the one on screen asks.
    if (trigger.current && trigger.current.getClientRects().length === 0) return;
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as NotificationSummary;
      setState({ phase: "ready", data });
    } catch {
      setState((current) => ({
        phase: "error",
        last:
          current.phase === "ready"
            ? current.data
            : current.phase === "error"
              ? current.last
              : undefined,
      }));
    }
  }, []);

  useEffect(() => {
    // The first ask waits a tick, so nothing is set while the bell mounts.
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, pollMs);
    const onShow = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [load]);

  const data =
    state.phase === "ready" ? state.data : state.phase === "error" ? state.last : undefined;
  const unread = data?.unread ?? 0;

  function opened(item: NotificationItem) {
    setOpen(false);
    if (item.read) return;
    setState((current) =>
      current.phase === "ready"
        ? {
            phase: "ready",
            data: {
              unread: Math.max(0, current.data.unread - 1),
              items: current.data.items.map((entry) =>
                entry.id === item.id ? { ...entry, read: true } : entry,
              ),
            },
          }
        : current,
    );
    void markNotificationsRead([item.id]).catch(() => undefined);
  }

  async function readAll() {
    await markAllNotificationsRead().catch(() => undefined);
    await load();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <PopoverTrigger
        ref={trigger}
        aria-label={unread > 0 ? t.bellUnread(unread) : t.bell}
        className={cn(
          "group/bell relative inline-grid size-9 place-items-center rounded-full border border-input bg-surface text-muted-foreground shadow-card transition-[border-color,box-shadow,color,scale] duration-200 ease-out hover:border-primary/70 hover:text-foreground active:scale-[0.96] data-popup-open:border-ring data-popup-open:text-foreground data-popup-open:shadow-focus pointer-coarse:size-10",
          className,
        )}
      >
        <Bell
          className="size-4 origin-top transition-transform duration-300 ease-out group-hover/bell:rotate-12 motion-reduce:transition-none"
          aria-hidden
        />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-semibold text-primary-foreground tabular-nums"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </PopoverTrigger>
      {/* Drops from the bell as the account menu does: a short slide with the fade and scale. */}
      <PopoverContent
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0 duration-200 data-[side=bottom]:slide-in-from-top-2 data-closed:slide-out-to-top-2"
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-semibold">{t.title}</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={readAll}
              className="rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors duration-150 hover:bg-primary/10 active:bg-primary/15"
            >
              {t.markAllRead}
            </button>
          )}
        </div>
        <div className="max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain">
          {state.phase === "loading" ? (
            <div role="status" className="space-y-2 p-4">
              <span className="sr-only">{t.title}</span>
              {[0, 1, 2].map((key) => (
                <div key={key} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : !data ? (
            <p role="alert" className="p-4 text-sm text-muted-foreground">
              {t.error}
            </p>
          ) : data.items.length === 0 ? (
            <p className="p-4 text-sm leading-relaxed text-muted-foreground">{t.empty}</p>
          ) : (
            <NotificationList items={data.items} onOpen={opened} compact />
          )}
        </div>
        <Link
          href={routes.notifications}
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-3 text-center text-sm font-medium text-primary transition-colors duration-150 hover:bg-accent hover:text-primary-hover active:bg-foreground/10"
        >
          {t.viewAll}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
