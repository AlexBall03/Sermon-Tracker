"use client";

import { useCallback, useEffect, useOptimistic, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

export type QueryChange<Query> = Partial<Query> | ((query: Query) => Partial<Query>);

export type ApplyQuery<Query> = (
  change: QueryChange<Query>,
  options?: { history?: "push" | "replace" },
) => void;

/**
 * How a section of the library, whose state is its address, moves from one
 * query to the next. It holds what the server read from the URL and turns a
 * change into the next address; the ideas and the saved Scripture each have a
 * query of their own and share this.
 *
 * Every change is built on the query last asked for, not on the one the page
 * is still showing. A filter chosen while a search is on its way, or a
 * debounced search landing just after a filter, therefore adds to the other
 * instead of undoing it. The page returns to 1 unless the change names one.
 *
 * `hrefOf` must be the same function on every render.
 */
export function useQueryNavigation<Query extends { page: number }>(
  /** As parsed from the URL by the page. */
  query: Query,
  hrefOf: (query: Query) => string,
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(query);

  const latest = useRef(query);
  const address = hrefOf(query);
  useEffect(() => {
    // Once nothing is on its way, the page is the truth again: this is also
    // how Back and Forward, which arrive from outside, are taken up.
    if (!pending) latest.current = query;
    // `address` stands for `query`, which is a new object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, pending]);

  const apply = useCallback<ApplyQuery<Query>>(
    (change, options) => {
      const base = latest.current;
      const changed = typeof change === "function" ? change(base) : change;
      const next: Query = { ...base, page: 1, ...changed };
      const href = hrefOf(next);
      if (href === hrefOf(base)) return;
      latest.current = next;
      startTransition(() => {
        setShown(next);
        // The results change in place; the person stays where they were on the page.
        if (options?.history === "replace") router.replace(href, { scroll: false });
        else router.push(href, { scroll: false });
      });
    },
    [router, setShown, hrefOf],
  );

  return {
    /**
     * The query the controls should show: the one last asked for, which is a
     * step ahead of the page while the results for it are on their way.
     */
    query: shown,
    /** True while results for a newer query are being fetched. */
    pending,
    apply,
  };
}
