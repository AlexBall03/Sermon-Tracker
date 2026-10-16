"use client";

import Link from "next/link";

import { useLocale, useT } from "@/i18n/client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { notificationHref, type NotificationItem } from "../model";

/** What a notification says, in the viewer's language. The subject is shown as text, never markup. */
export function useNotificationText() {
  const t = useT("notifications").kinds;
  const statuses = useT("support").statuses;
  return (item: NotificationItem) =>
    item.kind === "status"
      ? t.status(item.subject, item.status ? statuses[item.status] : "")
      : t[item.kind](item.subject);
}

/** The bell's panel and the page share these rows: unread ones carry a dot and stronger type. */
export function NotificationList({
  items,
  onOpen,
  compact = false,
}: {
  items: NotificationItem[];
  onOpen: (item: NotificationItem) => void;
  compact?: boolean;
}) {
  const t = useT("notifications");
  const locale = useLocale();
  const text = useNotificationText();
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={notificationHref(item.kind, item.ticketId)}
            onClick={() => onOpen(item)}
            className={cn(
              "flex gap-3 transition-colors duration-150 hover:bg-accent focus-visible:bg-accent",
              compact ? "px-4 py-3" : "px-4 py-4 sm:px-5",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                item.read ? "bg-transparent" : "bg-primary",
              )}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-sm leading-snug break-words",
                  item.read ? "text-muted-foreground" : "font-semibold text-foreground",
                )}
              >
                {text(item)}
                {!item.read && <span className="sr-only"> ({t.unread})</span>}
              </span>
              <time
                dateTime={item.createdAt}
                className="mt-1 block text-xs text-muted-foreground tabular-nums"
              >
                {formatDate(new Date(item.createdAt), locale)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
