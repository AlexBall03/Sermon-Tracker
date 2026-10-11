"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { libraryHref, type LibraryQuery } from "../../library-query";
import type { TagSummary } from "../../tags";
import { useQueryNavigation, type ApplyQuery } from "./query-navigation";

type LibraryState = {
  /**
   * The query the controls should show: the one last asked for, which is a
   * step ahead of the page while the results for it are on their way.
   */
  query: LibraryQuery;
  /** The account's tags, for the filter and for tag management. */
  tags: TagSummary[];
  /** True while results for a newer query are being fetched. */
  pending: boolean;
  /**
   * Changes the query and goes to its address. The page returns to 1 unless
   * the change names one. `replace` rewrites the current history entry
   * instead of adding one (typing in the search box).
   */
  apply: ApplyQuery<LibraryQuery>;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  managingTags: boolean;
  setManagingTags: (open: boolean) => void;
};

const LibraryContext = createContext<LibraryState | null>(null);

/** The library's state, for its controls. Only inside `LibraryProvider`. */
export function useLibrary() {
  const state = useContext(LibraryContext);
  if (!state) throw new Error("useLibrary must be used inside LibraryProvider");
  return state;
}

/**
 * The one place the library's controls navigate from. The URL is the state
 * (features/ideas/library-query.ts); this holds what the server read from it,
 * and turns a change into the next address.
 *
 * Every change is built on the query last asked for, not on the one the page
 * is still showing. A filter chosen while a search is on its way, or a
 * debounced search landing just after a filter, therefore adds to the other
 * instead of undoing it. That part is `useQueryNavigation`, which the saved
 * Scripture section shares.
 */
export function LibraryProvider({
  query,
  tags,
  children,
}: {
  /** As parsed from the URL by the page. */
  query: LibraryQuery;
  tags: TagSummary[];
  children: React.ReactNode;
}) {
  const { query: shown, pending, apply } = useQueryNavigation(query, libraryHref);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [managingTags, setManagingTags] = useState(false);

  const value = useMemo(
    () => ({
      query: shown,
      tags,
      pending,
      apply,
      filtersOpen,
      setFiltersOpen,
      managingTags,
      setManagingTags,
    }),
    [shown, tags, pending, apply, filtersOpen, managingTags],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

/**
 * The results, dimmed and marked busy while newer ones are fetched, so a
 * change is acknowledged at once and nothing jumps.
 */
export function LibraryResults({ children }: { children: React.ReactNode }) {
  const { pending } = useLibrary();
  return (
    <div
      aria-busy={pending}
      className={`transition-opacity duration-200 ${pending ? "opacity-60" : ""}`}
    >
      {children}
    </div>
  );
}
