"use client";

import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRecordPreaching } from "@/features/preaching/components/record-preaching";
import { useT } from "@/i18n/client";

/**
 * The dashboard's way to record that a sermon was preached, without going to
 * the preaching record first. It opens the page's recording form, where the
 * sermon is chosen; the dashboard is still there when the form closes.
 */
export function DashboardRecordButton() {
  const record = useRecordPreaching();
  const t = useT("dashboard").record;
  if (!record) return null;
  return (
    <Button
      type="button"
      variant="outline"
      aria-haspopup="dialog"
      data-tour="record-preaching"
      onClick={() => record()}
    >
      <CalendarPlus aria-hidden />
      {t.title}
    </Button>
  );
}
