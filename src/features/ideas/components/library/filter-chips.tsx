"use client";

import { X } from "lucide-react";

import { formatDate } from "@/lib/format";
import {
  activeFilterCount,
  clearFilters,
  startOfDay,
  type LibraryQuery,
} from "../../library-query";
import { ideaKindLabels, ideaStatusLabels, sermonTypeLabels } from "../../model";
import { useLibrary } from "./library-state";

type Chip = { key: string; group: string; label: string; remove: Partial<LibraryQuery> };

const shownDay = (value: string) => {
  const date = startOfDay(value);
  return date ? formatDate(date) : value;
};

function range(from: string | null, through: string | null) {
  if (from && through) return `${shownDay(from)} to ${shownDay(through)}`;
  return from ? `from ${shownDay(from)}` : `to ${shownDay(through ?? "")}`;
}

/**
 * The filters in force, each one removable, shown whether the panel is open
 * or not. The search is not here: it has its own box and its own clear.
 */
export function FilterChips() {
  const { query, tags, apply } = useLibrary();
  if (activeFilterCount(query) === 0) return null;

  const names = new Map(tags.map((tag) => [tag.id, tag.name]));
  const chips: Chip[] = [
    ...query.kinds.map((kind) => ({
      key: `kind-${kind}`,
      group: "Kind",
      label: ideaKindLabels[kind],
      remove: { kinds: query.kinds.filter((value) => value !== kind) },
    })),
    ...query.statuses.map((status) => ({
      key: `status-${status}`,
      group: "Status",
      label: ideaStatusLabels[status],
      remove: { statuses: query.statuses.filter((value) => value !== status) },
    })),
    ...query.sermonTypes.map((type) => ({
      key: `type-${type}`,
      group: "Sermon type",
      label: sermonTypeLabels[type],
      remove: { sermonTypes: query.sermonTypes.filter((value) => value !== type) },
    })),
    ...query.tagIds.map((id) => ({
      key: `tag-${id}`,
      group: "Tag",
      // A tag from an old link that has since been deleted, or was never this account's.
      label: names.get(id) ?? "Unknown tag",
      remove: { tagIds: query.tagIds.filter((value) => value !== id) },
    })),
  ];
  if (query.createdFrom || query.createdThrough) {
    chips.push({
      key: "created",
      group: "Created",
      label: range(query.createdFrom, query.createdThrough),
      remove: { createdFrom: null, createdThrough: null },
    });
  }
  if (query.updatedFrom || query.updatedThrough) {
    chips.push({
      key: "updated",
      group: "Changed",
      label: range(query.updatedFrom, query.updatedThrough),
      remove: { updatedFrom: null, updatedThrough: null },
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <ul aria-label="Active filters" className="contents">
        {chips.map((chip) => (
          <li key={chip.key} className="max-w-full min-w-0">
            <button
              type="button"
              aria-label={`Remove filter: ${chip.group} ${chip.label}`}
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
      {query.tagIds.length > 1 && (
        <p className="text-[0.8125rem] text-muted-foreground">
          {query.tagMode === "all" ? "Matching all tags" : "Matching any tag"}
        </p>
      )}
      <button
        type="button"
        onClick={() => apply(clearFilters)}
        className="ml-1 rounded-sm text-[0.8125rem] font-medium text-primary link-underline"
      >
        Clear filters
      </button>
    </div>
  );
}
