"use client";

import { useId } from "react";
import { CircleAlert, Layers, MapPin, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Group, Toggle } from "@/features/ideas/components/library/library-filters";
import { SearchBox } from "@/features/ideas/components/library/library-search";
import { invertedRange, startOfDay, toggled } from "@/features/ideas/library-query";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { formatDay } from "../dates";
import { clearHistoryFilters, historyFilterCount } from "../history-query";
import {
  actualFormats,
  historyFilterLimit,
  historySorts,
  timeOfDayFilters,
  type HistorySort,
  type TimeOfDayFilter,
} from "../model";
import type { HistoryQuery } from "../schemas";
import { useHistory } from "./history-state";
import { referenceLabel } from "./reference-field";

export const historyFiltersPanelId = "history-filters";

/** The history search box: the sermon's title, the venue and its locality, and the context. */
export function HistorySearch({ className }: { className?: string }) {
  const { query, apply } = useHistory();
  const t = useT("preaching").history.search;
  return (
    <SearchBox
      q={query.q}
      apply={apply as Parameters<typeof SearchBox>[0]["apply"]}
      label={t.label}
      landmark={t.landmark}
      placeholder={t.placeholder}
      className={className}
    />
  );
}

/**
 * The controls beside the search: open the filters, choose the order, and
 * manage venues and contexts. On a narrow screen they wrap onto a second row;
 * nothing is hidden behind a menu.
 */
export function HistoryToolbar({ className }: { className?: string }) {
  const { query, apply, filtersOpen, setFiltersOpen, manage } = useHistory();
  const t = useT("preaching").history;
  const active = historyFilterCount(query);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        aria-expanded={filtersOpen}
        aria-controls={historyFiltersPanelId}
        onClick={() => setFiltersOpen(!filtersOpen)}
        className={cn("px-3.5", filtersOpen && "border-primary/70")}
      >
        <SlidersHorizontal aria-hidden />
        {/* A phone has room for the icon and the count; the name is still read out. */}
        <span className="max-sm:sr-only">{t.toolbar.filters}</span>
        {active > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-soft px-1.5 text-xs font-semibold text-primary tabular-nums">
            {active}
            <span className="sr-only">{t.toolbar.active}</span>
          </span>
        )}
      </Button>

      <Select
        label={t.toolbar.sort}
        value={query.sort}
        onChange={(sort) => apply({ sort: sort as HistorySort })}
        options={historySorts.map((value) => ({ value, label: t.sorts[value] }))}
        className="w-44 max-sm:min-w-0 max-sm:flex-1"
      />

      <div className="flex items-center gap-2 sm:ml-auto">
        <Button
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          aria-label={t.toolbar.manageVenues}
          onClick={() => manage("venue")}
          className="px-3.5"
        >
          <MapPin aria-hidden />
          <span className="max-sm:sr-only">{t.toolbar.venues}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          aria-label={t.toolbar.manageContexts}
          onClick={() => manage("context")}
          className="px-3.5"
        >
          <Layers aria-hidden />
          <span className="max-sm:sr-only">{t.toolbar.contexts}</span>
        </Button>
      </div>
    </div>
  );
}

/** The dates preached between. Each end is optional, and both are included. */
function DateRange({ query }: { query: HistoryQuery }) {
  const id = useId();
  const { apply } = useHistory();
  const t = useT("preaching").history.filters;
  const inverted = invertedRange(query.from, query.through);
  const field = (key: "from" | "through", text: string, limit: { min?: string; max?: string }) => (
    <div className="min-w-0 flex-1">
      <label htmlFor={`${id}-${key}`} className="text-[0.8125rem] text-muted-foreground">
        {text}
      </label>
      <Input
        id={`${id}-${key}`}
        type="date"
        value={query[key] ?? ""}
        // An empty box lifts that end; a half-typed date is not sent at all.
        onChange={(event) => {
          const value = event.target.value;
          if (value === "") apply({ [key]: null });
          else if (startOfDay(value)) apply({ [key]: value });
        }}
        aria-invalid={inverted ? true : undefined}
        aria-describedby={inverted ? `${id}-error` : undefined}
        className="mt-1"
        {...limit}
      />
    </div>
  );

  return (
    <Group label={t.dates}>
      <div className="flex gap-2">
        {field("from", t.from, { max: query.through ?? undefined })}
        {field("through", t.to, { min: query.from ?? undefined })}
      </div>
      {inverted && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 flex items-start gap-1.5 text-[0.8125rem] font-medium text-destructive"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t.inverted}
        </p>
      )}
    </Group>
  );
}

/**
 * The filters, beneath the toolbar. Each choice goes straight to the address
 * and the results follow; there is no Apply button to forget. Within a group
 * any chosen value will do, and between groups every one must hold.
 */
export function HistoryFilters() {
  const { query, apply, venues, contexts, filtersOpen } = useHistory();
  const words = useT("preaching");
  const t = words.history.filters;
  const formats = useT("ideas").formats;
  const active = historyFilterCount(query);
  const timeLabel = (value: TimeOfDayFilter) =>
    value === "unspecified" ? words.timeNotSpecified : words.timesOfDay[value];
  const venuesFull = query.venueIds.length >= historyFilterLimit;
  const contextsFull = query.contextIds.length >= historyFilterLimit;

  return (
    <section
      id={historyFiltersPanelId}
      aria-label={t.panel}
      hidden={!filtersOpen}
      className={cn(
        "mt-3 rounded-xl border bg-surface p-4 shadow-card sm:p-5",
        filtersOpen && "animate-menu",
      )}
    >
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
        <DateRange query={query} />

        <Group label={t.time}>
          <div className="flex flex-wrap gap-2">
            {timeOfDayFilters.map((time) => (
              <Toggle
                key={time}
                pressed={query.timesOfDay.includes(time)}
                onToggle={() =>
                  apply((current) => ({ timesOfDay: toggled(current.timesOfDay, time) }))
                }
              >
                {timeLabel(time)}
              </Toggle>
            ))}
          </div>
        </Group>

        <Group label={t.format}>
          <div className="flex flex-wrap gap-2">
            {actualFormats.map((format) => (
              <Toggle
                key={format}
                pressed={query.formats.includes(format)}
                onToggle={() => apply((current) => ({ formats: toggled(current.formats, format) }))}
              >
                {formats[format]}
              </Toggle>
            ))}
          </div>
        </Group>

        <Group label={t.venue} className="md:col-span-2 xl:col-span-3">
          {venues.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noVenues}</p>
          ) : (
            <div className="flex max-h-44 scroll-quiet flex-wrap gap-2 overflow-y-auto overscroll-contain">
              {venues.map((venue) => {
                const pressed = query.venueIds.includes(venue.id);
                return (
                  <Toggle
                    key={venue.id}
                    pressed={pressed}
                    disabled={venuesFull && !pressed}
                    detail={String(venue.occurrenceCount)}
                    onToggle={() =>
                      apply((current) => ({ venueIds: toggled(current.venueIds, venue.id) }))
                    }
                  >
                    {referenceLabel(venue)}
                  </Toggle>
                );
              })}
            </div>
          )}
        </Group>

        <Group label={t.context} className="md:col-span-2 xl:col-span-3">
          {contexts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noContexts}</p>
          ) : (
            <div className="flex max-h-44 scroll-quiet flex-wrap gap-2 overflow-y-auto overscroll-contain">
              {contexts.map((context) => {
                const pressed = query.contextIds.includes(context.id);
                return (
                  <Toggle
                    key={context.id}
                    pressed={pressed}
                    disabled={contextsFull && !pressed}
                    detail={String(context.occurrenceCount)}
                    onToggle={() =>
                      apply((current) => ({
                        contextIds: toggled(current.contextIds, context.id),
                      }))
                    }
                  >
                    {context.name}
                  </Toggle>
                );
              })}
            </div>
          )}
        </Group>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-[0.8125rem] text-muted-foreground">
          {venuesFull || contextsFull ? t.limit(historyFilterLimit) : ""}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={active === 0}
          onClick={() => apply(clearHistoryFilters)}
        >
          {t.clear}
        </Button>
      </div>
    </section>
  );
}

type Chip = { key: string; group: string; label: string; remove: Partial<HistoryQuery> };

/**
 * The filters in force, each one removable, shown whether the panel is open
 * or not. The search is not here: it has its own box and its own clear.
 */
export function HistoryChips() {
  const { query, apply, venues, contexts, sermon } = useHistory();
  const words = useT("preaching");
  const t = words.history.chips;
  const formats = useT("ideas").formats;
  const locale = useLocale();
  if (historyFilterCount(query) === 0) return null;

  const day = (value: string) => formatDay(value, locale);
  const venueNames = new Map(venues.map((venue) => [venue.id, venue.name]));
  const contextNames = new Map(contexts.map((context) => [context.id, context.name]));

  const chips: Chip[] = [];
  if (query.sermonId) {
    chips.push({
      key: "sermon",
      group: t.sermon,
      label: sermon?.title ?? "",
      remove: { sermonId: null },
    });
  }
  if (query.from || query.through) {
    chips.push({
      key: "dates",
      group: t.dates,
      label:
        query.from && query.through
          ? t.range(day(query.from), day(query.through))
          : query.from
            ? t.from(day(query.from))
            : t.to(day(query.through ?? "")),
      remove: { from: null, through: null },
    });
  }
  chips.push(
    ...query.timesOfDay.map((time) => ({
      key: `time-${time}`,
      group: t.time,
      label: time === "unspecified" ? words.timeNotSpecified : words.timesOfDay[time],
      remove: { timesOfDay: query.timesOfDay.filter((value) => value !== time) },
    })),
    ...query.formats.map((format) => ({
      key: `format-${format}`,
      group: t.format,
      label: formats[format],
      remove: { formats: query.formats.filter((value) => value !== format) },
    })),
    ...query.venueIds.map((id) => ({
      key: `venue-${id}`,
      group: t.venue,
      // One from an old link that has since been deleted, or was never this account's.
      label: venueNames.get(id) ?? t.unknownVenue,
      remove: { venueIds: query.venueIds.filter((value) => value !== id) },
    })),
    ...query.contextIds.map((id) => ({
      key: `context-${id}`,
      group: t.context,
      label: contextNames.get(id) ?? t.unknownContext,
      remove: { contextIds: query.contextIds.filter((value) => value !== id) },
    })),
  );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <ul aria-label={t.label} className="contents">
        {chips.map((chip) => (
          <li key={chip.key} className="max-w-full min-w-0">
            <button
              type="button"
              aria-label={t.remove(chip.group, chip.label)}
              onClick={() => apply(chip.remove)}
              className="group/chip inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border bg-surface pr-1.5 pl-2.5 text-[0.8125rem] transition-[border-color,background-color] duration-150 hover:border-foreground/30 active:bg-foreground/5 pointer-coarse:h-9"
            >
              <span className="text-muted-foreground">{chip.group}</span>
              <span className="truncate font-medium">{chip.label}</span>
              <X
                className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/chip:text-foreground"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => apply(clearHistoryFilters)}
        className="ml-1 rounded-sm text-[0.8125rem] font-medium text-primary link-underline"
      >
        {t.clear}
      </button>
    </div>
  );
}
