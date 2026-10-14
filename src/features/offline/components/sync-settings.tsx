"use client";

import { LoaderCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SettingsBlock } from "@/features/settings/components/settings-section";
import { useLocale, useT } from "@/i18n/client";
import { countByStatus } from "../sync/engine";
import { useSync } from "../sync/agent";
import { PendingChanges, usePendingChanges } from "./pending-changes";

/**
 * The Synchronization settings (Phase 5C): where this device's queued work
 * stands, when it last reached the account, and a way to send it now. It
 * reports only what the queue and the engine say; it shows nothing it cannot
 * read and offers no setting.
 */
export function SyncSettings() {
  const t = useT("offline").sync;
  const locale = useLocale();
  const sync = useSync();
  const records = usePendingChanges();
  const counts = Array.isArray(records) ? countByStatus(records) : null;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const parts = counts
    ? [
        counts.waiting + counts.sending > 0 && t.waiting(counts.waiting + counts.sending),
        counts.failed > 0 && t.failed(counts.failed),
        counts.conflict > 0 && t.conflict(counts.conflict),
      ].filter(Boolean)
    : [];
  const status = sync?.running
    ? t.running
    : sync?.last === "paused"
      ? t.paused
      : counts && parts.length === 0
        ? t.clear
        : parts.join(" · ");

  return (
    <>
      <SettingsBlock id="sync-status" title={t.statusTitle} description={t.statusDescription}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0" aria-live="polite">
            {status && <p className="text-sm font-medium">{status}</p>}
            <p className="mt-1 text-sm text-muted-foreground">
              {sync?.lastSyncAt ? t.lastSync(when.format(sync.lastSyncAt)) : t.never}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!sync || sync.running}
            aria-busy={sync?.running || undefined}
            onClick={() => sync?.syncNow()}
          >
            {sync?.running ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <RefreshCw aria-hidden />
            )}
            {t.now}
          </Button>
        </div>
      </SettingsBlock>
      <SettingsBlock id="sync-queue" title={t.queueTitle}>
        <PendingChanges />
      </SettingsBlock>
    </>
  );
}
