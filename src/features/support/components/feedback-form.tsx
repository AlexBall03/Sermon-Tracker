"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bug, LoaderCircle, MessageCircle, MessageSquareText, Sparkles } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { TextField } from "@/features/settings/components/text-field";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { submitFeedback } from "../actions";
import { appTicketKinds, supportLimits, type TicketKind } from "../model";
import { supportSchemas } from "../schemas";
import { MessageField } from "./contact-form";
import { ScreenshotPicker, type Picked } from "./screenshot-picker";

const icons = { bug: Bug, feature: Sparkles, feedback: MessageSquareText, contact: MessageCircle };

const blank = { subject: "", message: "", steps: "", expected: "", area: "", useCase: "" };

/**
 * A new message to the team from Help & Feedback. The kind decides which few
 * extra lines are offered; only the subject and the message are required.
 * The account is the session's: nothing here names it. The page it was opened
 * from and the browser are sent with it, and the person is told so.
 */
export function FeedbackForm({
  initialKind,
  from,
  screenshots,
}: {
  initialKind: TicketKind;
  /** The address the person came from, if they came from within the application. */
  from: string | null;
  screenshots: boolean;
}) {
  const t = useT("support");
  const locale = useLocale();
  const router = useRouter();
  const [kind, setKind] = useState<TicketKind>(initialKind);
  const [values, setValues] = useState(blank);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sending, startSending] = useTransition();
  const id = useRef<string | null>(null);

  const dirty = Object.values(values).some((value) => value.trim() !== "") || picked.length > 0;
  const guard = useLeaveGuard(dirty && !sending, t.compose.unsaved);
  const uploading = picked.some((item) => item.state === "uploading");

  function set(field: keyof typeof blank, value: string) {
    setValues((was) => ({ ...was, [field]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      kind,
      ...values,
      pageUrl: from,
      userAgent: navigator.userAgent,
      attachmentIds: kind === "contact" ? [] : picked.flatMap((item) => (item.id ? [item.id] : [])),
    };
    const parsed = supportSchemas(locale).feedback.safeParse(input);
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        found[String(issue.path[0] ?? "form")] ??= issue.message;
      setErrors(found);
      setResult(null);
      return;
    }
    setErrors({});
    setResult(null);
    id.current ??= crypto.randomUUID();
    startSending(async () => {
      const outcome = await submitFeedback(input, id.current).catch((): ActionResult => ({
        ok: false,
        message: t.actions.offline,
      }));
      if (outcome.ok && "id" in outcome && outcome.id) {
        guard.allowLeaving();
        router.push(`${routes.support}/${outcome.id}`);
        return;
      }
      if ("errors" in outcome && outcome.errors)
        setErrors(outcome.errors as Record<string, string>);
      setResult(outcome);
    });
  }

  const messageLabel =
    kind === "bug"
      ? t.fields.bugMessage
      : kind === "feature"
        ? t.fields.featureMessage
        : t.fields.message;
  const optional = (label: string) => `${label} ${t.fields.optional}`;

  return (
    <>
      {guard.dialog}
      <form onSubmit={onSubmit} noValidate aria-busy={sending} className="space-y-7">
        <fieldset>
          <legend className="text-sm font-medium">{t.compose.kind}</legend>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {appTicketKinds.map((option) => {
              const Icon = icons[option];
              return (
                <label key={option} className="block min-w-0">
                  <input
                    type="radio"
                    name="kind"
                    value={option}
                    checked={kind === option}
                    onChange={() => setKind(option)}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex h-full cursor-pointer items-start gap-3 rounded-xl border bg-surface p-4 shadow-card transition-[border-color,background-color,box-shadow] duration-150 hover:border-foreground/30",
                      "peer-checked:border-primary peer-checked:bg-primary-soft/50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-5 shrink-0",
                        kind === option ? "text-primary" : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-[0.9375rem] font-semibold">
                        {t.kinds[option]}
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] leading-snug text-muted-foreground">
                        {t.kindHints[option]}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <TextField
          id="feedback-subject"
          name="subject"
          label={t.fields.subject}
          required
          value={values.subject}
          onChange={(event) => set("subject", event.target.value)}
          error={errors.subject}
          maxLength={supportLimits.subject}
        />
        <MessageField
          id="feedback-message"
          label={messageLabel}
          value={values.message}
          onChange={(value) => set("message", value)}
          error={errors.message}
        />

        {kind === "bug" && (
          <div className="grid animate-menu gap-5 sm:grid-cols-2">
            <MessageField
              id="feedback-steps"
              label={optional(t.fields.steps)}
              hint={t.fields.stepsHint}
              value={values.steps}
              onChange={(value) => set("steps", value)}
              error={errors.steps}
              rows={4}
              max={supportLimits.detail}
              required={false}
              className="sm:col-span-2"
            />
            <MessageField
              id="feedback-expected"
              label={optional(t.fields.expected)}
              value={values.expected}
              onChange={(value) => set("expected", value)}
              error={errors.expected}
              rows={3}
              max={supportLimits.detail}
              required={false}
            />
            <TextField
              id="feedback-area"
              name="area"
              label={optional(t.fields.area)}
              placeholder={t.fields.areaPlaceholder}
              value={values.area}
              onChange={(event) => set("area", event.target.value)}
              error={errors.area}
              maxLength={supportLimits.area}
            />
          </div>
        )}

        {kind === "feature" && (
          <MessageField
            id="feedback-use-case"
            label={optional(t.fields.useCase)}
            value={values.useCase}
            onChange={(value) => set("useCase", value)}
            error={errors.useCase}
            rows={3}
            max={supportLimits.detail}
            required={false}
            className="animate-menu"
          />
        )}

        {kind !== "contact" && (
          <ScreenshotPicker available={screenshots} picked={picked} onChange={setPicked} />
        )}

        <div className="flex flex-col-reverse gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-muted-foreground">{t.compose.context}</p>
          <Button type="submit" size="lg" disabled={sending || uploading} aria-busy={sending}>
            {(sending || uploading) && <LoaderCircle className="animate-spin" aria-hidden />}
            {sending ? t.compose.sending : uploading ? t.attachments.uploading : t.compose.send}
          </Button>
        </div>
        <ActionStatus result={result} />
      </form>
    </>
  );
}
