"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { SettingsBlock } from "@/features/settings/components/settings-section";
import { useLocale, useT } from "@/i18n/client";
import { refreshIdeas } from "../ideas/refresh";
import {
  emptyIdeasState,
  keptIdeasBytes,
  listLocalIdeas,
  onIdeasChange,
  readIdeasState,
  removeKeptIdeas,
  type IdeasState,
} from "../ideas/store";
import { listMutations } from "../queue";
import { saveOfflineSettings, useOfflineSettings } from "../settings";
import { formatBytes } from "../storage";
import { useOfflineAccount } from "./offline-account";

type Kept = { state: IdeasState; count: number; bytes: number };

function useKeptIdeas(account: string | null): Kept | null {
  const [kept, setKept] = useState<{ account: string | null; value: Kept } | null>(null);
  useEffect(() => {
    let current = true;
    const read = () => {
      if (!account)
        return setKept({ account, value: { state: emptyIdeasState, count: 0, bytes: 0 } });
      void Promise.all([readIdeasState(account), listLocalIdeas(account), keptIdeasBytes(account)])
        .then(
          ([state, ideas, bytes]) =>
            current && setKept({ account, value: { state, count: ideas.length, bytes } }),
        )
        .catch(() => {});
    };
    read();
    const stop = onIdeasChange(read);
    return () => {
      current = false;
      stop();
    };
  }, [account]);
  return kept?.account === account ? kept.value : null;
}

/**
 * The account's ideas on this device (Phase 5D.1), in Offline Storage: kept or
 * not (a choice of this device's), how many and how current, how much room
 * they take, and the ways to update or remove them. Removing never takes an
 * idea whose changes are still waiting to sync.
 */
export function OfflineIdeasSettings({ unavailable }: { unavailable: boolean }) {
  const t = useT("offline").settings;
  const locale = useLocale();
  const account = useOfflineAccount();
  const settings = useOfflineSettings();
  const kept = useKeptIdeas(account);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  async function refresh() {
    if (!account) return;
    setRefreshing(true);
    await refreshIdeas(account).catch(() => {});
    setRefreshing(false);
  }

  const state = kept?.state;
  const status = !settings.ideasOffline
    ? t.ideasOff
    : !state
      ? null
      : state.status === "downloading" && refreshing
        ? t.ideasDownloading(state.have, state.total)
        : state.complete && state.completedAt
          ? t.ideasKept(kept.count, when.format(state.completedAt))
          : state.total > 0
            ? t.ideasPartial(state.have, state.total)
            : t.ideasNever;

  return (
    <SettingsBlock id="offline-ideas" title={t.ideas} description={t.ideasDescription}>
      <div className="space-y-4">
        <Switch
          label={t.ideasSwitch}
          checked={settings.ideasOffline}
          disabled={unavailable || !account}
          onChange={(ideasOffline) => {
            void saveOfflineSettings({ ideasOffline }).then(() => {
              if (ideasOffline) void refresh();
            });
          }}
        />
        <div className="space-y-1 text-sm leading-relaxed text-muted-foreground" aria-live="polite">
          {status && <p>{status}</p>}
          {settings.ideasOffline && state?.status === "failed" && (
            <p role="alert">{state.error === "auth" ? t.ideasAuth : t.ideasFailed}</p>
          )}
          {kept && kept.bytes > 0 && <p>{t.ideasSize(formatBytes(kept.bytes, locale))}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {settings.ideasOffline && (
            <Button
              size="sm"
              variant="secondary"
              disabled={refreshing || !account || unavailable}
              aria-busy={refreshing || undefined}
              onClick={() => void refresh()}
            >
              {refreshing ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              {t.ideasRefresh}
            </Button>
          )}
          {kept && kept.count > 0 && account && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() =>
                setConfirmation({
                  title: t.ideasRemoveTitle,
                  description: t.ideasRemoveBody,
                  confirmLabel: t.ideasRemoveConfirm,
                  destructive: true,
                  run: async () => {
                    // Kept by itself, it would only come straight back.
                    if (settings.ideasOffline) await saveOfflineSettings({ ideasOffline: false });
                    const queued = await listMutations(account);
                    await removeKeptIdeas(
                      account,
                      new Set(queued.map((record) => record.entityId)),
                    );
                    return { ok: true, message: "" };
                  },
                })
              }
            >
              {t.ideasRemove}
            </Button>
          )}
        </div>
      </div>
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
    </SettingsBlock>
  );
}
