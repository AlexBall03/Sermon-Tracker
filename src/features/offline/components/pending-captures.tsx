"use client";

import { useEffect, useState } from "react";
import { CloudOff, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { useLocale, useT } from "@/i18n/client";
import type { MutationRecord } from "../model";
import {
  listMutations,
  onQueueChange,
  removeMutation,
  resolveMutation,
  retryMutation,
} from "../queue";
import { useSync } from "../sync/agent";
import { useOfflineAccount } from "./offline-account";

/**
 * The signed-in account's captures waiting on this device, and theirs only:
 * `null` while they are being read or where storage is refused.
 */
export function usePendingCaptures(): MutationRecord[] | null | "unavailable" {
  const account = useOfflineAccount();
  const [records, setRecords] = useState<{
    account: string | null;
    list: MutationRecord[] | "unavailable";
  } | null>(null);

  useEffect(() => {
    let current = true;
    const read = () => {
      if (!account) return setRecords({ account, list: [] });
      listMutations(account, { type: "idea.create" }).then(
        (list) => current && setRecords({ account, list }),
        () => current && setRecords({ account, list: "unavailable" }),
      );
    };
    read();
    const stop = onQueueChange(read);
    return () => {
      current = false;
      stop();
    };
  }, [account]);

  // Another account's list, read before the switch, is never shown.
  return records && records.account === account ? records.list : null;
}

/** The capture's title, from what was kept. */
const titleOf = (record: MutationRecord) => {
  const payload = record.payload as { title?: unknown } | null;
  return typeof payload?.title === "string" ? payload.title.trim() : "";
};

/** The capture without the tags the server said are gone; nothing else changes. */
const withoutMissingTags = (record: MutationRecord) => {
  const payload = (record.payload ?? {}) as { tagIds?: unknown };
  const missing = new Set(record.conflict?.missingTagIds ?? []);
  const tagIds = Array.isArray(payload.tagIds)
    ? payload.tagIds.filter((id) => !missing.has(id as string))
    : payload.tagIds;
  return { ...payload, tagIds };
};

/**
 * Thoughts captured while the server could not be reached, kept on this
 * device until the sync engine has saved them to the account. Each says where
 * it stands: waiting, syncing, not saved (the engine stopped trying, or the
 * server refused it), or needing the person's choice (a conflict). Nothing
 * here writes to the server; it asks the engine (`useSync`), which sends each
 * as the same idea it was captured as, so sending it twice saves it once.
 * A conflict is settled only by the person, and deleting asks first, because
 * a capture here is nowhere else. On the offline page there is no engine:
 * "Try again" only puts a capture back in line for the next time it runs.
 */
export function PendingCaptures({ compact = false }: { compact?: boolean }) {
  const t = useT("offline").pending;
  const locale = useLocale();
  const account = useOfflineAccount();
  const records = usePendingCaptures();
  const sync = useSync();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);

  if (records === "unavailable") {
    return <p className="text-sm leading-relaxed text-muted-foreground">{t.unavailable}</p>;
  }
  if (!records) return null;
  if (records.length === 0) {
    return compact ? null : (
      <p className="text-sm leading-relaxed text-muted-foreground">{t.empty}</p>
    );
  }

  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const retry = (record: MutationRecord) =>
    sync ? sync.retry(record.opId) : account && retryMutation(account, record.opId);

  return (
    <>
      <ul className="divide-y rounded-lg border bg-surface">
        {records.map((record) => {
          const sending = record.status === "sending";
          const note =
            record.status === "conflict"
              ? t.missingTags(record.conflict?.missingTagIds.length ?? 1)
              : record.status === "failed"
                ? record.error?.kind === "validation"
                  ? t.rejected
                  : t.stopped
                : record.status === "pending" && record.nextAttemptAt
                  ? t.nextTry(when.format(record.nextAttemptAt))
                  : null;
          return (
            <li
              key={record.opId}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 gap-3">
                <CloudOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate font-medium">{titleOf(record) || t.untitled}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <Badge tone="muted">{t.badge}</Badge>
                    <Badge
                      tone={
                        record.status === "failed" || record.status === "conflict"
                          ? "danger"
                          : "muted"
                      }
                    >
                      {record.status === "pending"
                        ? t.status.waiting
                        : t.status[record.status === "done" ? "sending" : record.status]}
                    </Badge>
                    <span>{t.captured(when.format(record.createdAt))}</span>
                  </div>
                  {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {record.status === "conflict" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      void (sync
                        ? sync.resolve(record.opId, withoutMissingTags(record))
                        : account &&
                          resolveMutation(account, record.opId, withoutMissingTags(record)))
                    }
                  >
                    {t.saveWithoutTags}
                  </Button>
                )}
                {record.status === "failed" && (
                  <Button size="sm" onClick={() => void retry(record)}>
                    {t.retry}
                  </Button>
                )}
                {(record.status === "pending" || sending) && sync && (
                  <Button
                    size="sm"
                    disabled={sync.running}
                    aria-busy={sending || undefined}
                    onClick={() => sync.syncNow()}
                  >
                    {sending && <LoaderCircle className="animate-spin" aria-hidden />}
                    {sending ? t.saving : t.save}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={sending}
                  onClick={() =>
                    setConfirmation({
                      title: t.deleteTitle,
                      description: t.deleteBody,
                      confirmLabel: t.deleteConfirm,
                      destructive: true,
                      run: async () => {
                        const removed = account
                          ? await removeMutation(account, record.opId)
                          : false;
                        return { ok: removed, message: "" };
                      },
                    })
                  }
                >
                  {t.delete}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
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
