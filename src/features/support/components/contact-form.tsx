"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, LoaderCircle } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/features/settings/components/text-field";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { submitContact } from "../actions";
import { supportLimits } from "../model";
import { supportSchemas } from "../schemas";

const empty = { name: "", email: "", subject: "", message: "" };

/**
 * The public contact form. Anyone may send it; the server checks it again,
 * limits how often, and saves it before anything is mailed. A hidden field
 * and the time since the form was opened tell a robot from a person; neither
 * is shown or explained.
 */
export function ContactForm() {
  const t = useT("support");
  const locale = useLocale();
  const [values, setValues] = useState(empty);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sent, setSent] = useState<{ mailed: boolean } | null>(null);
  const [sending, startSending] = useTransition();
  // Kept across a retry, so sending again after a lost answer is the same message.
  const id = useRef<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const dirty = !sent && Object.values(values).some((value) => value.trim() !== "");
  const guard = useLeaveGuard(dirty && !sending, t.compose.unsaved);

  function set(field: keyof typeof empty, value: string) {
    startedAt.current ??= Date.now();
    setValues((was) => ({ ...was, [field]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { ...values, website, startedAt: startedAt.current ?? Date.now() };
    const parsed = supportSchemas(locale).contact.safeParse(input);
    if (!parsed.success) {
      const found: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        found[String(issue.path[0] ?? "form")] ??= issue.message;
      setErrors(found);
      setResult(found.form ? { ok: false, message: found.form } : null);
      return;
    }
    setErrors({});
    setResult(null);
    id.current ??= crypto.randomUUID();
    startSending(async () => {
      const outcome = await submitContact(input, id.current).catch((): ActionResult => ({
        ok: false,
        message: t.actions.offline,
      }));
      if (outcome.ok) {
        guard.allowLeaving();
        setSent({ mailed: "mailed" in outcome && Boolean(outcome.mailed) });
        requestAnimationFrame(() => heading.current?.focus());
        return;
      }
      if ("errors" in outcome && outcome.errors)
        setErrors(outcome.errors as Record<string, string>);
      setResult(outcome);
    });
  }

  function another() {
    setValues(empty);
    setSent(null);
    setResult(null);
    id.current = null;
    startedAt.current = null;
  }

  if (sent) {
    return (
      <div className="animate-menu rounded-xl border bg-surface p-6 shadow-card sm:p-8">
        <CircleCheck className="size-8 text-primary" aria-hidden />
        <h2
          ref={heading}
          tabIndex={-1}
          className="mt-4 font-display text-2xl tracking-[-0.01em] outline-none"
        >
          {t.contact.sentTitle}
        </h2>
        <p role="status" className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
          {t.contact.sent} {sent.mailed && t.contact.sentEmailed}
        </p>
        <Button variant="outline" className="mt-6" onClick={another}>
          {t.contact.another}
        </Button>
      </div>
    );
  }

  return (
    <>
      {guard.dialog}
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={sending}
        className="rounded-xl border bg-surface p-5 shadow-card sm:p-8"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id="contact-name"
            name="name"
            label={t.fields.name}
            autoComplete="name"
            required
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            error={errors.name}
            maxLength={supportLimits.name}
          />
          <TextField
            id="contact-email"
            name="email"
            type="email"
            label={t.fields.email}
            autoComplete="email"
            inputMode="email"
            required
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
            error={errors.email}
            maxLength={supportLimits.email}
          />
          <TextField
            id="contact-subject"
            name="subject"
            label={t.fields.subject}
            className="sm:col-span-2"
            required
            value={values.subject}
            onChange={(event) => set("subject", event.target.value)}
            error={errors.subject}
            maxLength={supportLimits.subject}
          />
          <MessageField
            id="contact-message"
            label={t.fields.message}
            value={values.message}
            onChange={(value) => set("message", value)}
            error={errors.message}
            className="sm:col-span-2"
          />
        </div>

        {/* Hidden from people and from assistive technology; only a robot fills it in. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="contact-website">{t.fields.website}</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.8125rem] text-muted-foreground">{t.contact.privacy}</p>
          <Button type="submit" size="lg" disabled={sending} aria-busy={sending}>
            {sending && <LoaderCircle className="animate-spin" aria-hidden />}
            {sending ? t.contact.sending : t.contact.send}
          </Button>
        </div>
        <ActionStatus result={result} />
      </form>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        {t.contact.members}{" "}
        <Link href={routes.signIn} className="font-medium text-primary link-underline">
          {t.contact.membersLink}
        </Link>{" "}
        {t.contact.membersAfter}
      </p>
    </>
  );
}

/** A labelled message box whose error or hint is announced with it. */
export function MessageField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  className,
  rows = 6,
  max = supportLimits.message,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  className?: string;
  rows?: number;
  max?: number;
  required?: boolean;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        className="mt-2"
        rows={rows}
        required={required}
        maxLength={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.8125rem] font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
