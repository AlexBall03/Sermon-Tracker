"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloudOff, TriangleAlert } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { FilterChips } from "@/features/ideas/components/library/filter-chips";
import { IdeaResults } from "@/features/ideas/components/library/idea-results";
import { LibraryFilters } from "@/features/ideas/components/library/library-filters";
import { LibrarySearch } from "@/features/ideas/components/library/library-search";
import {
  LibraryProvider,
  type LibraryNavigation,
} from "@/features/ideas/components/library/library-state";
import { LibraryToolbar } from "@/features/ideas/components/library/library-toolbar";
import { Pagination } from "@/features/ideas/components/library/pagination";
import { LibraryViewScript } from "@/features/ideas/components/library/view-switcher";
import { IdeaEditor } from "@/features/ideas/components/idea-editor";
import { IdeaOperationsProvider } from "@/features/ideas/components/idea-operations";
import type { IdeaWithReferences } from "@/features/ideas/ideas";
import {
  isFiltered,
  libraryHref,
  libraryReturnHref,
  parseLibraryQuery,
  type LibraryQuery,
} from "@/features/ideas/library-query";
import type { IdeaTag, TagSummary } from "@/features/ideas/tags";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { listMutations, onQueueChange } from "../queue";
import { asLibraryIdea, searchLocalIdeas } from "../ideas/search";
import {
  getKeptIdea,
  listLocalIdeas,
  onIdeasChange,
  readIdeasState,
  readLocalTags,
  shown,
  type IdeasState,
} from "../ideas/store";
import { useOfflineSettings } from "../settings";

/*
 * The library's Sermon Ideas and an idea's page, drawn on the offline page
 * from the copy kept on this device (Phase 5D.1). They are the application's
 * own components (the library's controls, results, and pager; the idea
 * editor), given the device's ideas and the offline page's addresses instead
 * of the server's. Every change is kept on the device and sent by the sync
 * engine; nothing here asks the server.
 *
 * What is shown always says it is the device's copy, and when a download
 * never finished it says how much is missing, so part of the library is never
 * taken for all of it.
 */

export type Go = (href: string, options?: { replace?: boolean }) => void;

type Kept = {
  ideas: IdeaWithReferences[];
  tags: IdeaTag[];
  state: IdeasState;
  waiting: number;
};

/** The account's kept ideas, read again whenever they or the queue change, in any tab. */
function useKept(account: string): Kept | null {
  const [kept, setKept] = useState<{ account: string; value: Kept } | null>(null);
  useEffect(() => {
    let current = true;
    const read = async () => {
      const [ideas, tags, state, queued] = await Promise.all([
        listLocalIdeas(account),
        readLocalTags(account),
        readIdeasState(account),
        listMutations(account),
      ]);
      const byId = new Map(tags.map((tag) => [tag.id, tag]));
      if (!current) return;
      setKept({
        account,
        value: {
          ideas: ideas.map((idea) => asLibraryIdea(idea, account, byId)),
          tags,
          state,
          waiting: queued.length,
        },
      });
    };
    const again = () => void read().catch(() => {});
    again();
    const stopIdeas = onIdeasChange(again);
    const stopQueue = onQueueChange(again);
    return () => {
      current = false;
      stopIdeas();
      stopQueue();
    };
  }, [account]);
  return kept?.account === account ? kept.value : null;
}

const notice = "rounded-xl border bg-muted/50 px-4 py-3 text-sm leading-relaxed";
const emptyState = "mt-6 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8";

/** What the page says of the copy: whose it is, how current, and whether it is whole. */
function CopyNotice({ state, waiting }: { state: IdeasState; waiting: number }) {
  const t = useT("offline").ideas;
  const locale = useLocale();
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mt-5 space-y-2">
      <p role="status" className={`${notice} flex items-start gap-2`}>
        <CloudOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {state.completedAt ? t.copy(when.format(state.completedAt)) : t.copyNever}
          {waiting > 0 && <span className="font-medium"> {t.waiting(waiting)}</span>}
        </span>
      </p>
      {!state.complete && state.total > 0 && (
        <p role="alert" className={`${notice} flex items-start gap-2`}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {t.partial(state.have, state.total)}
        </p>
      )}
    </div>
  );
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <section aria-labelledby="offline-ideas-heading" className={emptyState}>
      <h2 id="offline-ideas-heading" className="font-display text-2xl leading-snug font-medium">
        {title}
      </h2>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
    </section>
  );
}

/** The query in the address, as the library reads it. */
const queryOf = (search: string) => parseLibraryQuery(new URLSearchParams(search));

export function OfflineLibrary({
  account,
  search,
  go,
}: {
  account: string | null;
  /** The address's query string. */
  search: string;
  go: Go;
}) {
  const library = useT("library");
  const t = useT("offline").ideas;
  const locale = useLocale();
  const settings = useOfflineSettings();
  const kept = useKept(account ?? "");
  const query = useMemo(() => queryOf(search), [search]);

  // Built on the query last asked for, as the routed library's is (query-navigation.ts).
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
  }, [query]);
  const navigation = useMemo<LibraryNavigation>(
    () => ({
      query,
      pending: false,
      apply: (change, options) => {
        const base = latest.current;
        const changed = typeof change === "function" ? change(base) : change;
        const next: LibraryQuery = { ...base, page: 1, ...changed };
        if (libraryHref(next) === libraryHref(base)) return;
        latest.current = next;
        go(libraryHref(next), { replace: options?.history === "replace" });
      },
    }),
    [query, go],
  );

  const header = (
    <PageHeader title={library.sections.ideas} description={library.descriptions.ideas} />
  );
  if (!account) {
    return (
      <div className="container-page py-10 lg:py-12">
        {header}
        <Unavailable title={t.off} body={t.signedOut} />
      </div>
    );
  }
  if (!settings.ideasOffline && !(kept && kept.ideas.length > 0)) {
    return (
      <div className="container-page py-10 lg:py-12">
        {header}
        <Unavailable title={t.off} body={t.offBody} />
      </div>
    );
  }
  if (!kept) return null;
  if (!kept.state.complete && kept.ideas.length === 0) {
    return (
      <div className="container-page py-10 lg:py-12">
        {header}
        <Unavailable title={t.notYet} body={t.notYetBody} />
      </div>
    );
  }

  const result = searchLocalIdeas(kept.ideas, query);
  const filtered = isFiltered(query);
  const counts = new Map<string, number>();
  for (const idea of kept.ideas) {
    for (const tag of idea.tags) counts.set(tag.id, (counts.get(tag.id) ?? 0) + 1);
  }
  const never = new Date(0);
  const tags: TagSummary[] = kept.tags.map((tag) => ({
    ...tag,
    createdAt: never,
    updatedAt: never,
    ideaCount: counts.get(tag.id) ?? 0,
  }));
  const written = (value: number) => formatNumber(locale, value);
  const first = (result.page - 1) * result.pageSize + 1;
  const last = Math.min(result.page * result.pageSize, result.total);

  return (
    <div className="container-page py-10 lg:py-12">
      <LibraryViewScript />
      {header}
      <CopyNotice state={kept.state} waiting={kept.waiting} />
      <LibraryProvider query={query} tags={tags} navigation={navigation}>
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <LibrarySearch className="lg:flex-1" />
          <LibraryToolbar className="lg:flex-none" />
        </div>
        <LibraryFilters />
        <FilterChips />
        {result.total === 0 ? (
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            {kept.ideas.length === 0 ? t.empty : library.empty.filtersOnly}
          </p>
        ) : (
          <>
            <p role="status" className="mt-5 text-sm text-muted-foreground tabular-nums">
              {result.total <= result.pageSize
                ? library.count(result.total, written(result.total), filtered)
                : library.showing(
                    written(first),
                    written(last),
                    result.total,
                    written(result.total),
                    filtered,
                  )}
            </p>
            <div className="mt-3">
              <IdeaResults
                ideas={result.items}
                label={library.results.label}
                query={{ ...query, page: result.page }}
                locale={locale}
                offline
              />
            </div>
            <Pagination
              query={query}
              page={result.page}
              totalPages={result.totalPages}
              locale={locale}
            />
          </>
        )}
      </LibraryProvider>
    </div>
  );
}

/** One idea from the device's copy, in the application's own editor. */
export function OfflineIdea({
  account,
  id,
  search,
  go,
}: {
  account: string | null;
  id: string;
  search: string;
  go: Go;
}) {
  const t = useT("offline").ideas;
  const words = useT("ideas");
  const [kept, setKept] = useState<{
    idea: ReturnType<typeof shown>;
    tags: IdeaTag[];
  } | null>(null);
  const back = libraryReturnHref(new URLSearchParams(search).get("from") ?? undefined);

  useEffect(() => {
    if (!account) return;
    let current = true;
    const read = () =>
      void Promise.all([getKeptIdea(account, id), readLocalTags(account)]).then(
        ([copy, tags]) => current && setKept({ idea: shown(copy), tags }),
        () => current && setKept({ idea: null, tags: [] }),
      );
    read();
    const stop = onIdeasChange(read);
    return () => {
      current = false;
      stop();
    };
  }, [account, id]);

  const operations = useMemo(
    () => ({ local: true, refresh: () => {}, leave: (href: string) => go(href) }),
    [go],
  );

  if (!account || !kept) return null;
  const idea = kept.idea;
  if (!idea) {
    return (
      <div className="container-page py-10 lg:py-12">
        <BackLink href={back}>{t.back}</BackLink>
        <Unavailable title={t.missing} body={t.missingBody} />
      </div>
    );
  }
  const byId = new Map(kept.tags.map((tag) => [tag.id, tag]));
  const shownIdea = asLibraryIdea(idea, account, byId);

  return (
    <div className="container-page py-10 lg:py-12">
      <BackLink href={back}>{words.page.back}</BackLink>
      <PageHeader title={words.kinds[idea.kind]} description={words.page.description} />
      <p className={`${notice} mt-5 max-w-2xl text-muted-foreground`}>{t.connection}</p>
      <IdeaOperationsProvider value={operations}>
        <IdeaEditor
          key={idea.id}
          id={idea.id}
          backHref={back}
          allTags={kept.tags}
          createdAt={shownIdea.createdAt}
          updatedAt={shownIdea.updatedAt}
          archivedAt={shownIdea.archivedAt}
          lastDevelopedAt={shownIdea.lastDevelopedAt}
          hasOutline={idea.hasOutline}
          preached={idea.preached}
          revision={idea.revision}
          initial={{
            kind: idea.kind,
            title: idea.title,
            notes: idea.notes ?? "",
            status: idea.status,
            intendedFormat: idea.intendedFormat,
            sermonType: idea.sermonType,
            subject: idea.subject ?? "",
            references: idea.references,
            tags: shownIdea.tags,
          }}
        />
      </IdeaOperationsProvider>
    </div>
  );
}
