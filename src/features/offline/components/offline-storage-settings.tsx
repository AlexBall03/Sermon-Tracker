"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BookOpen, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { SettingsBlock } from "@/features/settings/components/settings-section";
import { useReading } from "@/features/preferences/client";
import {
  translations as allTranslations,
  type TranslationId,
} from "@/features/scripture/translations";
import { useLocale, useT } from "@/i18n/client";
import {
  downloadProgress,
  downloadTranslation,
  isCurrent,
  listDatasets,
  onDownloadChange,
  removeTranslation,
  type DownloadOutcome,
} from "../bible/download";
import type { BibleDataset } from "../model";
import { saveOfflineSettings, useOfflineSettings } from "../settings";
import { estimateStorage, formatBytes, requestPersistence, type StorageEstimate } from "../storage";
import { PendingCaptures } from "./pending-captures";

/** Below this share of the quota left, the device is said to be nearly full. */
const lowShare = 0.05;

/** The translations this device has records of, read again whenever a download moves. */
function useDatasets(): Record<string, BibleDataset> | "unavailable" | null {
  const [records, setRecords] = useState<Record<string, BibleDataset> | "unavailable" | null>(null);
  useEffect(() => {
    let current = true;
    const read = () =>
      listDatasets().then(
        (list) =>
          current &&
          setRecords(Object.fromEntries(list.map((record) => [record.translation, record]))),
        () => current && setRecords("unavailable"),
      );
    void read();
    const stop = onDownloadChange(() => void read());
    return () => {
      current = false;
      stop();
    };
  }, []);
  return records;
}

const subscribeProgress = (notify: () => void) => onDownloadChange(notify);

/**
 * Offline Storage, in Settings: what this device keeps so the application can
 * be used without a connection. Every choice here is this device's and
 * nothing is saved to the account. Removing a translation removes its text
 * and nothing else; captures waiting to be saved are only ever removed one
 * at a time, by their owner, after a confirmation.
 */
export function OfflineStorageSettings() {
  const t = useT("offline").settings;
  const pending = useT("offline").pending;
  const locale = useLocale();
  const { translation: reading, translations } = useReading();
  const settings = useOfflineSettings();
  const records = useDatasets();
  const [estimate, setEstimate] = useState<StorageEstimate | undefined>(undefined);
  const [outcomes, setOutcomes] = useState<Partial<Record<TranslationId, DownloadOutcome>>>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  // Re-read on every move of a download, so the figures follow it.
  const progressKey = useSyncExternalStore(
    subscribeProgress,
    () => translations.map((id) => downloadProgress(id) ?? "-").join(","),
    () => "",
  );

  useEffect(() => {
    let current = true;
    void estimateStorage().then((value) => current && setEstimate(value));
    return () => {
      current = false;
    };
  }, [records, progressKey]);

  async function download(id: TranslationId) {
    void requestPersistence();
    const outcome = await downloadTranslation(id);
    setOutcomes((all) => ({ ...all, [id]: outcome }));
  }

  const unavailable = records === "unavailable";
  const low = estimate && estimate.quota > 0 && 1 - estimate.usage / estimate.quota < lowShare;

  return (
    <>
      <SettingsBlock id="offline-capture" title={t.captureTitle} description={t.captureDescription}>
        <div className="space-y-5">
          <Switch
            label={t.captureSwitch}
            description={settings.captureOffline ? undefined : t.captureOff}
            checked={settings.captureOffline}
            disabled={unavailable}
            onChange={(captureOffline) => void saveOfflineSettings({ captureOffline })}
          />
          <div>
            <h3 className="text-sm font-semibold">{pending.title}</h3>
            <p className="mt-1 mb-3 text-sm leading-relaxed text-muted-foreground">
              {pending.description}
            </p>
            <PendingCaptures />
          </div>
        </div>
      </SettingsBlock>

      <SettingsBlock id="offline-bible" title={t.bibleTitle} description={t.bibleDescription}>
        <div className="space-y-5">
          <Switch
            label={t.autoSwitch}
            description={t.autoDescription}
            checked={settings.autoBible}
            disabled={unavailable}
            onChange={(autoBible) => {
              void saveOfflineSettings({ autoBible });
              if (autoBible) void download(reading);
            }}
          />
          <ul className="divide-y rounded-lg border bg-surface">
            {translations.map((id) => {
              const record = records && records !== "unavailable" ? records[id] : undefined;
              const progress = downloadProgress(id);
              const outcome = outcomes[id];
              const current = isCurrent(record, id);
              const kept = Boolean(record?.activeVersion);
              const running = progress !== undefined;
              const interrupted = !running && record?.status === "downloading";
              const failed = !running && record?.status === "failed" ? record.error : undefined;

              let status: string;
              if (running) status = t.status.downloading(Math.round(progress * 100));
              else if (outcome === "busy") status = t.status.busy;
              else if (current)
                status = t.status.ready(formatBytes(record?.activeBytes ?? 0, locale));
              else if (kept) status = t.status.outdated;
              else if (interrupted) status = t.status.paused;
              else status = t.status.none;

              return (
                <li key={id} className="px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <BookOpen
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="font-medium">
                          {allTranslations[id].short}
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            {allTranslations[id].name}
                          </span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span aria-live="polite">{status}</span>
                          {id === reading && settings.autoBible && (
                            <Badge tone="accent">{t.automatic}</Badge>
                          )}
                        </div>
                        {running && (
                          <div
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(progress * 100)}
                            aria-label={status}
                            className="mt-2 h-1 w-48 max-w-full overflow-hidden rounded-full bg-muted"
                          >
                            <div
                              className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                              style={{ width: `${Math.max(4, progress * 100)}%` }}
                            />
                          </div>
                        )}
                        {failed && (
                          <p role="alert" className="mt-1.5 text-sm text-destructive">
                            {t.errors[failed]}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {running ? (
                        <Button size="sm" variant="outline" disabled aria-busy>
                          <LoaderCircle className="animate-spin" aria-hidden />
                          {t.status.downloading(Math.round(progress * 100))}
                        </Button>
                      ) : (
                        !current && (
                          <Button
                            size="sm"
                            variant={kept ? "outline" : "default"}
                            disabled={unavailable}
                            onClick={() => void download(id)}
                          >
                            {failed ? t.retry : interrupted ? t.resume : t.download}
                          </Button>
                        )
                      )}
                      {(kept || interrupted || failed) && !running && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() =>
                            setConfirmation({
                              title: t.removeTitle(allTranslations[id].short),
                              description: t.removeBody,
                              confirmLabel: t.removeConfirm,
                              destructive: true,
                              run: async () => {
                                // Kept by itself, it would only come straight back.
                                if (id === reading) await saveOfflineSettings({ autoBible: false });
                                await removeTranslation(id);
                                return { ok: true, message: "" };
                              },
                            })
                          }
                        >
                          {t.remove}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </SettingsBlock>

      <SettingsBlock title={t.moreTitle} description={t.moreDescription}>
        <div className="space-y-3">
          {[t.ideas, t.outlines].map((label) => (
            <div key={label} className="flex items-center justify-between gap-3 opacity-70">
              <Switch label={label} checked={false} disabled onChange={() => {}} />
              <Badge tone="muted">{t.later}</Badge>
            </div>
          ))}
        </div>
      </SettingsBlock>

      <SettingsBlock title={t.storageTitle}>
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          {unavailable ? (
            <p role="alert">{t.storageUnavailable}</p>
          ) : estimate === undefined ? null : estimate ? (
            <>
              <p>
                {t.storageUsage(
                  formatBytes(estimate.usage, locale),
                  formatBytes(estimate.quota, locale),
                )}
              </p>
              {/* The sentence above says it; the bar only shows it at a glance. */}
              {estimate.quota > 0 && (
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${low ? "bg-destructive" : "bg-foreground/55"}`}
                    style={{
                      width: `${Math.max(1, Math.min(100, (estimate.usage / estimate.quota) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </>
          ) : (
            <p>{t.storageUnknown}</p>
          )}
          {low && <p role="alert">{t.storageLow}</p>}
          <p>{t.storageNote}</p>
        </div>
      </SettingsBlock>

      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={async (chosen) => {
          setBusy(true);
          try {
            await chosen.run();
          } finally {
            setBusy(false);
            setConfirmation(null);
          }
        }}
      />
    </>
  );
}
