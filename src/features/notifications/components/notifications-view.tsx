"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { markAllNotificationsRead, markNotificationsRead } from "../actions";
import type { NotificationItem } from "../model";
import { NotificationList } from "./notification-list";

/** The notifications page's list: opening one marks it read, and all can be marked at once. */
export function NotificationsView({ items: initial }: { items: NotificationItem[] }) {
  const t = useT("notifications");
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, startTransition] = useTransition();

  // A newer list from the server replaces what is shown.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setItems(initial);
  }

  const unread = items.some((item) => !item.read);

  if (items.length === 0) {
    return (
      <p className="mt-10 rounded-xl border border-dashed p-8 text-center text-sm leading-relaxed text-muted-foreground sm:p-12">
        {t.empty}
      </p>
    );
  }

  return (
    <div className="mt-8">
      {unread && (
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                await markAllNotificationsRead().catch(() => undefined);
                setItems((current) => current.map((item) => ({ ...item, read: true })));
                router.refresh();
              })
            }
          >
            {t.markAllRead}
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-surface shadow-card">
        <NotificationList
          items={items}
          onOpen={(item) => {
            if (item.read) return;
            setItems((current) =>
              current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
            );
            void markNotificationsRead([item.id]).catch(() => undefined);
          }}
        />
      </div>
    </div>
  );
}
