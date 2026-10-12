"use client";

import { SlidersHorizontal, Tags } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { activeFilterCount } from "../../library-query";
import { librarySorts, type LibrarySort } from "../../model";
import { useLibrary } from "./library-state";
import { ViewSwitcher } from "./view-switcher";

export const filtersPanelId = "library-filters";

/**
 * The library's controls beside the search box: open the filters, choose the
 * order, switch between cards and list, and manage tags. On a narrow screen
 * they wrap onto a second row; nothing is hidden behind a menu.
 */
export function LibraryToolbar({ className }: { className?: string }) {
  const { query, apply, filtersOpen, setFiltersOpen, setManagingTags } = useLibrary();
  const active = activeFilterCount(query);
  const t = useT("library").toolbar;
  const sorts = useT("library").sorts;
  const sortOptions = librarySorts.map((value) => ({ value, label: sorts[value] }));

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        aria-expanded={filtersOpen}
        aria-controls={filtersPanelId}
        onClick={() => setFiltersOpen(!filtersOpen)}
        className={cn("px-3.5", filtersOpen && "border-primary/70")}
      >
        <SlidersHorizontal aria-hidden />
        {/* A phone has room for the icon and the count; the name is still read out. */}
        <span className="max-sm:sr-only">{t.filters}</span>
        {active > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary-soft px-1.5 text-xs font-semibold text-primary tabular-nums">
            {active}
            <span className="sr-only">{t.active}</span>
          </span>
        )}
      </Button>

      <Select
        label={t.sort}
        value={query.sort}
        onChange={(sort) => apply({ sort: sort as LibrarySort })}
        options={sortOptions}
        className="w-44 max-sm:min-w-0 max-sm:flex-1"
      />

      <div className="flex items-center gap-2 sm:ml-auto">
        <ViewSwitcher />
        <Button
          type="button"
          variant="outline"
          aria-haspopup="dialog"
          onClick={() => setManagingTags(true)}
          className="px-3.5"
        >
          <Tags aria-hidden />
          <span className="max-sm:sr-only">{t.manageTags}</span>
        </Button>
      </div>
    </div>
  );
}
