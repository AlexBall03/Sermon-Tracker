"use client";

import { useState } from "react";
import { Check, Eraser, Highlighter, Lightbulb, LoaderCircle, Star } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { saveFavorite } from "../../saved/actions";
import { highlightBackground } from "../../saved/highlight-style";
import {
  highlightColors,
  savedLimits,
  type ChapterMarks,
  type FavoriteSummary,
  type HighlightColor,
} from "../../saved/model";
import { savedHref } from "../../saved/saved-query";
import { sameVerses, type VerseRef } from "../../saved/verse-set";
import type { TranslationId } from "../../translations";
import { highlightVerses, putFavorite } from "../../use-chapter-marks";
import { toolbarAction, toolbarLabel } from "../selection-toolbar";

// As the toolbar's own buttons: a word beside the icon where there is room, the icon alone where there is not.
const action = toolbarAction;
const label = toolbarLabel;

type SelectionActionsProps = {
  /** The translation the verses were selected in, which is the one they are marked in. */
  translation: TranslationId;
  book: number;
  chapter: number;
  /** The verses selected, in order. Never empty: the toolbar is not shown for nothing. */
  verses: readonly number[];
  marks: ChapterMarks;
  /** Says why an action failed, in the toolbar, or clears what was said with null. */
  onProblem: (message: string | null) => void;
  /** Opens a favorite to be changed or removed. */
  onManage: (favorite: FavoriteSummary) => void;
  /** Opens the way to put the selection on an idea. Without it, that action is not offered. */
  onAttach?: () => void;
};

/** The colors the selected verses carry, and whether any of them carries none. */
export function highlightState(verses: readonly number[], highlights: ChapterMarks["highlights"]) {
  const present = highlightColors.filter((color) =>
    verses.some((verse) => highlights[verse] === color),
  );
  const bare = verses.some((verse) => !highlights[verse]);
  return {
    present,
    /** The one color every selected verse has, or null. */
    uniform: present.length === 1 && !bare ? present[0] : null,
    /** More than one state among the verses: two colors, or some colored and some not. */
    mixed: present.length > 1 || (present.length === 1 && bare),
    any: present.length > 0,
  };
}

/**
 * What is kept from a selection: highlighting the selected verses, saving
 * them as a favorite, and putting them on an idea. Each acts on exactly the
 * verses selected and on no others, and leaves the selection as it is.
 */
export function SelectionActions({
  translation,
  book,
  chapter,
  verses,
  marks,
  onProblem,
  onManage,
  onAttach,
}: SelectionActionsProps) {
  const t = useT("scripture").marks;
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const state = highlightState(verses, marks.highlights);
  const selected: VerseRef[] = verses.map((verse) => ({ book, chapter, verse }));
  /** The favorite that is exactly this selection, if it has been saved. */
  const saved = marks.favorites.find((favorite) => sameVerses(favorite.verses, selected));

  function highlight(color: HighlightColor | null) {
    setPicking(false);
    onProblem(null);
    // Shown at once; said only if the server would not keep it, by which time it is undone.
    void highlightVerses(translation, book, chapter, verses, color, t.highlightOffline).then(
      (result) => {
        if (!result.ok) onProblem(result.message);
      },
    );
  }

  async function favorite() {
    if (saved) return onManage(saved);
    if (saving) return;
    if (selected.length > savedLimits.verses) {
      return onProblem(t.tooManyVerses(savedLimits.verses));
    }
    onProblem(null);
    setSaving(true);
    const result = await saveFavorite({ translation, verses: selected }).catch(() => ({
      ok: false,
      message: t.favoriteOffline,
      favorite: undefined,
    }));
    setSaving(false);
    if (!result.ok || !result.favorite) return onProblem(result.message);
    putFavorite(result.favorite);
    toast({ message: result.message, action: { label: t.view, href: savedHref() } });
  }

  return (
    <>
      <Popover open={picking} onOpenChange={setPicking}>
        <PopoverTrigger
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), action)}
          aria-label={
            state.uniform
              ? t.highlightIs(state.uniform)
              : state.mixed
                ? t.highlightMixed
                : t.highlight
          }
        >
          <span className="relative grid place-items-center">
            <Highlighter aria-hidden />
            {/* The color in force rides on the icon, so the button says it before it is opened. */}
            {state.any && (
              <span
                aria-hidden
                data-highlight-dot
                className={cn(
                  "absolute -right-1 -bottom-1 size-2 rounded-full ring-2 ring-surface-raised",
                  state.uniform
                    ? highlightBackground[state.uniform]
                    : "bg-[conic-gradient(var(--highlight-yellow),var(--highlight-green),var(--highlight-blue),var(--highlight-red),var(--highlight-yellow))]",
                )}
              />
            )}
          </span>
          <span className={label}>{t.highlight}</span>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" className="w-64 p-3" initialFocus={false}>
          <p className="text-xs font-semibold text-muted-foreground">{t.highlight}</p>
          <div role="group" aria-label={t.highlightColor} className="mt-2 grid grid-cols-4 gap-1">
            {highlightColors.map((color) => {
              const on = state.uniform === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={on}
                  onClick={() => highlight(color)}
                  className="group/swatch flex flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-pressed:text-foreground"
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full border border-foreground/15 transition-[border-color,box-shadow] duration-150 group-hover/swatch:border-foreground/40 group-aria-pressed/swatch:border-foreground/60 group-aria-pressed/swatch:shadow-focus",
                      highlightBackground[color],
                    )}
                  >
                    {on && <Check className="size-4 text-foreground" aria-hidden />}
                  </span>
                  {t.colors[color]}
                </button>
              );
            })}
          </div>
          <p role="status" className="mt-2 min-h-4 text-xs text-muted-foreground">
            {state.mixed
              ? state.present.length > 1
                ? t.severalColors(state.present)
                : t.someColored(state.present)
              : state.uniform
                ? t.highlighted(state.uniform)
                : t.notHighlighted}
          </p>
          {state.any && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 -mb-1 -ml-1.5 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => highlight(null)}
            >
              <Eraser aria-hidden />
              {t.removeHighlight}
            </Button>
          )}
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(action, saved && "text-foreground")}
        aria-busy={saving}
        aria-haspopup={saved ? "dialog" : undefined}
        aria-label={saved ? t.savedManage : t.addFavorite}
        onClick={() => void favorite()}
      >
        {saving ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <Star
            className={cn("transition-colors duration-200", saved && "fill-current text-gold")}
            aria-hidden
          />
        )}
        <span className={label}>{saved ? t.saved : t.favorite}</span>
      </Button>

      {onAttach && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={action}
          aria-haspopup="dialog"
          aria-label={t.addToIdea}
          title={t.addToIdea}
          onClick={() => {
            onProblem(null);
            onAttach();
          }}
        >
          <Lightbulb aria-hidden />
          {/* One word, as its neighbours are: six of them share a line. Its name says the rest. */}
          <span className={label}>{t.idea}</span>
        </Button>
      )}
    </>
  );
}

/**
 * The favorites that hold any of the selected verses, other than the one
 * that is exactly the selection: each opens to be changed or removed. Nothing
 * is shown when there are none.
 */
export function SelectionFavorites({
  book,
  chapter,
  verses,
  marks,
  onManage,
}: Omit<SelectionActionsProps, "onProblem" | "onAttach">) {
  const t = useT("scripture").marks;
  const chosen = new Set(verses);
  const selected: VerseRef[] = verses.map((verse) => ({ book, chapter, verse }));
  const holding = marks.favorites.filter(
    (favorite) =>
      !sameVerses(favorite.verses, selected) &&
      favorite.verses.some(
        (verse) => verse.book === book && verse.chapter === chapter && chosen.has(verse.verse),
      ),
  );
  if (holding.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pt-1.5 text-[0.8125rem]">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Star className="size-3 fill-current text-gold" aria-hidden />
        {t.savedIn}
      </span>
      <ul aria-label={t.favoritesWithVerses} className="contents">
        {holding.map((favorite) => (
          <li key={favorite.id} className="min-w-0">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={t.manage(favorite.label ?? favorite.reference)}
              onClick={() => onManage(favorite)}
              className="max-w-full truncate rounded-sm font-medium text-primary link-underline"
            >
              {favorite.label ?? favorite.reference}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
