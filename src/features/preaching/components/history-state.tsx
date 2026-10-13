"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  useQueryNavigation,
  type ApplyQuery,
} from "@/features/ideas/components/library/query-navigation";
import { useT } from "@/i18n/client";
import { historyHref } from "../history-query";
import type { HistoryItem } from "../occurrences";
import type { HistoryQuery } from "../schemas";
import { OccurrenceDialog, type OccurrenceDialogState } from "./occurrence-dialog";
import { ReferenceManager, type ManagedReference, type ReferenceKind } from "./reference-manager";

/** The idea history is narrowed to. It can be recorded again only while it is filed as a sermon. */
export type FilteredSermon = { id: string; title: string; recordable: boolean };

type HistoryState = {
  /** The query the controls should show: the one last asked for. */
  query: HistoryQuery;
  /** True while results for a newer query are being fetched. */
  pending: boolean;
  /** Changes the query and goes to its address, back on page 1 unless the change names one. */
  apply: ApplyQuery<HistoryQuery>;
  venues: readonly ManagedReference[];
  contexts: readonly ManagedReference[];
  /** The sermon the address filters by, named, when it is one of the account's. */
  sermon: FilteredSermon | null;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  /** Opens the form for a new occasion. */
  record: () => void;
  /** Opens one occasion, to read, change, or remove. */
  open: (item: HistoryItem) => void;
  /** Opens the list of venues or of contexts, to manage. */
  manage: (kind: ReferenceKind) => void;
};

const HistoryContext = createContext<HistoryState | null>(null);

/** The history section's state, for its controls. Only inside `HistoryProvider`. */
export function useHistory() {
  const state = useContext(HistoryContext);
  if (!state) throw new Error("useHistory must be used inside HistoryProvider");
  return state;
}

/**
 * The one place the preaching history controls navigate from, as
 * `LibraryProvider` is for the ideas and `SavedScriptureProvider` for saved
 * Scripture. The URL is the state (features/preaching/history-query.ts), and
 * all three sections move through the same `useQueryNavigation`.
 *
 * It also holds the section's two dialogs, so whatever opens one (the page's
 * action, a row, the empty state, the toolbar) opens the same one.
 */
export function HistoryProvider({
  query,
  venues,
  contexts,
  sermon,
  children,
}: {
  /** As parsed from the URL by the page. */
  query: HistoryQuery;
  venues: readonly ManagedReference[];
  contexts: readonly ManagedReference[];
  sermon: FilteredSermon | null;
  children: React.ReactNode;
}) {
  const { query: shown, pending, apply } = useQueryNavigation(query, historyHref);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialog, setDialog] = useState<OccurrenceDialogState>(null);
  const [managing, setManaging] = useState<ReferenceKind | null>(null);

  const value = useMemo<HistoryState>(
    () => ({
      query: shown,
      pending,
      apply,
      venues,
      contexts,
      sermon,
      filtersOpen,
      setFiltersOpen,
      // Recording from one sermon's history is for that sermon, while it is still a sermon.
      record: () => setDialog({ mode: "record", ...(sermon?.recordable ? { sermon } : {}) }),
      open: (item) => setDialog({ mode: "view", item }),
      manage: setManaging,
    }),
    [shown, pending, apply, venues, contexts, sermon, filtersOpen],
  );

  return (
    <HistoryContext.Provider value={value}>
      {children}
      <OccurrenceDialog
        state={dialog}
        onClose={() => setDialog(null)}
        venues={venues}
        contexts={contexts}
      />
      <ReferenceManager
        kind={managing}
        venues={venues}
        contexts={contexts}
        onClose={() => setManaging(null)}
        // A deleted one cannot stay in the filter: it would match nothing, unexplained.
        onDeleted={(kind, id) =>
          apply(
            (current) =>
              kind === "venue"
                ? { venueIds: current.venueIds.filter((value) => value !== id) }
                : { contextIds: current.contextIds.filter((value) => value !== id) },
            { history: "replace" },
          )
        }
      />
    </HistoryContext.Provider>
  );
}

/** The results, dimmed and marked busy while newer ones are fetched. */
export function HistoryResultsRegion({ children }: { children: React.ReactNode }) {
  const { pending } = useHistory();
  return (
    <div
      aria-busy={pending}
      className={`transition-opacity duration-200 ${pending ? "opacity-60" : ""}`}
    >
      {children}
    </div>
  );
}

/** The section's main action: record that a sermon was preached. */
export function RecordButton({ className }: { className?: string }) {
  const { record } = useHistory();
  const t = useT("preaching").history;
  return (
    <Button type="button" aria-haspopup="dialog" onClick={record} className={className}>
      <Plus aria-hidden />
      {t.record}
    </Button>
  );
}
