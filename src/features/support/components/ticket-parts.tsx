"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Lock } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  adminReplyToTicket,
  closeTicket,
  markTicketRead,
  markTicketReadByAdmin,
  replyToTicket,
  setTicketStatus,
} from "../actions";
import {
  isFinished,
  statusesFor,
  supportLimits,
  type MessageVisibility,
  type TicketKind,
  type TicketStatus,
} from "../model";
import { supportSchemas } from "../schemas";
import { MessageField } from "./contact-form";

/** A ticket's status, with the dot that means its tone is not carried by color alone. */
export function StatusBadge({ status }: { status: TicketStatus }) {
  const t = useT("support").statuses;
  return <Badge tone={isFinished(status) ? "muted" : "accent"}>{t[status]}</Badge>;
}

export type ThreadItem =
  | {
      type: "message";
      id: string;
      author: "requester" | "admin";
      visibility: MessageVisibility;
      body: string;
      createdAt: Date;
      /** Shown above the message. */
      name: string;
    }
  | { type: "status"; id: string; toStatus: TicketStatus; createdAt: Date };

/**
 * A conversation, oldest first: what was said, and where the status changed.
 * What people wrote is shown as text and never as markup. An internal note is
 * marked as one in words, not by its color alone.
 */
export function Thread({ items, label }: { items: ThreadItem[]; label: string }) {
  const words = useT("support");
  const locale = useLocale();
  return (
    <ol aria-label={label} className="space-y-4">
      {items.map((item) =>
        item.type === "status" ? (
          <li
            key={item.id}
            className="flex items-center gap-3 py-1 text-[0.8125rem] text-muted-foreground"
          >
            <span aria-hidden className="h-px flex-1 bg-border" />
            <span>
              {words.thread.statusChanged(words.statuses[item.toStatus])} ·{" "}
              <time dateTime={item.createdAt.toISOString()}>
                {formatDate(item.createdAt, locale)}
              </time>
            </span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </li>
        ) : (
          <li
            key={item.id}
            className={cn(
              "rounded-xl border p-4 sm:p-5",
              item.visibility === "internal"
                ? "border-dashed bg-muted/60"
                : item.author === "admin"
                  ? "bg-surface-raised shadow-card"
                  : "bg-surface",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-semibold">{item.name}</p>
              <time
                dateTime={item.createdAt.toISOString()}
                className="text-[0.8125rem] text-muted-foreground"
              >
                {formatDate(item.createdAt, locale)}
              </time>
            </div>
            {item.visibility === "internal" && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Lock className="size-3.5" aria-hidden />
                {words.admin.internalTag}
              </p>
            )}
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap">
              {item.body}
            </p>
          </li>
        ),
      )}
    </ol>
  );
}

/** Screenshots on a ticket, each served only through its guarded address. */
export function Screenshots({ ids }: { ids: string[] }) {
  const t = useT("support").attachments;
  if (ids.length === 0) return null;
  return (
    <section aria-labelledby="ticket-screenshots">
      <h2 id="ticket-screenshots" className="text-sm font-semibold">
        {t.label}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-3">
        {ids.map((id, index) => (
          <li key={id}>
            <a
              href={`/api/support/attachments/${id}`}
              target="_blank"
              rel="noopener"
              aria-label={t.open(index + 1)}
              className="block size-28 overflow-hidden rounded-lg border bg-muted shadow-card transition-[border-color] hover:border-primary/70 sm:size-32"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, served per request */}
              <img
                src={`/api/support/attachments/${id}`}
                alt={t.alt(index + 1)}
                loading="lazy"
                className="size-full object-cover"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Records, once the page is shown, that it has been seen. */
export function MarkRead({ ticketId, as }: { ticketId: string; as: "requester" | "admin" }) {
  useEffect(() => {
    void (as === "admin" ? markTicketReadByAdmin(ticketId) : markTicketRead(ticketId)).catch(
      () => undefined,
    );
  }, [ticketId, as]);
  return null;
}

/**
 * The reply box under a conversation: the requester's, or an
 * administrator's with the choice of a reply or an internal note.
 */
export function ReplyForm({
  ticketId,
  as,
  finished = false,
  publicSender = false,
}: {
  ticketId: string;
  as: "requester" | "admin";
  finished?: boolean;
  /** The ticket came from the public form: a reply goes by email only. */
  publicSender?: boolean;
}) {
  const words = useT("support");
  const locale = useLocale();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<MessageVisibility>("public");
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sending, startSending] = useTransition();
  const guard = useLeaveGuard(body.trim() !== "" && !sending, words.thread.unsaved, () =>
    setBody(""),
  );

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = supportSchemas(locale).reply.safeParse({ body });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setResult(null);
    startSending(async () => {
      const outcome = await (
        as === "admin"
          ? adminReplyToTicket(ticketId, { body, visibility })
          : replyToTicket(ticketId, { body })
      ).catch((): ActionResult => ({ ok: false, message: words.actions.offline }));
      setResult(outcome);
      if (outcome.ok) {
        setBody("");
        router.refresh();
      }
    });
  }

  const admin = as === "admin";
  const note = admin && visibility === "internal";
  return (
    <>
      {guard.dialog}
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={sending}
        className="rounded-xl border bg-surface p-4 shadow-card sm:p-5"
      >
        {admin && (
          <Segmented
            label={words.admin.replyMode}
            hideLabel
            name="reply-visibility"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: "public", label: words.admin.public },
              { value: "internal", label: words.admin.internal },
            ]}
            className="mb-4 max-w-xs"
          />
        )}
        <MessageField
          id={`reply-${ticketId}`}
          label={note ? words.admin.internal : admin ? words.admin.public : words.thread.replyLabel}
          hint={
            note
              ? words.admin.internalHint
              : admin
                ? publicSender
                  ? words.admin.publicByEmail
                  : words.admin.publicInApp
                : finished
                  ? words.thread.finished
                  : undefined
          }
          value={body}
          onChange={setBody}
          error={error}
          rows={4}
          max={supportLimits.message}
        />
        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            disabled={sending}
            aria-busy={sending}
            variant={note ? "secondary" : "default"}
          >
            {sending && <LoaderCircle className="animate-spin" aria-hidden />}
            {sending
              ? words.thread.sending
              : note
                ? words.admin.addNote
                : admin
                  ? words.admin.send
                  : words.thread.sendReply}
          </Button>
        </div>
        <ActionStatus result={result} />
      </form>
    </>
  );
}

/** The requester closes their conversation, after saying so. */
export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const t = useT("support").thread;
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();
  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setConfirmation({
            title: t.closeTitle,
            description: t.closeBody,
            confirmLabel: t.close,
            run: () => closeTicket(ticketId),
          })
        }
      >
        {t.close}
      </Button>
      <ActionStatus result={result} />
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onConfirm={(chosen) =>
          startTransition(async () => {
            const outcome = await chosen
              .run()
              .catch((): ActionResult => ({ ok: false, message: t.closeBody }));
            setResult(outcome);
            setConfirmation(null);
            if (outcome.ok) router.refresh();
          })
        }
        onCancel={() => setConfirmation(null)}
      />
    </div>
  );
}

/**
 * An administrator's choice of status, from those the ticket's kind has.
 * Choosing only changes the draft; nothing is saved until Save Changes.
 */
export function StatusControl({
  ticketId,
  kind,
  status,
}: {
  ticketId: string;
  kind: TicketKind;
  status: TicketStatus;
}) {
  const words = useT("support");
  const router = useRouter();
  const [draft, setDraft] = useState<TicketStatus>(status);
  const [saved, setSaved] = useState<TicketStatus>(status);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  // Set before the first await, so a second press in the same frame sends nothing.
  const inFlight = useRef(false);
  const dirty = draft !== saved;

  // A status saved from elsewhere becomes the saved one. It replaces the draft
  // only when nothing unsaved was chosen, so a choice is never lost silently.
  const [seen, setSeen] = useState(status);
  if (status !== seen) {
    setSeen(status);
    setSaved(status);
    if (!dirty) setDraft(status);
  }

  const guard = useLeaveGuard(dirty && !saving, words.admin.statusUnsaved, () => setDraft(saved));

  function save() {
    if (!dirty || inFlight.current) return;
    inFlight.current = true;
    const chosen = draft;
    setResult(null);
    startSaving(async () => {
      const outcome = await setTicketStatus(ticketId, { status: chosen })
        .catch((): ActionResult => ({ ok: false, message: words.actions.offline }))
        .finally(() => {
          inFlight.current = false;
        });
      setResult(outcome);
      if (outcome.ok) {
        setSaved(chosen);
        router.refresh();
      }
    });
  }

  return (
    <div aria-busy={saving}>
      {guard.dialog}
      <p className="mb-2 text-sm font-medium">{words.admin.changeStatus}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Select
          label={words.admin.changeStatus}
          value={draft}
          onChange={(next) => {
            setDraft(next as TicketStatus);
            setResult(null);
          }}
          disabled={saving}
          options={statusesFor(kind).map((option) => ({
            value: option,
            label: words.statuses[option],
          }))}
          className="min-w-0 flex-1"
        />
        <Button type="button" onClick={save} disabled={!dirty || saving} aria-busy={saving}>
          {saving && <LoaderCircle className="animate-spin" aria-hidden />}
          {saving ? words.admin.savingStatus : words.admin.saveStatus}
        </Button>
      </div>
      <ActionStatus result={result} />
    </div>
  );
}

/** A bug report's or feature request's extra lines, as they were written. */
export function Details({
  title,
  details,
}: {
  title: string;
  details: readonly (readonly [string, string])[];
}) {
  return (
    <section aria-label={title} className="rounded-xl border bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="mt-3 space-y-3 text-sm">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words whitespace-pre-wrap">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
