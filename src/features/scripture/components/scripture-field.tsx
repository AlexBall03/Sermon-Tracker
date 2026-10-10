"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BookOpen, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  formatReference,
  formatReferences,
  parseReference,
  referenceKey,
  type ScriptureReference,
} from "../reference";
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
  label?: string;
  className?: string;
};

const iconButton =
  "grid h-8 w-7 shrink-0 place-items-center text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-foreground/10 pointer-coarse:h-10 pointer-coarse:w-9";

/**
 * The Scripture selector: the references chosen so far, a box to type one
 * ("John 3:16", then Enter), and Browse for the panel. Everything it adds is
 * checked against the King James Bible first. Changing the list never touches
 * the rest of the form it sits in.
 */
export function ScriptureField({
  value,
  onChange,
  allowPrimary = false,
  max = 25,
  label = "Scripture",
  className,
}: ScriptureFieldProps) {
  const id = useId();
  const scripture = useScripture();
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
      return setMessage({
        text: `${formatReferences(references)} is already here.`,
        error: false,
      });
    }
    const room = max - value.length;
    if (room <= 0) {
      return setMessage({ text: `An idea can hold up to ${max} references.`, error: true });
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
        ? {
            text: `Only ${room} more would fit: an idea can hold up to ${max} references.`,
            error: true,
          }
        : { text: `${formatReferences(fresh)} added.`, error: false },
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
    setMessage({ text: `Changed to ${formatReferences(chosen)}.`, error: false });
  }

  function remove(reference: ScriptureReference) {
    const key = referenceKey(reference);
    onChange((current) => current.filter((item) => referenceKey(item) !== key));
    setMessage({ text: `${formatReference(reference)} removed.`, error: false });
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
    const result = parseReference(entry);
    if (!result.ok) return setMessage({ text: result.message, error: true });
    add([result.reference]);
    setEntry("");
  }

  return (
    <div className={className}>
      <Label htmlFor={`${id}-entry`}>{label}</Label>

      {value.length > 0 && (
        <ul aria-label="References" className="mt-2 flex flex-wrap gap-2">
          {value.map((reference) => {
            const name = formatReference(reference);
            return (
              <li
                key={referenceKey(reference)}
                className="flex max-w-full items-center rounded-md border bg-surface shadow-card"
              >
                <ReferenceChip
                  reference={reference}
                  onChange={(next) => replace(reference, next)}
                  onRemove={() => remove(reference)}
                  className="min-w-0 rounded-r-none border-0 shadow-none"
                />
                {allowPrimary && (
                  <button
                    type="button"
                    aria-pressed={reference.isPrimary}
                    aria-label={`${name}: main text`}
                    title={reference.isPrimary ? "Main text" : "Make this the main text"}
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
                  aria-label={`Remove ${name}`}
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
          placeholder="John 3:16, Romans 12:1-2, Psalm 23"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={message?.error ? true : undefined}
          aria-describedby={`${id}-message`}
        />
        {entry.trim() ? (
          <Button type="button" variant="outline" onClick={submitEntry}>
            Add
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={full}
            onClick={() =>
              scripture.openPanel({
                attach: {
                  label: "Add to idea",
                  repeatable: true,
                  onAttach: (references) => latestAdd.current(references),
                },
              })
            }
          >
            <BookOpen aria-hidden />
            Browse
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
        {message?.text ??
          (allowPrimary && value.length > 1 ? "The star marks the sermon's main text." : "")}
      </p>
    </div>
  );
}
