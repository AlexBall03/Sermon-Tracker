"use client";

import { useEffect, useState } from "react";
import { CloudOff, LoaderCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { referenceKey } from "@/features/scripture/reference";
import type { OfflineIdea } from "@/features/sync/ideas";
import { useLocale, useT } from "@/i18n/client";
import { readKeptIdeas, shown } from "../ideas/store";
import { choicesFor, discardIdeaChanges, settle, type Choice } from "../ideas/sync";
import { readKeptOutlines, shownOutline } from "../outlines/store";
import {
  discardOutlineChanges,
  outlineChoicesFor,
  settleOutline,
  type OutlineChoice,
} from "../outlines/sync";
import type { MutationRecord, MutationType } from "../model";
import { listMutations, onQueueChange, retryMutation } from "../queue";
import { useSync } from "../sync/agent";
import { useOfflineAccount } from "./offline-account";

type Filter = { type?: MutationType; entityId?: string };

/**
 * The signed-in account's changes waiting on this device, and theirs only:
 * `null` while they are being read, "unavailable" where storage is refused.
 * Each carries the title of the idea it is about, from the change itself or
 * from the device's copy; a change to an outline, its sermon's title.
 */
export function usePendingChanges(
  filter: Filter = {},
): (MutationRecord & { title: string })[] | null | "unavailable" {
  const account = useOfflineAccount();
  const { type, entityId } = filter;
  const [records, setRecords] = useState<{
    account: string | null;
    list: (MutationRecord & { title: string })[] | "unavailable";
  } | null>(null);

  useEffect(() => {
    let current = true;
    const read = () => {
      if (!account) return setRecords({ account, list: [] });
      Promise.all([
        listMutations(account, { type, entityId }),
        readKeptIdeas(account),
        readKeptOutlines(account),
      ]).then(
        ([list, kept, outlines]) =>
          current &&
          setRecords({
            account,
            list: list.map((record) => ({
              ...record,
              title:
                record.entityType === "outline"
                  ? (shownOutline(outlines.get(record.entityId))?.sermon.title ?? "")
                  : titleOf(record) ||
                    (shown(kept.get(record.entityId)) ?? kept.get(record.entityId)?.server)
                      ?.title ||
                    "",
            })),
          }),
        () => current && setRecords({ account, list: "unavailable" }),
      );
    };
    read();
    const stop = onQueueChange(read);
    return () => {
      current = false;
      stop();
    };
  }, [account, type, entityId]);

  // Another account's list, read before the switch, is never shown.
  return records && records.account === account ? records.list : null;
}

/** The title a capture or an edit carries. */
const titleOf = (record: MutationRecord) => {
  const payload = record.payload as { title?: unknown } | null;
  return typeof payload?.title === "string" ? payload.title.trim() : "";
};

type Field = "title" | "notes" | "subject" | "passages" | "tags" | "classification";

/** Where an edit and the server's newer copy say different things. */
function differences(record: MutationRecord, server: OfflineIdea): Field[] {
  const mine = (record.payload ?? {}) as Partial<OfflineIdea> & { tagIds?: string[] };
  const fields: Field[] = [];
  if (mine.title !== undefined && mine.title !== server.title) fields.push("title");
  if ((mine.notes ?? null) !== server.notes) fields.push("notes");
  if ((mine.subject ?? null) !== server.subject) fields.push("subject");
  const keys = (list: OfflineIdea["references"] = []) => list.map(referenceKey).join("|");
  if (keys(mine.references) !== keys(server.references)) fields.push("passages");
  if (mine.tagIds && [...mine.tagIds].sort().join() !== [...server.tagIds].sort().join()) {
    fields.push("tags");
  }
  if (
    (["kind", "status", "intendedFormat", "sermonType"] as const).some(
      (key) => mine[key] !== undefined && mine[key] !== server[key],
    )
  ) {
    fields.push("classification");
  }
  return fields;
}

/**
 * Changes made on this device and not yet acknowledged by the server: thoughts
 * captured, and (Phase 5D.1) ideas edited, archived, restored, or deleted.
 * Each says what it is and where it stands: waiting, syncing, waiting behind
 * an earlier change to the same idea, not saved (the engine stopped trying,
 * or the server refused it), or needing the person's choice (a conflict),
 * with the choices that conflict allows. Nothing here writes to the server;
 * it asks the engine (`useSync`). A capture is deleted, and any other change
 * discarded, only after asking, because it is nowhere else. On the offline
 * page there is no engine: "Try again" only puts a change back in line.
 */
export function PendingChanges({
  compact = false,
  type,
  entityId,
}: {
  compact?: boolean;
  /** Only changes of this type (the capture block in Offline Storage). */
  type?: MutationType;
  /** Only changes to this idea (its page). */
  entityId?: string;
}) {
  const t = useT("offline").pending;
  const locale = useLocale();
  const account = useOfflineAccount();
  const records = usePendingChanges({ type, entityId });
  const sync = useSync();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);

  if (records === "unavailable") {
    return <p className="text-sm leading-relaxed text-muted-foreground">{t.unavailable}</p>;
  }
  if (!records) return null;
  if (records.length === 0) {
    return compact || entityId ? null : (
      <p className="text-sm leading-relaxed text-muted-foreground">{t.empty}</p>
    );
  }

  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const retry = (record: MutationRecord) =>
    sync ? sync.retry(record.opId) : account && retryMutation(account, record.opId);
  const choose = async (record: MutationRecord, choice: Choice) => {
    if (!account) return;
    const resolution = await settle(account, record, choice);
    if (resolution) sync?.syncNow();
  };
  const chooseForOutline = async (record: MutationRecord, choice: OutlineChoice) => {
    if (!account) return;
    const resolution = await settleOutline(account, record, choice);
    if (resolution) sync?.syncNow();
  };
  // An outline's changes are one row: the first, which the rest wait behind, and how many there are.
  const outlines = new Map<string, { count: number; latest: number }>();
  for (const record of records) {
    if (record.entityType !== "outline") continue;
    const seen = outlines.get(record.entityId);
    outlines.set(record.entityId, {
      count: (seen?.count ?? 0) + 1,
      latest: Math.max(seen?.latest ?? 0, record.createdAt),
    });
  }
  // Waiting behind an older change to the same idea: sent once that one is.
  const ahead = new Set<string>();
  const behind = new Set<string>();
  for (const record of records) {
    if (ahead.has(record.entityId)) behind.add(record.opId);
    ahead.add(record.entityId);
  }

  const noteFor = (record: MutationRecord) => {
    const conflict = record.conflict;
    if (record.status === "conflict" && conflict) {
      switch (conflict.reason) {
        case "missingTags":
          return t.missingTags(conflict.missingTagIds.length);
        case "stale": {
          const fields = differences(record, conflict.server).map((field) => t.fields[field]);
          const lead = record.type === "idea.delete" ? t.conflicts.staleDelete : t.conflicts.stale;
          return fields.length && record.type === "idea.update"
            ? `${lead} ${t.conflicts.differs(fields.join(", "))}`
            : lead;
        }
        default:
          return record.entityType === "outline" && conflict.reason === "missing"
            ? t.conflicts.missingOutline
            : t.conflicts[conflict.reason];
      }
    }
    if (record.status === "failed") {
      return record.error?.kind === "validation" ? t.rejected : t.stopped;
    }
    if (behind.has(record.opId)) return t.behind;
    if (record.status === "pending" && record.nextAttemptAt) {
      return t.nextTry(when.format(record.nextAttemptAt));
    }
    return null;
  };

  const choiceLabel = (record: MutationRecord, choice: Choice) =>
    choice === "withoutTags"
      ? t.saveWithoutTags
      : choice === "overwrite"
        ? record.type === "idea.delete"
          ? t.choices.deleteAnyway
          : t.choices.keepMine
        : choice === "discard"
          ? record.conflict?.reason === "stale"
            ? t.choices.useAccount
            : record.conflict?.reason === "missing"
              ? t.choices.discard
              : t.choices.keepIdea
          : t.choices[choice];
  const outlineChoiceLabel = (choice: OutlineChoice) =>
    choice === "discard" ? t.choices.discard : t.choices[choice];

  return (
    <>
      <ul className="divide-y rounded-lg border bg-surface">
        {records.map((record) => {
          const sending = record.status === "sending";
          const capture = record.type === "idea.create";
          const outline = record.entityType === "outline" ? outlines.get(record.entityId) : null;
          // Only the first of an outline's changes is listed; the rest are counted on it.
          if (outline && behind.has(record.opId)) return null;
          const note = noteFor(record);
          return (
            <li
              key={record.opId}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 gap-3">
                <CloudOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate font-medium">{record.title || t.untitled}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <Badge tone="muted">
                      {capture ? t.badge : outline ? t.outline : t.kinds[record.type]}
                    </Badge>
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
                    <span>
                      {capture
                        ? t.captured(when.format(record.createdAt))
                        : t.changed(when.format(outline?.latest ?? record.createdAt))}
                    </span>
                    {outline && <span>{t.outlineChanges(outline.count)}</span>}
                  </div>
                  {note && <p className="mt-1.5 text-xs text-muted-foreground">{note}</p>}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {record.status === "conflict" &&
                  outline &&
                  outlineChoicesFor(record).map((choice, index) => (
                    <Button
                      key={choice}
                      size="sm"
                      variant={index === 0 ? "default" : "outline"}
                      onClick={() => void chooseForOutline(record, choice)}
                    >
                      {outlineChoiceLabel(choice)}
                    </Button>
                  ))}
                {record.status === "conflict" &&
                  !outline &&
                  choicesFor(record).map((choice, index) => (
                    <Button
                      key={choice}
                      size="sm"
                      variant={index === 0 ? "default" : "outline"}
                      onClick={() => void choose(record, choice)}
                    >
                      {choiceLabel(record, choice)}
                    </Button>
                  ))}
                {record.status === "failed" && (
                  <Button size="sm" onClick={() => void retry(record)}>
                    {t.retry}
                  </Button>
                )}
                {(record.status === "pending" || sending) && !behind.has(record.opId) && sync && (
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
                {(outline || !(record.status === "conflict" && !capture)) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={sending}
                    onClick={() =>
                      setConfirmation(
                        outline
                          ? {
                              title: t.discardOutlineTitle,
                              description: t.discardOutlineBody,
                              confirmLabel: t.discardConfirm,
                              destructive: true,
                              run: async () => {
                                if (!account) return { ok: false, message: "" };
                                await discardOutlineChanges(account, record.entityId);
                                return { ok: true, message: "" };
                              },
                            }
                          : capture
                            ? {
                                title: t.deleteTitle,
                                description: t.deleteBody,
                                confirmLabel: t.deleteConfirm,
                                destructive: true,
                                run: async () => {
                                  if (!account) return { ok: false, message: "" };
                                  await discardIdeaChanges(account, record.entityId);
                                  return { ok: true, message: "" };
                                },
                              }
                            : {
                                title: t.discardTitle,
                                description: t.discardBody,
                                confirmLabel: t.discardConfirm,
                                destructive: true,
                                run: async () => {
                                  if (!account) return { ok: false, message: "" };
                                  await discardIdeaChanges(account, record.entityId);
                                  return { ok: true, message: "" };
                                },
                              },
                      )
                    }
                  >
                    {capture ? t.delete : t.discard}
                  </Button>
                )}
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
