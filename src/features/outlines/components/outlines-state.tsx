"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SearchBox } from "@/features/ideas/components/library/library-search";
import {
  useQueryNavigation,
  type ApplyQuery,
} from "@/features/ideas/components/library/query-navigation";
import { useT } from "@/i18n/client";
import { useFreshOnReturn } from "@/lib/use-fresh-on-return";
import { cn } from "@/lib/utils";
import { outlineSorts, type OutlineSort } from "../model";
import { outlinesHref, type OutlinesQuery } from "../outlines-query";
import { CreateOutlineDialog } from "./create-outline-dialog";

type OutlinesState = {
  /** The query the controls should show: the one last asked for. */
  query: OutlinesQuery;
  /** True while results for a newer query are being fetched. */
  pending: boolean;
  /** Changes the query and goes to its address, back on page 1 unless the change names one. */
  apply: ApplyQuery<OutlinesQuery>;
  /** Opens the dialog that chooses the sermon a new outline is for. */
  create: () => void;
};

const OutlinesContext = createContext<OutlinesState | null>(null);

/** The overview's state, for its controls. Only inside `OutlinesProvider`. */
export function useOutlines() {
  const state = useContext(OutlinesContext);
  if (!state) throw new Error("useOutlines must be used inside OutlinesProvider");
  return state;
}

/**
 * The one place the overview's controls navigate from, as `LibraryProvider`
 * is for the ideas. The URL is the state (features/outlines/outlines-query.ts),
 * and it moves through the same `useQueryNavigation` the library's sections
 * do. It also holds the page's one dialog, so the header's action and the
 * empty state open the same one.
 */
export function OutlinesProvider({
  query,
  children,
}: {
  /** As parsed from the URL by the page. */
  query: OutlinesQuery;
  children: React.ReactNode;
}) {
  const { query: shown, pending, apply } = useQueryNavigation(query, outlinesHref);
  const [creating, setCreating] = useState(false);
  // An outline worked on since would otherwise be listed with the date and the count it had before.
  useFreshOnReturn();
  const value = useMemo<OutlinesState>(
    () => ({ query: shown, pending, apply, create: () => setCreating(true) }),
    [shown, pending, apply],
  );
  return (
    <OutlinesContext.Provider value={value}>
      {children}
      <CreateOutlineDialog open={creating} onClose={() => setCreating(false)} />
    </OutlinesContext.Provider>
  );
}

/** The page's main action: an outline for a sermon, chosen or new. */
export function CreateOutlineAction({ className }: { className?: string }) {
  const { create } = useOutlines();
  const t = useT("outlines").overview;
  return (
    <Button type="button" aria-haspopup="dialog" onClick={create} className={className}>
      <Plus aria-hidden />
      {t.create}
    </Button>
  );
}

/** The search box and the order, side by side where there is room. */
export function OutlinesControls({ className }: { className?: string }) {
  const { query, apply } = useOutlines();
  const t = useT("outlines").overview;
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      <SearchBox
        q={query.q}
        apply={apply as Parameters<typeof SearchBox>[0]["apply"]}
        label={t.search.label}
        landmark={t.search.landmark}
        placeholder={t.search.placeholder}
        className="sm:flex-1"
      />
      <Select
        label={t.sort}
        value={query.sort}
        onChange={(sort) => apply({ sort: sort as OutlineSort })}
        options={outlineSorts.map((value) => ({ value, label: t.sorts[value] }))}
        className="sm:w-60"
      />
    </div>
  );
}

/** The results, dimmed and marked busy while newer ones are fetched. */
export function OutlinesResultsRegion({ children }: { children: React.ReactNode }) {
  const { pending } = useOutlines();
  return (
    <div
      aria-busy={pending}
      className={cn("transition-opacity duration-200", pending && "opacity-60")}
    >
      {children}
    </div>
  );
}
