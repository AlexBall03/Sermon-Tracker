"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { createIdea } from "@/features/ideas/actions";
import { useLocale, useT } from "@/i18n/client";
import type { MutationRecord } from "../model";
import { listMutations, markAttempt, onQueueChange, removeMutation } from "../queue";
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

/**
 * Thoughts captured while the server could not be reached, kept on this
 * device until they are saved to the account. Each says it is on this device
 * only. "Save to account" sends it as the same idea it was captured as
 * (`createIdea` with its ID), so sending it twice saves it once; it leaves
 * this list only once the server has it. Deleting one asks first, because it
 * is nowhere else. Nothing here sends anything by itself.
 */
export function PendingCaptures({ compact = false }: { compact?: boolean }) {
  const t = useT("offline").pending;
  const locale = useLocale();
  const account = useOfflineAccount();
  const records = usePendingCaptures();
  const toast = useToast();
  const [sending, setSending] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (record: MutationRecord) => {
      if (!account || sending) return;
      setSending(record.opId);
      try {
        const result = await createIdea(record.payload, record.entityId).catch(() => null);
        if (result?.ok) {
          await removeMutation(account, record.opId);
          toast({ message: t.saved });
        } else {
          await markAttempt(account, record.opId, {
            ok: false,
            kind: result ? "server" : "network",
            message: result?.message,
          });
          toast({ message: result?.message ?? t.notSaved });
        }
      } finally {
        setSending(null);
      }
    },
    [account, sending, toast, t],
  );

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
  return (
    <>
      <ul className="divide-y rounded-lg border bg-surface">
        {records.map((record) => (
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
                  <span>{t.captured(when.format(record.createdAt))}</span>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={sending !== null}
                aria-busy={sending === record.opId || undefined}
                onClick={() => void send(record)}
              >
                {sending === record.opId && <LoaderCircle className="animate-spin" aria-hidden />}
                {sending === record.opId ? t.saving : t.save}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={sending === record.opId}
                onClick={() =>
                  setConfirmation({
                    title: t.deleteTitle,
                    description: t.deleteBody,
                    confirmLabel: t.deleteConfirm,
                    destructive: true,
                    run: async () => {
                      const removed = account ? await removeMutation(account, record.opId) : false;
                      return { ok: removed, message: "" };
                    },
                  })
                }
              >
                {t.delete}
              </Button>
            </div>
          </li>
        ))}
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
