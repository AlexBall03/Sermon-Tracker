"use client";

import { useId, useState } from "react";
import { Check, CircleAlert, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  activeFilterCount,
  clearFilters,
  invertedRange,
  startOfDay,
  toggled,
  type LibraryQuery,
} from "../../library-query";
import {
  archiveViews,
  ideaKinds,
  ideaStatuses,
  intendedFormats,
  sermonTypes,
  tagFilterLimit,
  tagModes,
} from "../../model";
import { useLibrary } from "./library-state";
import { filtersPanelId } from "./library-toolbar";

/** With more tags than this, the panel offers a box to find one. */
const tagSearchFrom = 12;

/** A value that is in the filter or not. The tick means it never rests on color alone. */
export function Toggle({
  pressed,
  onToggle,
  disabled,
  children,
  detail,
}: {
  pressed: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: string;
  /** A quiet figure after the name, such as how many ideas carry a tag. */
  detail?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-[color,background-color,border-color] duration-150 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-10 pointer-coarse:px-3",
        pressed
          ? "border-primary/50 bg-primary-soft text-primary"
          : "border-input bg-surface text-foreground hover:border-foreground/30 active:bg-foreground/5",
      )}
    >
      {pressed && <Check className="size-3.5 shrink-0" aria-hidden />}
      <span className="truncate">{children}</span>
      {detail && (
        <span className={cn("text-xs tabular-nums", !pressed && "text-muted-foreground")}>
          {detail}
        </span>
      )}
    </button>
  );
}

/** One filter's choices under its name. Shared with the library's other sections. */
export function Group({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="text-sm leading-none font-semibold">{label}</legend>
      {hint && <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </fieldset>
  );
}

type DateKey = "createdFrom" | "createdThrough" | "updatedFrom" | "updatedThrough";

/** One range of days. Each end is optional, and both are included. */
function DateRange({
  label,
  from,
  through,
  query,
  onChange,
}: {
  label: string;
  from: DateKey;
  through: DateKey;
  query: LibraryQuery;
  onChange: (key: DateKey, value: string | null) => void;
}) {
  const id = useId();
  const t = useT("library").filters;
  const inverted = invertedRange(query[from], query[through]);
  const field = (key: DateKey, text: string, limit: { min?: string; max?: string }) => (
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
          if (value === "") onChange(key, null);
          else if (startOfDay(value)) onChange(key, value);
        }}
        aria-invalid={inverted ? true : undefined}
        aria-describedby={inverted ? `${id}-error` : undefined}
        className="mt-1"
        {...limit}
      />
    </div>
  );

  return (
    <Group label={label}>
      <div className="flex gap-2">
        {field(from, t.from, { max: query[through] ?? undefined })}
        {field(through, t.to, { min: query[from] ?? undefined })}
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
 * The advanced filters, beneath the toolbar. Each choice goes straight to the
 * address and the results follow; there is no Apply button to forget.
 *
 * Within a group, any chosen value will do. Between groups, every one must
 * hold. Tags can be either, and say which. Whether archived ideas are shown
 * is one choice of three, and is active ideas only until it is changed.
 */
export function LibraryFilters() {
  const { query, tags, apply, filtersOpen, setManagingTags } = useLibrary();
  const [tagSearch, setTagSearch] = useState("");
  const t = useT("library").filters;
  const modes = useT("library").tagModes;
  const views = useT("library").archiveViews;
  const words = useT("ideas");
  const active = activeFilterCount(query);

  const wanted = tagSearch.trim().toLowerCase();
  const shownTags = wanted ? tags.filter((tag) => tag.name.toLowerCase().includes(wanted)) : tags;
  const tagsFull = query.tagIds.length >= tagFilterLimit;

  return (
    <section
      id={filtersPanelId}
      aria-label={t.panel}
      hidden={!filtersOpen}
      className={cn(
        "mt-3 rounded-xl border bg-surface p-4 shadow-card sm:p-5",
        filtersOpen && "animate-menu",
      )}
    >
      <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
        <Group label={t.kind}>
          <div className="flex flex-wrap gap-2">
            {ideaKinds.map((kind) => (
              <Toggle
                key={kind}
                pressed={query.kinds.includes(kind)}
                onToggle={() => apply((current) => ({ kinds: toggled(current.kinds, kind) }))}
              >
                {words.kinds[kind]}
              </Toggle>
            ))}
          </div>
        </Group>

        <Group label={t.status}>
          <div className="flex flex-wrap gap-2">
            {ideaStatuses.map((status) => (
              <Toggle
                key={status}
                pressed={query.statuses.includes(status)}
                onToggle={() =>
                  apply((current) => ({ statuses: toggled(current.statuses, status) }))
                }
              >
                {words.statuses[status]}
              </Toggle>
            ))}
          </div>
        </Group>

        <Group label={t.sermonType} hint={t.sermonTypeHint}>
          <div className="flex flex-wrap gap-2">
            {sermonTypes.map((type) => (
              <Toggle
                key={type}
                pressed={query.sermonTypes.includes(type)}
                onToggle={() =>
                  apply((current) => ({ sermonTypes: toggled(current.sermonTypes, type) }))
                }
              >
                {words.sermonTypes[type]}
              </Toggle>
            ))}
          </div>
        </Group>

        <Group label={t.format} hint={t.formatHint}>
          <div className="flex flex-wrap gap-2">
            {intendedFormats.map((format) => (
              <Toggle
                key={format}
                pressed={query.formats.includes(format)}
                onToggle={() => apply((current) => ({ formats: toggled(current.formats, format) }))}
              >
                {words.formats[format]}
              </Toggle>
            ))}
          </div>
        </Group>

        {/* The control is its own group, so it is named once. */}
        <div className="min-w-0 md:col-span-2">
          <Segmented
            label={t.archive}
            name="library-archive"
            options={archiveViews.map((value) => ({ value, label: views[value] }))}
            value={query.archive}
            onChange={(archive) => apply({ archive })}
            className="max-w-sm [&>legend]:mb-2.5 [&>legend]:font-semibold"
          />
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">{t.archiveHint}</p>
        </div>

        <Group label={t.tags} className="md:col-span-2 xl:col-span-3">
          {tags.length === 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm text-muted-foreground">{t.noTags}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManagingTags(true)}
              >
                {t.createTag}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Segmented
                  label={t.matchTags}
                  hideLabel
                  name="library-tag-mode"
                  options={tagModes.map((value) => ({ value, label: modes[value] }))}
                  value={query.tagMode}
                  onChange={(tagMode) => apply({ tagMode })}
                  // The mode is about the chosen tags; with none there is nothing to set.
                  disabled={query.tagIds.length === 0}
                  className="w-32"
                />
                <p className="text-[0.8125rem] text-muted-foreground">
                  {query.tagIds.length === 0
                    ? t.chooseTags
                    : query.tagMode === "all"
                      ? t.everyTag
                      : t.anyTag}
                </p>
              </div>

              {tags.length > tagSearchFrom && (
                <div className="relative mt-3 max-w-xs">
                  <Search
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    aria-label={t.findTag}
                    placeholder={t.findTag}
                    value={tagSearch}
                    onChange={(event) => setTagSearch(event.target.value)}
                    autoComplete="off"
                    className="h-9 pl-9"
                  />
                </div>
              )}

              <div className="mt-3 flex max-h-44 scroll-quiet flex-wrap gap-2 overflow-y-auto overscroll-contain">
                {shownTags.map((tag) => {
                  const pressed = query.tagIds.includes(tag.id);
                  return (
                    <Toggle
                      key={tag.id}
                      pressed={pressed}
                      disabled={tagsFull && !pressed}
                      detail={String(tag.ideaCount)}
                      onToggle={() =>
                        apply((current) => ({ tagIds: toggled(current.tagIds, tag.id) }))
                      }
                    >
                      {tag.name}
                    </Toggle>
                  );
                })}
                {shownTags.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t.noTagNamed}</p>
                )}
              </div>
              {tagsFull && (
                <p className="mt-2 text-[0.8125rem] text-muted-foreground">
                  {t.tagLimit(tagFilterLimit)}
                </p>
              )}
            </>
          )}
        </Group>

        <DateRange
          label={t.created}
          from="createdFrom"
          through="createdThrough"
          query={query}
          onChange={(key, value) => apply({ [key]: value })}
        />
        <DateRange
          label={t.changed}
          from="updatedFrom"
          through="updatedThrough"
          query={query}
          onChange={(key, value) => apply({ [key]: value })}
        />
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-[0.8125rem] text-muted-foreground">{t.utc}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={active === 0}
          onClick={() => apply(clearFilters)}
        >
          {t.clear}
        </Button>
      </div>
    </section>
  );
}
