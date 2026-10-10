"use client";

import { useId, useState } from "react";
import { Check, LoaderCircle, Plus, Tag, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tagLimits } from "../model";
import { createTag } from "../tag-actions";
import type { IdeaTag } from "../tags";

type TagPickerProps = {
  /** The tags on the idea. */
  value: IdeaTag[];
  /** Receives a function of the current list, as a state setter does. */
  onChange: (update: (current: IdeaTag[]) => IdeaTag[]) => void;
  /** Every tag the account has. */
  options: IdeaTag[];
  max?: number;
  label?: string;
  className?: string;
};

const byName = (a: IdeaTag, b: IdeaTag) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id);

/**
 * The tags on an idea: the ones it has, each removable, and a small panel to
 * find another or make a new one. It changes only the list it is given; the
 * idea is saved, tags and all, by the form around it. A tag made here exists
 * at once, whether or not the idea is then saved.
 */
export function TagPicker({
  value,
  onChange,
  options,
  max = tagLimits.perIdea,
  label = "Tags",
  className,
}: TagPickerProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [created, setCreated] = useState<IdeaTag[]>([]);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  // The account's tags, with any made here since the page was loaded.
  const known = new Map<string, IdeaTag>();
  for (const tag of [...options, ...created, ...value]) known.set(tag.id, tag);
  const all = [...known.values()].sort(byName);

  const chosen = new Set(value.map((tag) => tag.id));
  const full = value.length >= max;
  const wanted = text.replace(/\s+/g, " ").trim();
  const matches = wanted
    ? all.filter((tag) => tag.name.toLowerCase().includes(wanted.toLowerCase()))
    : all;
  const exact = all.find((tag) => tag.name.toLowerCase() === wanted.toLowerCase());

  function add(tag: IdeaTag) {
    if (chosen.has(tag.id)) return;
    if (full) return setMessage({ text: `An idea can hold up to ${max} tags.`, error: true });
    onChange((current) =>
      current.some((item) => item.id === tag.id) || current.length >= max
        ? current
        : [...current, tag].sort(byName),
    );
    setMessage({ text: `${tag.name} added.`, error: false });
  }

  function remove(tag: IdeaTag) {
    onChange((current) => current.filter((item) => item.id !== tag.id));
    setMessage({ text: `${tag.name} removed.`, error: false });
  }

  function toggle(tag: IdeaTag) {
    if (chosen.has(tag.id)) remove(tag);
    else add(tag);
  }

  async function create() {
    if (creating || !wanted) return;
    if (full) return setMessage({ text: `An idea can hold up to ${max} tags.`, error: true });
    setCreating(true);
    setMessage(null);
    const outcome = await createTag(wanted).catch(() => ({
      ok: false as const,
      message: "The tag could not be created. Check your connection and try again.",
      tag: undefined,
    }));
    setCreating(false);
    // A refusal leaves what was typed in the box.
    if (!outcome.ok || !outcome.tag) return setMessage({ text: outcome.message, error: true });
    const tag = outcome.tag;
    setCreated((current) => [...current, tag]);
    add(tag);
    setText("");
  }

  return (
    <div className={className}>
      <p id={`${id}-label`} className="text-sm leading-none font-medium">
        {label}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {value.length > 0 && (
          <ul aria-labelledby={`${id}-label`} className="contents">
            {value.map((tag) => (
              <li
                key={tag.id}
                className="flex h-8 max-w-full min-w-0 items-center rounded-md border bg-surface shadow-card pointer-coarse:h-10"
              >
                <span className="flex min-w-0 items-center gap-1.5 pr-1.5 pl-2.5 text-sm font-medium">
                  <Tag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{tag.name}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove tag ${tag.name}`}
                  onClick={() => remove(tag)}
                  className="grid h-full w-7 shrink-0 place-items-center rounded-r-md border-l text-muted-foreground transition-colors duration-150 hover:text-destructive active:bg-foreground/10 pointer-coarse:w-9"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setText("");
          }}
        >
          <PopoverTrigger
            className={buttonVariants({ variant: "outline", size: "sm", className: "px-3" })}
          >
            <Plus aria-hidden />
            {value.length === 0 ? "Add tags" : "Add"}
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3">
            <PopoverTitle className="sr-only">Choose tags</PopoverTitle>
            <Input
              aria-label="Find or create a tag"
              placeholder="Find or create a tag"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                if (message?.error) setMessage(null);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                // Enter chooses or creates; it never submits the form around the picker.
                event.preventDefault();
                if (!wanted) return;
                if (exact) toggle(exact);
                else void create();
              }}
              maxLength={tagLimits.name}
              autoComplete="off"
              enterKeyHint="done"
              className="h-9"
            />
            <ul
              aria-label="Your tags"
              className="mt-2 max-h-56 scroll-quiet overflow-y-auto overscroll-contain"
            >
              {matches.map((tag) => {
                const on = chosen.has(tag.id);
                return (
                  <li key={tag.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      disabled={full && !on}
                      onClick={() => toggle(tag)}
                      className={cn(
                        "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent active:bg-foreground/10 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11",
                        on && "font-semibold text-primary",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                      {on && <Check className="size-4 shrink-0" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
            {all.length === 0 && !wanted && (
              <p className="px-1 py-2 text-sm leading-relaxed text-muted-foreground">
                You have no tags yet. Type a name to create the first.
              </p>
            )}
            {wanted && !exact && (
              <button
                type="button"
                disabled={creating || full}
                aria-busy={creating}
                onClick={() => void create()}
                className="mt-1 flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors duration-150 hover:bg-accent active:bg-foreground/10 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11"
              >
                {creating ? (
                  <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-4 shrink-0 text-primary" aria-hidden />
                )}
                <span className="min-w-0 truncate">
                  {creating ? "Creating…" : `Create “${wanted}”`}
                </span>
              </button>
            )}
            {message?.error && (
              <p role="alert" className="mt-2 px-1 text-[0.8125rem] font-medium text-destructive">
                {message.text}
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="mt-1.5 min-h-5 text-[0.8125rem] text-muted-foreground"
      >
        {message && !message.error
          ? message.text
          : value.length === 0
            ? "No tags on this idea."
            : ""}
      </p>
    </div>
  );
}
