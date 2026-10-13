"use client";

import { useId, useRef, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAttendsPreachingClass } from "@/features/preferences/client";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { createContext, createVenue } from "../actions";
import { preachingLimits } from "../model";
import { preachingSchemas } from "../schemas";
import { suggestedContextOptions } from "../suggestions";

/** A venue or a context as a form offers it. A context has no locality. */
export type ReferenceOption = { id: string; name: string; locality?: string | null };

/** A venue as one line: its name, and where it is when that was said. */
export function referenceLabel({ name, locality }: ReferenceOption) {
  return locality ? `${name} · ${locality}` : name;
}

const none = "none";

type ReferenceFieldProps = {
  kind: "venue" | "context";
  /** The one chosen, or null for none. */
  value: string | null;
  onChange: (id: string | null) => void;
  options: readonly ReferenceOption[];
  /** One was made here, and is already chosen: the form adds it to what it offers. */
  onCreated: (option: ReferenceOption) => void;
  disabled?: boolean;
};

/**
 * Where a sermon was preached, or what kind of occasion it was: one of the
 * account's own, or none. A new one is made here, in place, so nothing typed
 * in the form around it is lost; the form then has it chosen.
 *
 * A context's suggestions are only words until one is picked: picking one
 * creates it, as writing the same name would. A name the account already has
 * chooses the one that has it.
 */
export function ReferenceField({
  kind,
  value,
  onChange,
  options,
  onCreated,
  disabled,
}: ReferenceFieldProps) {
  const id = useId();
  const locale = useLocale();
  const words = useT("preaching");
  const t = words.form;
  const venue = kind === "venue";
  const label = venue ? t.venue : t.context;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [locality, setLocality] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const attendsPreachingClass = useAttendsPreachingClass();

  const taken = new Set(options.map((option) => option.name.toLowerCase()));
  const suggestions = venue
    ? []
    : suggestedContextOptions(locale, { attendsPreachingClass }).filter(
        (item) => !taken.has(item.name.toLowerCase()),
      );

  function close() {
    setAdding(false);
    setName("");
    setLocality("");
    setProblem(null);
    opener.current?.focus();
  }

  function chosen(option: ReferenceOption) {
    onCreated(option);
    onChange(option.id);
    close();
  }

  /** The one that already has the name, where the account has it and this form offers it. */
  function existing(existingId: string | undefined, message: string) {
    const held = options.find((option) => option.id === existingId);
    if (!held) return setProblem(message);
    onChange(held.id);
    close();
  }

  async function create(given: string) {
    if (busy) return;
    const schemas = preachingSchemas(locale);
    setProblem(null);
    if (venue) {
      const parsed = schemas.venueInput.safeParse({ name: given, locality: locality || null });
      if (!parsed.success) return setProblem(parsed.error.issues[0]?.message ?? null);
      setBusy(true);
      const outcome = await createVenue(parsed.data).catch(() => null);
      setBusy(false);
      if (!outcome) return setProblem(words.offline);
      if (outcome.ok && outcome.venue) return chosen(outcome.venue);
      return existing(outcome.existingId, outcome.message);
    }
    const parsed = schemas.contextName.safeParse(given);
    if (!parsed.success) return setProblem(parsed.error.issues[0]?.message ?? null);
    setBusy(true);
    const outcome = await createContext(parsed.data).catch(() => null);
    setBusy(false);
    if (!outcome) return setProblem(words.offline);
    if (outcome.ok && outcome.context) return chosen(outcome.context);
    return existing(outcome.existingId, outcome.message);
  }

  /** Enter adds the new one instead of sending the form around it; Escape leaves only this. */
  function keys(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      void create(name);
    } else if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      close();
    }
  }

  return (
    <div className="min-w-0">
      <p className="text-sm leading-none font-medium">
        {label} <span className="font-normal text-muted-foreground">{t.optional}</span>
      </p>
      <div className="mt-2 flex gap-2">
        <Select
          label={label}
          value={value ?? none}
          onChange={(next) => onChange(next === none ? null : next)}
          options={[
            { value: none, label: t.none },
            ...options.map((option) => ({ value: option.id, label: referenceLabel(option) })),
          ]}
          disabled={disabled}
          className="min-w-0 flex-1"
        />
        <Button
          ref={opener}
          type="button"
          variant="outline"
          aria-expanded={adding}
          aria-controls={`${id}-new`}
          aria-label={venue ? t.newVenue : t.newContext}
          title={venue ? t.newVenue : t.newContext}
          disabled={disabled}
          onClick={() => (adding ? close() : setAdding(true))}
          className={cn("px-3", adding && "border-primary/70")}
        >
          <Plus aria-hidden />
        </Button>
      </div>

      {adding && (
        <div
          id={`${id}-new`}
          role="group"
          aria-label={venue ? t.newVenue : t.newContext}
          aria-busy={busy}
          className="mt-2 animate-menu rounded-lg border bg-muted/40 p-3"
        >
          {suggestions.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-muted-foreground">{t.suggestions}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {suggestions.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    disabled={busy}
                    onClick={() => void create(item.name)}
                    className="inline-flex h-8 max-w-full items-center rounded-md border border-input bg-surface px-2.5 text-sm font-medium transition-[border-color,background-color] duration-150 hover:border-foreground/30 active:bg-foreground/5 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-10"
                  >
                    <span className="truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Input
              autoFocus
              aria-label={venue ? t.venueName : t.contextName}
              placeholder={venue ? t.venueNamePlaceholder : t.contextNamePlaceholder}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setProblem(null);
              }}
              onKeyDown={keys}
              maxLength={venue ? preachingLimits.venueName : preachingLimits.contextName}
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${id}-problem` : undefined}
              className="h-9 min-w-0 flex-1 basis-40"
            />
            {venue && (
              <Input
                aria-label={t.locality}
                placeholder={t.localityPlaceholder}
                value={locality}
                onChange={(event) => setLocality(event.target.value)}
                onKeyDown={keys}
                maxLength={preachingLimits.venueLocality}
                autoComplete="off"
                enterKeyHint="done"
                className="h-9 min-w-0 flex-1 basis-40"
              />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy || !name.trim()}
                onClick={() => void create(name)}
              >
                {busy && <LoaderCircle className="animate-spin" aria-hidden />}
                {busy ? t.adding : t.add}
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={close}>
                {t.cancel}
              </Button>
            </div>
          </div>
          {problem && (
            <p
              id={`${id}-problem`}
              role="alert"
              className="mt-2 text-[0.8125rem] font-medium text-destructive"
            >
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
