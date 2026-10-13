"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown, ExternalLink, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useReading } from "@/features/preferences/client";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { readerHref, referenceLocation, type ReferenceOrigin } from "../reader-location";
import {
  countReferenceVerses,
  formatReference,
  formatReferences,
  parseReference,
  referenceKey,
  type ScriptureReference,
} from "../reference";
import { translations } from "../translations";
import { Passage, passageLimits } from "./passage-text";
import { ReferenceChip } from "./reference-chip";
import { useScripture } from "./scripture-provider";

/** A chosen passage. `isPrimary` marks a sermon's main text. */
export type FieldReference = ScriptureReference & { isPrimary: boolean };

type ScriptureFieldProps = {
  value: FieldReference[];
  /** Receives a function of the current list, as a state setter does. */
  onChange: (update: (current: FieldReference[]) => FieldReference[]) => void;
  /** Sermons have a main text; other ideas simply have references. */
  allowPrimary?: boolean;
  /** The most references the field will hold. */
  max?: number;
  /**
   * How the chosen references are shown. `chips` is a compact line of them,
   * each opening its preview; `rows` is one to a line, each opening its text
   * in place, for the page where an idea is read as well as written.
   */
  layout?: "chips" | "rows";
  /** The idea or outline being edited, so a reference opened in the Bible can lead back to it. */
  origin?: ReferenceOrigin;
  label?: string;
  /** What the panel's button says when a passage is being added. "Add to idea" when omitted. */
  attachLabel?: string;
  /** What to say when it holds as many as it may, where that is not an idea's limit. */
  fullMessage?: (max: number) => string;
  className?: string;
};

const iconButton =
  "grid h-8 w-7 shrink-0 place-items-center text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-foreground/10 pointer-coarse:h-10 pointer-coarse:w-9";

/** A row shows this many verses in place; the panel has the rest. */
const rowVerses = passageLimits.row;

const rowButton =
  "grid h-11 w-9 shrink-0 place-items-center text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:w-11";

/**
 * One reference on a line of its own. Closed, it is only its name and what
 * can be done with it, so a long list stays short. Opened, its text is read
 * beneath it, without leaving the idea. The text is fetched when it is first
 * opened and not before.
 */
function ReferenceRow({
  reference,
  allowPrimary,
  origin,
  onChange,
  onRemove,
  onTogglePrimary,
}: {
  reference: FieldReference;
  allowPrimary: boolean;
  origin?: ReferenceOrigin;
  onChange: (references: ScriptureReference[]) => void;
  onRemove: () => void;
  onTogglePrimary: () => void;
}) {
  const id = useId();
  const scripture = useScripture();
  const t = useT("scripture").field;
  const locale = useLocale();
  const { translation } = useReading();
  const [open, setOpen] = useState(false);
  // Once opened, the text stays mounted, so closing and opening again is only the motion.
  const [opened, setOpened] = useState(false);
  const name = formatReference(reference, locale);
  const more = countReferenceVerses(reference) > rowVerses;
  const read = () =>
    scripture.openPanel({ reference, attach: { label: t.updateReference, onAttach: onChange } });

  return (
    <li className="min-w-0 overflow-hidden rounded-lg border bg-surface shadow-card transition-[border-color] duration-150 focus-within:border-primary/70 hover:border-primary/70">
      <div className="flex items-stretch">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-text`}
          aria-label={t.togglePassage(name, open)}
          onClick={() => {
            setOpen((shown) => !shown);
            setOpened(true);
          }}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 px-3 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <span className="min-w-0 truncate font-serif text-[0.9375rem] font-medium italic">
            {name}
          </span>
          {allowPrimary && reference.isPrimary && (
            <span className="shrink-0 text-xs font-semibold text-gold-ink">{t.mainText}</span>
          )}
        </button>
        <Link
          href={readerHref(referenceLocation(reference, origin))}
          aria-label={t.openNamed(name)}
          title={t.openInTheBible}
          className={cn(rowButton, "border-l")}
        >
          <ExternalLink className="size-4" aria-hidden />
        </Link>
        {allowPrimary && (
          <button
            type="button"
            aria-pressed={reference.isPrimary}
            aria-label={t.mainTextOf(name)}
            title={reference.isPrimary ? t.mainText : t.makeMain}
            onClick={onTogglePrimary}
            className={cn(rowButton, "border-l", reference.isPrimary && "text-gold-ink")}
          >
            <Star className={cn("size-4", reference.isPrimary && "fill-current")} aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-label={t.removeNamed(name)}
          title={t.remove}
          onClick={onRemove}
          className={cn(rowButton, "border-l hover:text-destructive")}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {/* The height is animated through the grid row, from nothing to whatever the text needs. */}
      <div
        id={`${id}-text`}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {opened && (
            <div className="border-t px-2 pt-3 pb-3">
              <Passage reference={reference} limit={rowVerses} onMore={read} />
              <div className="mt-3 flex flex-wrap items-center gap-2 px-2">
                <Button type="button" variant="outline" size="sm" onClick={read}>
                  <BookOpen aria-hidden />
                  {more ? t.readAllOrChange : t.readOrChange}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {translations[translation].name}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * The Scripture selector: the references chosen so far, a box to type one
 * ("John 3:16", then Enter), and Browse for the panel. Everything it adds is
 * checked against the Bible first. Changing the list never touches
 * the rest of the form it sits in.
 */
export function ScriptureField({
  value,
  onChange,
  allowPrimary = false,
  max = 25,
  layout = "chips",
  origin,
  label,
  attachLabel,
  fullMessage,
  className,
}: ScriptureFieldProps) {
  const id = useId();
  const scripture = useScripture();
  const t = useT("scripture").field;
  const locale = useLocale();
  const named = (references: readonly ScriptureReference[]) => formatReferences(references, locale);
  const [entry, setEntry] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const full = value.length >= max;

  const has = (list: FieldReference[], reference: ScriptureReference) =>
    list.some((item) => referenceKey(item) === referenceKey(reference));

  // Each change is applied to the list as it stands when it lands, not as it
  // stood when the panel was opened: the form beside an open panel stays live.
  function add(references: ScriptureReference[]) {
    const fresh = references.filter((reference) => !has(value, reference));
    if (fresh.length === 0) {
      return setMessage({ text: t.alreadyHere(named(references)), error: false });
    }
    const room = max - value.length;
    if (room <= 0) {
      return setMessage({ text: (fullMessage ?? t.full)(max), error: true });
    }
    onChange((current) => {
      const next = [...current];
      for (const reference of fresh) {
        if (has(next, reference) || next.length >= max) continue;
        // A sermon's first reference is its main text until another is chosen.
        const isPrimary = allowPrimary && !next.some((item) => item.isPrimary);
        next.push({ ...reference, isPrimary });
      }
      return next;
    });
    setMessage(
      fresh.length > room
        ? { text: fullMessage ? fullMessage(max) : t.onlyRoom(room, max), error: true }
        : { text: t.added(named(fresh)), error: false },
    );
  }

  /** Puts the chosen passages where the original was; the first keeps its main-text mark. */
  function replace(original: ScriptureReference, chosen: ScriptureReference[]) {
    const from = referenceKey(original);
    if (chosen.length === 1 && referenceKey(chosen[0]) === from) return;
    onChange((current) => {
      const at = current.findIndex((item) => referenceKey(item) === from);
      if (at < 0) return current;
      const others = current.filter((_, index) => index !== at);
      const fresh = chosen
        .filter((reference) => !has(others, reference))
        .slice(0, max - others.length)
        .map((reference, index) => ({
          ...reference,
          isPrimary: index === 0 && current[at].isPrimary,
        }));
      return [...current.slice(0, at), ...fresh, ...current.slice(at + 1)];
    });
    setMessage({ text: t.changed(named(chosen)), error: false });
  }

  function remove(reference: ScriptureReference) {
    const key = referenceKey(reference);
    onChange((current) => current.filter((item) => referenceKey(item) !== key));
    setMessage({ text: t.removed(formatReference(reference, locale)), error: false });
  }

  function togglePrimary(reference: ScriptureReference) {
    const key = referenceKey(reference);
    onChange((current) =>
      current.map((item) => ({
        ...item,
        isPrimary: referenceKey(item) === key && !item.isPrimary,
      })),
    );
  }

  // The panel can stay open across several additions, so it calls whichever
  // `add` is current, not the one from the render in which it was opened.
  const latestAdd = useRef(add);
  useEffect(() => {
    latestAdd.current = add;
  });

  function submitEntry() {
    if (!entry.trim()) return;
    const result = parseReference(entry, locale);
    if (!result.ok) return setMessage({ text: result.message, error: true });
    add([result.reference]);
    setEntry("");
  }

  return (
    <div className={className}>
      <Label htmlFor={`${id}-entry`}>{label ?? t.label}</Label>

      {value.length > 0 && layout === "rows" && (
        <ul aria-label={t.references} className="mt-2 space-y-2">
          {value.map((reference) => (
            <ReferenceRow
              key={referenceKey(reference)}
              reference={reference}
              allowPrimary={allowPrimary}
              origin={origin}
              onChange={(next) => replace(reference, next)}
              onRemove={() => remove(reference)}
              onTogglePrimary={() => togglePrimary(reference)}
            />
          ))}
        </ul>
      )}
      {value.length > 0 && layout === "chips" && (
        <ul aria-label={t.references} className="mt-2 flex flex-wrap gap-2">
          {value.map((reference) => {
            const name = formatReference(reference, locale);
            return (
              <li
                key={referenceKey(reference)}
                className="flex max-w-full items-center rounded-md border bg-surface shadow-card"
              >
                <ReferenceChip
                  reference={reference}
                  onChange={(next) => replace(reference, next)}
                  onRemove={() => remove(reference)}
                  origin={origin}
                  className="min-w-0 rounded-r-none border-0 shadow-none"
                />
                {allowPrimary && (
                  <button
                    type="button"
                    aria-pressed={reference.isPrimary}
                    aria-label={t.mainTextOf(name)}
                    title={reference.isPrimary ? t.mainText : t.makeMain}
                    onClick={() => togglePrimary(reference)}
                    className={cn(iconButton, "border-l", reference.isPrimary && "text-gold-ink")}
                  >
                    <Star
                      className={cn("size-3.5", reference.isPrimary && "fill-current")}
                      aria-hidden
                    />
                  </button>
                )}
                <button
                  type="button"
                  aria-label={t.removeNamed(name)}
                  onClick={() => remove(reference)}
                  className={cn(iconButton, "rounded-r-md border-l hover:text-destructive")}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2 flex gap-2">
        <Input
          id={`${id}-entry`}
          value={entry}
          onChange={(event) => {
            setEntry(event.target.value);
            if (message?.error) setMessage(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Enter adds the reference; it never submits the form around it.
            event.preventDefault();
            submitEntry();
          }}
          placeholder={t.placeholder}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={message?.error ? true : undefined}
          aria-describedby={`${id}-message`}
        />
        {entry.trim() ? (
          <Button type="button" variant="outline" onClick={submitEntry}>
            {t.add}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={full}
            onClick={() =>
              scripture.openPanel({
                attach: {
                  label: attachLabel ?? t.addToIdea,
                  repeatable: true,
                  onAttach: (references) => latestAdd.current(references),
                },
              })
            }
          >
            <BookOpen aria-hidden />
            {t.browse}
          </Button>
        )}
      </div>
      <p
        id={`${id}-message`}
        role="status"
        aria-live="polite"
        className={cn(
          "mt-1.5 min-h-5 text-[0.8125rem]",
          message?.error ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {message?.text ?? (allowPrimary && value.length > 1 ? t.starHint : "")}
      </p>
    </div>
  );
}
