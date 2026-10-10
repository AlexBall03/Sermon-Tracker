"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import { libraryHref, type LibraryQuery } from "../../library-query";
import type { TagSummary } from "../../tags";

type Change = Partial<LibraryQuery> | ((query: LibraryQuery) => Partial<LibraryQuery>);

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
  apply: (change: Change, options?: { history?: "push" | "replace" }) => void;
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
 * instead of undoing it.
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(query);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [managingTags, setManagingTags] = useState(false);

  const latest = useRef(query);
  const address = libraryHref(query);
  useEffect(() => {
    // Once nothing is on its way, the page is the truth again: this is also
    // how Back and Forward, which arrive from outside, are taken up.
    if (!pending) latest.current = query;
    // `address` stands for `query`, which is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, pending]);

  const apply = useCallback<LibraryState["apply"]>(
    (change, options) => {
      const base = latest.current;
      const changed = typeof change === "function" ? change(base) : change;
      const next: LibraryQuery = { ...base, page: 1, ...changed };
      const href = libraryHref(next);
      if (href === libraryHref(base)) return;
      latest.current = next;
      startTransition(() => {
        setShown(next);
        // The results change in place; the person stays where they were on the page.
        if (options?.history === "replace") router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router, setShown],
  );

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
