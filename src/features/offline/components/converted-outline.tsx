"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Copy, ExternalLink, FileText, TriangleAlert } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import type { EditorState, OutlineStore } from "@/features/outlines/editor/store";
import type { NumberingConfig } from "@/features/outlines/numbering";
import type { OfflineOutline } from "@/features/sync/outlines";
import { useLocale, useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import {
  entryAsText,
  outlineAsText,
  reviewEntries,
  type ReviewEntry,
  type ReviewSource,
  type ReviewWords,
} from "../outlines/review";
import { getKeptOutline, isAuthoritative } from "../outlines/store";
import { discardOutlineChanges } from "../outlines/sync";
import { listMutations } from "../queue";

/*
 * An outline this device knows became a sermon document in the account
 * (A2.3D), on the offline page, in place of the legacy editor. It says so,
 * offers the new editor at the outline's own address, and shows what this
 * device kept of the old outline, read only, to read and copy. Nothing here
 * edits, merges, converts, or sends anything; the one thing it changes is
 * the person's confirmed Discard of the changes kept here, which never
 * touches the account's document and never opens the old outline to editing
 * again (the device keeps knowing it is a document).
 *
 * The device API refuses every legacy change once this is known
 * (outlines/operations.ts); this view only stops offering them.
 */

const notice = "rounded-xl border bg-muted/50 px-4 py-3 text-sm leading-relaxed";

type Props = {
  account: string;
  outlineId: string;
  /** What is shown of the copy kept here (`local` over `server`), if anything. */
  outline: OfflineOutline | null;
  /** Changes about it still queued on this device. */
  waiting: number;
  /** The device holds a copy changed here (`local`). */
  hasLocal: boolean;
  /**
   * The legacy editor's store, when that editor was open in this tab as the
   * device learned of the document: what it held that was never kept on the
   * device is shown from it, never thrown away.
   */
  frozen: OutlineStore | null;
};

const noStore = () => () => {};
const noState = () => null;

/** What the old editor still holds that this device never kept: none once it says saved. */
function useUnkept(store: OutlineStore | null): EditorState | null {
  const state = useSyncExternalStore(
    store?.subscribe ?? noStore,
    store?.getState ?? noState,
    noState,
  );
  if (!state) return null;
  return state.status !== "saved" || state.lost.length > 0 ? state : null;
}

function Review({
  entries,
  words,
  title,
  onCopy,
}: {
  entries: ReviewEntry[];
  words: ReviewWords;
  title: string;
  onCopy: (text: string) => void;
}) {
  const t = useT("offline").outlines.converted;
  return (
    <ol className="divide-y rounded-lg border bg-surface" aria-label={title}>
      {entries.map((entry) => {
        const heading =
          entry.type === "introduction"
            ? words.introduction
            : entry.type === "conclusion"
              ? words.conclusion
              : entry.label;
        const name = entry.title || (entry.type === "point" ? words.untitled : heading);
        return (
          <li
            key={entry.id}
            className="flex items-start gap-3 px-4 py-3"
            style={{ paddingInlineStart: `calc(1rem + ${Math.min(entry.depth, 6)} * 1.25rem)` }}
          >
            <div className="min-w-0 flex-1 select-text">
              <p className="font-medium break-words">
                {heading && (
                  <span className="mr-2 text-muted-foreground tabular-nums">{heading}</span>
                )}
                {entry.type === "point" || entry.title ? name : null}
              </p>
              {entry.notes && (
                <p className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">
                  {entry.notes}
                </p>
              )}
              {entry.passages.length > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">{entry.passages.join("; ")}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-muted-foreground"
              aria-label={t.copyOf(name)}
              onClick={() => onCopy(entryAsText(entry, words))}
            >
              <Copy aria-hidden />
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

export function ConvertedOutline({
  account,
  outlineId,
  outline,
  waiting,
  hasLocal,
  frozen,
}: Props) {
  const t = useT("offline").outlines.converted;
  const editor = useT("outlines").editor;
  const locale = useLocale();
  const unkept = useUnkept(frozen);
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState<{ text: string; alert: boolean } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);

  // Words that exist only on this page are guarded until the person leaves on purpose.
  useLeaveGuard(unkept !== null, t.unkeptLeave);

  const words: ReviewWords = {
    introduction: editor.sections.introduction,
    conclusion: editor.sections.conclusion,
    untitled: editor.untitled,
  };
  const entries = useMemo(
    () => (outline ? reviewEntries(outline.entries, outline.numbering, locale) : []),
    [outline, locale],
  );
  const unkeptEntries = useMemo(() => {
    if (!unkept) return [];
    const sources: ReviewSource[] = unkept.rows;
    return reviewEntries(sources, unkept.numbering as NumberingConfig, locale);
  }, [unkept, locale]);
  const title = outline?.sermon.title ?? "";
  const href = `${routes.outlines}/${outlineId}`;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ text: t.copied, alert: false });
    } catch {
      setMessage({ text: t.copyFailed, alert: true });
    }
  }

  /** Discards in one transaction, then reads back what is left before saying so. */
  async function discard() {
    try {
      const result = await discardOutlineChanges(account, outlineId);
      if (result === "sending") return { ok: false, message: t.discardSending };
      const [left, kept] = await Promise.all([
        listMutations(account, { entityId: outlineId }),
        getKeptOutline(account, outlineId),
      ]);
      if (left.length > 0 || kept?.local || !isAuthoritative(kept)) {
        return { ok: false, message: t.discardIncomplete };
      }
      return { ok: true, message: t.discarded };
    } catch {
      return { ok: false, message: t.discardFailed };
    }
  }

  return (
    <div className="mt-5 max-w-4xl space-y-5">
      <section
        aria-labelledby="converted-outline-heading"
        className="space-y-3 rounded-xl border px-4 py-4 sm:px-5"
      >
        <h2
          id="converted-outline-heading"
          className="flex items-start gap-2 font-display text-xl leading-snug font-medium"
        >
          <FileText className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
          {t.title}
        </h2>
        <p className="text-[0.9375rem] leading-relaxed">{t.body}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{t.notMerged}</p>
        {waiting > 0 && <p className="text-sm font-medium">{t.unsynced(waiting)}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={href}
            className={buttonVariants()}
            onClickCapture={(event) => {
              // The offline page draws this address itself (offline-shell.tsx follows such a
              // link with no request), so only loading it again reaches the server. This view is
              // shown at this very address: the server answers with the new editor, or the
              // service worker with this page again, which still says the account was not
              // reached. A browser that says it is offline is not even asked.
              event.preventDefault();
              if (navigator.onLine === false) {
                setOffline(true);
                return;
              }
              setOffline(false);
              window.location.reload();
            }}
          >
            <ExternalLink aria-hidden />
            {t.open}
          </a>
          {(waiting > 0 || hasLocal) && (
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() =>
                setConfirmation({
                  title: t.discardTitle,
                  description: t.discardBody(Math.max(waiting, 1)),
                  confirmLabel: t.discardConfirm,
                  destructive: true,
                  run: discard,
                })
              }
            >
              {t.discard}
            </Button>
          )}
        </div>
        <p role="status" className="text-sm leading-relaxed text-muted-foreground">
          {offline ? t.offline : t.unreachable}
        </p>
      </section>

      {message && (
        <p role={message.alert ? "alert" : "status"} className={notice}>
          {message.text}
        </p>
      )}

      {unkept && (
        <section aria-labelledby="converted-unkept-heading" className="space-y-3">
          <h2
            id="converted-unkept-heading"
            className="flex items-start gap-2 font-display text-lg font-medium"
          >
            <TriangleAlert className="mt-1 size-4 shrink-0 text-destructive" aria-hidden />
            {t.unkeptTitle}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{t.unkeptBody}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void copy(
                [
                  outlineAsText(title, unkeptEntries, words),
                  ...unkept.lost.map((draft) =>
                    [draft.title || words.untitled, draft.notes].filter(Boolean).join("\n"),
                  ),
                ].join("\n\n"),
              )
            }
          >
            <Copy aria-hidden />
            {t.copyAll}
          </Button>
          <Review entries={unkeptEntries} words={words} title={t.unkeptTitle} onCopy={copy} />
          {unkept.lost.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t.lostTitle}</h3>
              <ul className="divide-y rounded-lg border bg-surface">
                {unkept.lost.map((draft) => (
                  <li key={draft.id} className="px-4 py-3 select-text">
                    <p className="font-medium break-words">{draft.title || words.untitled}</p>
                    {draft.notes && (
                      <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
                        {draft.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="converted-review-heading" className="space-y-3">
        <h2 id="converted-review-heading" className="font-display text-lg font-medium">
          {outline ? t.reviewTitle : t.nothingKept}
        </h2>
        {outline ? (
          <>
            <p className="text-sm leading-relaxed text-muted-foreground">{t.reviewNote}</p>
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.emptyOutline}</p>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void copy(outlineAsText(title, entries, words))}
                >
                  <Copy aria-hidden />
                  {t.copyAll}
                </Button>
                <Review entries={entries} words={words} title={t.reviewTitle} onCopy={copy} />
              </>
            )}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">{t.nothingKeptBody}</p>
        )}
      </section>

      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onCancel={() => setConfirmation(null)}
        onConfirm={async (chosen) => {
          setBusy(true);
          try {
            const result = await chosen.run();
            setMessage({ text: result.message, alert: !result.ok });
          } finally {
            setBusy(false);
            setConfirmation(null);
          }
        }}
      />
    </div>
  );
}
