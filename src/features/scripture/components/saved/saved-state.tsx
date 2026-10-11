"use client";

import { createContext, useContext, useMemo } from "react";

import {
  useQueryNavigation,
  type ApplyQuery,
} from "@/features/ideas/components/library/query-navigation";
import { savedHref, type SavedQuery } from "../../saved/saved-query";

type SavedState = {
  /** The query the controls should show: the one last asked for. */
  query: SavedQuery;
  /** True while results for a newer query are being fetched. */
  pending: boolean;
  /** Changes the query and goes to its address, back on page 1 unless the change names one. */
  apply: ApplyQuery<SavedQuery>;
};

const SavedContext = createContext<SavedState | null>(null);

/** The saved Scripture section's state, for its controls. Only inside `SavedScriptureProvider`. */
export function useSavedScripture() {
  const state = useContext(SavedContext);
  if (!state) throw new Error("useSavedScripture must be used inside SavedScriptureProvider");
  return state;
}

/**
 * The one place the saved Scripture controls navigate from, as
 * `LibraryProvider` is for the ideas. The URL is the state
 * (features/scripture/saved/saved-query.ts), and both sections move through
 * the same `useQueryNavigation`.
 */
export function SavedScriptureProvider({
  query,
  children,
}: {
  /** As parsed from the URL by the page. */
  query: SavedQuery;
  children: React.ReactNode;
}) {
  const { query: shown, pending, apply } = useQueryNavigation(query, savedHref);
  const value = useMemo(() => ({ query: shown, pending, apply }), [shown, pending, apply]);
  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

/** The results, dimmed and marked busy while newer ones are fetched. */
export function SavedResultsRegion({ children }: { children: React.ReactNode }) {
  const { pending } = useSavedScripture();
  return (
    <div
      aria-busy={pending}
      className={`transition-opacity duration-200 ${pending ? "opacity-60" : ""}`}
    >
      {children}
    </div>
  );
}
