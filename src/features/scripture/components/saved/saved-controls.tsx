"use client";

import { Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SearchBox } from "@/features/ideas/components/library/library-search";
import { toggled } from "@/features/ideas/library-query";
import { useReading } from "@/features/preferences/client";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { booksIn, oldTestamentBooks } from "../../books";
import { highlightBackground } from "../../saved/highlight-style";
import { highlightColors, savedSorts, type SavedSort } from "../../saved/model";
import { clearSavedFilters, savedFilterCount } from "../../saved/saved-query";
import { translations, type TranslationId } from "../../translations";
import { useSavedScripture } from "./saved-state";

const allBooks = "all";
const allTranslations = "all";

/** The saved Scripture search box: the reference, the label, and the notes. */
export function SavedSearch({ className }: { className?: string }) {
  const { query, apply } = useSavedScripture();
  const t = useT("scripture").saved.controls;
  return (
    <SearchBox
      q={query.q}
      apply={apply as Parameters<typeof SearchBox>[0]["apply"]}
      label={t.searchLabel}
      landmark={t.landmark}
      placeholder={t.placeholder}
      className={className}
    />
  );
}

/**
 * The controls beside the search: the book, the translation where there is
 * more than one, the highlight colors, and the order. Each shows the filter in force on itself, so there is no second row
 * of chips to keep in step; one button lifts them all.
 */
export function SavedToolbar({ className }: { className?: string }) {
  const { query, apply } = useSavedScripture();
  const t = useT("scripture").saved.controls;
  const n = useT("scripture").navigator;
  const colors = useT("scripture").marks.colors;
  const locale = useLocale();
  const reading = useReading();
  const filtering = savedFilterCount(query) > 0;
  const books = booksIn(locale).map((book) => ({ value: String(book.id), label: book.name }));
  const bookGroups = [
    { label: t.everyBook, options: [{ value: allBooks, label: t.allBooks }] },
    { label: n.oldTestament, options: books.slice(0, oldTestamentBooks) },
    { label: n.newTestament, options: books.slice(oldTestamentBooks) },
  ];
  const sortOptions = savedSorts.map((value) => ({ value, label: t.sorts[value] }));

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select
        label={t.book}
        value={query.book === null ? allBooks : String(query.book)}
        onChange={(value) => apply({ book: value === allBooks ? null : Number(value) })}
        groups={bookGroups}
        className="w-44 max-sm:min-w-0 max-sm:flex-1"
      />
      {reading.translations.length > 1 && (
        // A saved passage belongs to the translation it was saved from.
        <Select
          label={t.translation}
          value={query.translation ?? allTranslations}
          onChange={(value) =>
            apply({ translation: value === allTranslations ? null : (value as TranslationId) })
          }
          options={[
            { value: allTranslations, label: t.allTranslations },
            ...reading.translations.map((id) => ({ value: id, label: translations[id].short })),
          ]}
          className="w-40 max-sm:min-w-0 max-sm:flex-1"
        />
      )}
      <Select
        label={t.sort}
        value={query.sort}
        onChange={(sort) => apply({ sort: sort as SavedSort })}
        options={sortOptions}
        className="w-44 max-sm:min-w-0 max-sm:flex-1"
      />

      <div
        role="group"
        aria-label={t.highlightColor}
        className="flex items-center gap-1 max-sm:basis-full"
      >
        <span className="mr-1 text-sm text-muted-foreground">{t.highlighted}</span>
        {highlightColors.map((color) => {
          const on = query.colors.includes(color);
          return (
            <button
              key={color}
              type="button"
              aria-pressed={on}
              aria-label={colors[color]}
              title={colors[color]}
              onClick={() => apply((current) => ({ colors: toggled(current.colors, color) }))}
              className="group/swatch grid size-9 place-items-center rounded-lg transition-colors duration-150 hover:bg-accent active:bg-foreground/10 pointer-coarse:size-11"
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border border-foreground/15 transition-[border-color,box-shadow] duration-150 group-hover/swatch:border-foreground/40 group-aria-pressed/swatch:border-foreground/60 group-aria-pressed/swatch:shadow-focus",
                  highlightBackground[color],
                )}
              >
                {/* The tick, not the ring alone, says a color is chosen. */}
                {on && <Check className="size-3.5 text-foreground" aria-hidden />}
              </span>
            </button>
          );
        })}
      </div>

      {filtering && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2.5 text-muted-foreground hover:text-foreground"
          onClick={() => apply((current) => clearSavedFilters(current))}
        >
          <X aria-hidden />
          {t.clearFilters}
        </Button>
      )}
    </div>
  );
}
