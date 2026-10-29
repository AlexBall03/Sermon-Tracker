"use client";

import type { JSONContent } from "@tiptap/core";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { Segmented } from "@/components/ui/segmented";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { EditorSessionState } from "../persistence/session/model";
import type {
  CandidateView,
  RecoveryInspection,
  UnitView,
} from "../persistence/session/resolution";
import type { EditorSession } from "../persistence/session/session";
import { DocumentPreview } from "./document-preview";

/*
 * The full-page recovery state (A3, with A2.3C's contracts): what this device
 * holds that the server does not, shown beside what the server holds, for the
 * person to keep or discard. Nothing here restores, discards, or merges by
 * itself: `inspectRecovery` is a read, made once each time the state is
 * entered, and `restore` and `discard` run only from a button (discard after a
 * confirmation). Every outcome that says the review no longer holds reads the
 * device again. The editor is not on the page while this is shown.
 */

type Recovering = Extract<EditorSessionState, { kind: "recovery_required" | "resolving" }>;

type Message = { tone: "info" | "danger"; text: string } | null;

export function RecoveryView({ session, state }: { session: EditorSession; state: Recovering }) {
  const t = useT("sermonEditor").recovery;
  const locale = useLocale();
  const [answer, setAnswer] = useState<{ to: object; inspection: RecoveryInspection } | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [selected, setSelected] = useState(0);
  const [side, setSide] = useState<"recovered" | "server">("recovered");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // One read of the device for each time the state is entered (and when asked again).
  const entered = state.kind === "recovery_required" ? state : null;
  // Each read answers one request; an answer to an earlier one is never shown as this one's.
  const request = useMemo(() => (entered ? { entered, reviewed } : null), [entered, reviewed]);
  useEffect(() => {
    if (!request || request.entered.reason !== "drafts") return;
    let current = true;
    void session.inspectRecovery().then((found) => {
      if (current) setAnswer({ to: request, inspection: found });
    });
    return () => {
      current = false;
    };
  }, [session, request]);
  // While a restore or discard runs (no request), the review it was made from stays shown.
  const inspection =
    answer && (request === null || answer.to === request) ? answer.inspection : null;

  const units = useMemo(
    () => (inspection?.ok ? inspection.units.filter((unit) => unit.blocking) : []),
    [inspection],
  );
  const unit: UnitView | undefined = units[Math.min(selected, Math.max(0, units.length - 1))];
  const recovered = useMemo(
    () => (unit ? session.previewRecovered(unit.head.token) : null),
    [session, unit],
  );
  const working = busy || state.kind === "resolving";
  const again = (text: string) => {
    setMessage({ tone: "info", text });
    setReviewed((count) => count + 1);
  };

  async function restore(target: UnitView) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await session.restore(target.head.token);
      switch (result.outcome) {
        case "restored":
          // The session is `ready` with the restored work; the host opens the editor with it.
          return;
        case "changed":
        case "unknown_token":
        case "other_candidates":
        case "equivalent":
          return again(t.changed);
        case "server_changed":
          return again(t.serverChanged);
        case "read_failed":
          return setMessage({ tone: "danger", text: t.readFailed });
        case "storage_failed":
          return setMessage({ tone: "danger", text: t.storageFailed });
        default:
          return setMessage({ tone: "danger", text: t.failed });
      }
    } finally {
      setBusy(false);
    }
  }

  async function discard(target: CandidateView) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await session.discard(target.token);
      if (result.outcome === "discarded" || result.outcome === "ignored") {
        // The session checks again by itself; a new state arrives and the device is read again.
        setSelected(0);
        return;
      }
      if (result.outcome === "changed" || result.outcome === "unknown_token")
        return again(t.changed);
      if (result.outcome === "storage_failed") {
        return setMessage({ tone: "danger", text: t.storageFailed });
      }
      setMessage({ tone: "danger", text: t.failed });
    } finally {
      setBusy(false);
      setConfirmation(null);
    }
  }

  const askDiscard = (target: CandidateView) =>
    setConfirmation({
      title: t.discardTitle,
      description: t.discardBody,
      confirmLabel: t.discardConfirm,
      destructive: true,
      run: async () => {
        await discard(target);
        return { ok: true, message: "" };
      },
    });

  const when = (time: number | null) =>
    time === null
      ? null
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(time);

  return (
    <section
      aria-labelledby="recovery-title"
      data-testid="recovery-view"
      className="mt-6 space-y-5"
    >
      <div className="max-w-3xl space-y-2">
        <h2 id="recovery-title" className="font-serif text-2xl font-medium">
          {t.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.body}</p>
      </div>

      {state.kind === "recovery_required" && state.reason === "inspection_failed" ? (
        <Notice tone="danger" text={t.inspectionFailed}>
          <Button variant="outline" onClick={() => session.recheck()} data-testid="recovery-retry">
            <RotateCcw aria-hidden />
            {t.retry}
          </Button>
        </Notice>
      ) : !inspection ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {t.checking}
        </p>
      ) : !inspection.ok ? (
        <Notice tone="danger" text={t.inspectionFailed}>
          <Button variant="outline" onClick={() => session.recheck()} data-testid="recovery-retry">
            <RotateCcw aria-hidden />
            {t.retry}
          </Button>
        </Notice>
      ) : (
        <>
          {message && <Notice tone={message.tone} text={message.text} />}
          {units.length > 1 && (
            <div role="group" aria-label={t.units} className="flex flex-wrap gap-2">
              {units.map((item, index) => (
                <Button
                  key={item.head.recordId}
                  variant={item === unit ? "default" : "outline"}
                  aria-pressed={item === unit}
                  onClick={() => setSelected(index)}
                  data-testid="recovery-unit"
                >
                  {t.unit(index + 1)}
                </Button>
              ))}
            </div>
          )}
          {unit && (
            <div className="space-y-4" data-testid="recovery-unit-detail">
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {when(unit.head.updatedAt) && <li>{t.savedAt(when(unit.head.updatedAt)!)}</li>}
                {unit.ancestors.length > 0 && <li>{t.restoredEarlier}</li>}
                {unit.head.status === "conflict" && <li>{t.conflict}</li>}
                {unit.head.restorable?.ok && unit.head.restorable.oversized && (
                  <li>{t.oversized}</li>
                )}
                {(unit.head.kind === "unsupported" || unit.head.kind === "malformed") && (
                  <li>{t.unreadable}</li>
                )}
              </ul>
              <Segmented
                label={t.title}
                hideLabel
                name="recovery-side"
                className="max-w-md"
                value={side}
                onChange={setSide}
                options={[
                  { value: "recovered", label: t.recovered },
                  { value: "server", label: t.server },
                ]}
              />
              <Side
                content={side === "recovered" ? recovered : inspection.server.content}
                label={side === "recovered" ? t.recovered : t.server}
                testId={
                  side === "recovered" ? "recovery-preview-recovered" : "recovery-preview-server"
                }
                unavailable={t.previewUnavailable}
              />
              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                {unit.restorable && (
                  <Button
                    onClick={() => void restore(unit)}
                    disabled={working || !inspection.single}
                    data-testid="recovery-restore"
                  >
                    {working && <LoaderCircle className="animate-spin" aria-hidden />}
                    {t.restore}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => askDiscard(unit.head)}
                  disabled={working}
                  data-testid="recovery-discard"
                >
                  {t.discard}
                </Button>
                <p className="basis-full text-sm text-muted-foreground">
                  {unit.restorable && !inspection.single ? t.resolveOthers : t.restoreHint}
                </p>
              </div>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onConfirm={(chosen) => void chosen.run()}
        onCancel={() => setConfirmation(null)}
      />
    </section>
  );
}

function Side({
  content,
  label,
  testId,
  unavailable,
}: {
  content: JSONContent | null;
  label: string;
  testId: string;
  unavailable: string;
}) {
  if (!content) {
    return (
      <p data-testid={testId} className="rounded-lg border p-4 text-sm text-muted-foreground">
        {unavailable}
      </p>
    );
  }
  return <DocumentPreview key={testId} content={content} label={label} testId={testId} />;
}

export function Notice({
  tone,
  text,
  children,
}: {
  tone: "info" | "danger";
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex max-w-3xl flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm",
        tone === "danger" ? "border-destructive/40" : "bg-muted/50",
      )}
    >
      <p className="min-w-0 flex-1 basis-60">{text}</p>
      {children}
    </div>
  );
}
