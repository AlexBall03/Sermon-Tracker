"use client";

import { CalendarPlus } from "lucide-react";

import { useRecordPreaching } from "@/features/preaching/components/record-preaching";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { ShortcutContent, shortcutCard } from "./shortcut-link";

/**
 * The dashboard's way to record that a sermon was preached, without going to
 * the preaching record first. It opens the page's recording form, where the
 * sermon is chosen; the dashboard is still there when the form closes.
 */
export function RecordShortcut() {
  const record = useRecordPreaching();
  const t = useT("dashboard").record;
  if (!record) return null;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => record()}
      className={cn(shortcutCard, "w-full cursor-pointer text-left")}
    >
      <ShortcutContent icon={CalendarPlus} title={t.title} description={t.description} />
    </button>
  );
}
