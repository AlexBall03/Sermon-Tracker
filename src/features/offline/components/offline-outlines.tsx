"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, CloudOff, TriangleAlert } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/features/ideas/components/library/pagination";
import { OutlineEditor } from "@/features/outlines/components/outline-editor";
import { OutlineResults } from "@/features/outlines/components/outline-results";
import {
  OutlinesControls,
  OutlinesProvider,
  type OutlinesNavigation,
} from "@/features/outlines/components/outlines-state";
import type { OutlineSnapshot } from "@/features/outlines/editor/store";
import {
  isOutlinesSearch,
  outlinesHref,
  parseOutlinesQuery,
  type OutlinesQuery,
} from "@/features/outlines/outlines-query";
import type { OfflineOutline } from "@/features/sync/outlines";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import { createDeviceOutlineApi } from "../outlines/operations";
import { outlineSnapshot } from "../outlines/routing";
import { searchLocalOutlines } from "../outlines/search";
import {
  emptyOutlinesState,
  getKeptOutline,
  listLocalOutlines,
  onOutlinesChange,
  readOutlinesState,
  shownOutline,
  type OutlinesState,
} from "../outlines/store";
import { listMutations, onQueueChange } from "../queue";
import { useOfflineSettings } from "../settings";
import type { Go } from "./offline-ideas";

/*
 * The overview of outlines and an outline's editor, drawn on the offline page
 * from the copy kept on this device (Phase 5D.2). They are the application's
 * own components (the overview's controls and cards, `OutlineEditor`), given
 * the device's outlines and the offline page's addresses. Every change is kept
 * on the device by `createDeviceOutlineApi` and sent by the sync engine;
 * nothing here asks the server.
 *
 * What is shown always says it is the device's copy, and a download that never
 * finished says how much is missing.
 */

const notice = "rounded-xl border bg-muted/50 px-4 py-3 text-sm leading-relaxed";
const emptyState = "mt-6 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8";

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <section aria-labelledby="offline-outlines-heading" className={emptyState}>
      <h2 id="offline-outlines-heading" className="font-display text-2xl leading-snug font-medium">
        {title}
      </h2>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
    </section>
  );
}

/** What the page says of the copy: whose it is, how current, and whether it is whole. */
function CopyNotice({
  state,
  waiting,
  partial = true,
}: {
  state: OutlinesState;
  waiting: number;
  partial?: boolean;
}) {
  const t = useT("offline").outlines;
  const locale = useLocale();
  const when = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mt-5 max-w-4xl space-y-2">
      <p role="status" className={`${notice} flex items-start gap-2`}>
        <CloudOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {state.completedAt ? t.copy(when.format(state.completedAt)) : t.copyNever}
          {waiting > 0 && <span className="font-medium"> {t.waiting(waiting)}</span>}
        </span>
      </p>
      {partial && !state.complete && state.total > 0 && (
        <p role="alert" className={`${notice} flex items-start gap-2`}>
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          {t.partial(state.have, state.total)}
        </p>
      )}
    </div>
  );
}

type Kept = { outlines: OfflineOutline[]; state: OutlinesState; waiting: number };

/** The account's kept outlines, read again whenever they or the queue change, in any tab. */
function useKeptOutlines(account: string): Kept | null {
  const [kept, setKept] = useState<{ account: string; value: Kept } | null>(null);
  useEffect(() => {
    let current = true;
    const read = async () => {
      const [outlines, state, queued] = await Promise.all([
        listLocalOutlines(account),
        readOutlinesState(account),
        listMutations(account),
      ]);
      if (!current) return;
      const waiting = queued.filter((record) => record.entityType === "outline").length;
      setKept({ account, value: { outlines, state, waiting } });
    };
    const again = () => void read().catch(() => {});
    again();
    const stopOutlines = onOutlinesChange(again);
    const stopQueue = onQueueChange(again);
    return () => {
      current = false;
      stopOutlines();
      stopQueue();
    };
  }, [account]);
  return kept?.account === account ? kept.value : null;
}

export function OfflineOutlines({
  account,
  search,
  go,
}: {
  account: string | null;
  /** The address's query string. */
  search: string;
  go: Go;
}) {
  const overview = useT("outlines").overview;
  const t = useT("offline").outlines;
  const locale = useLocale();
  const settings = useOfflineSettings();
  const kept = useKeptOutlines(account ?? "");
  const query = useMemo(() => parseOutlinesQuery(new URLSearchParams(search)), [search]);

  // Built on the query last asked for, as the routed overview's is (query-navigation.ts).
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
  }, [query]);
  const navigation = useMemo<OutlinesNavigation>(
    () => ({
      query,
      pending: false,
      apply: (change, options) => {
        const base = latest.current;
        const changed = typeof change === "function" ? change(base) : change;
        const next: OutlinesQuery = { ...base, page: 1, ...changed };
        if (outlinesHref(next) === outlinesHref(base)) return;
        latest.current = next;
        go(outlinesHref(next), { replace: options?.history === "replace" });
      },
    }),
    [query, go],
  );

  const header = <PageHeader title={overview.title} description={overview.description} />;
  const unavailable = (title: string, body: string) => (
    <div className="container-page py-10 lg:py-12">
      {header}
      <Unavailable title={title} body={body} />
    </div>
  );
  if (!account) return unavailable(t.off, t.signedOut);
  if (!settings.outlinesOffline && !(kept && kept.outlines.length > 0)) {
    return unavailable(t.off, t.offBody);
  }
  if (!kept) return null;
  if (!kept.state.complete && kept.outlines.length === 0)
    return unavailable(t.notYet, t.notYetBody);

  const result = searchLocalOutlines(kept.outlines, query);
  const searching = isOutlinesSearch(query);
  const written = (value: number) => formatNumber(locale, value);
  const first = (result.page - 1) * result.pageSize + 1;
  const last = Math.min(result.page * result.pageSize, result.total);

  return (
    <div className="container-page py-10 lg:py-12">
      {header}
      <CopyNotice state={kept.state} waiting={kept.waiting} />
      <OutlinesProvider query={query} navigation={navigation}>
        <OutlinesControls className="mt-5" />
        {result.total === 0 ? (
          <p role="status" className="mt-6 text-sm text-muted-foreground">
            {searching ? overview.empty.noMatchBody(query.q) : overview.empty.nothing}
          </p>
        ) : (
          <>
            <p role="status" className="mt-5 text-sm text-muted-foreground tabular-nums">
              {result.total <= result.pageSize
                ? overview.count(result.total, written(result.total), searching)
                : overview.showing(
                    written(first),
                    written(last),
                    result.total,
                    written(result.total),
                    searching,
                  )}
            </p>
            <div className="mt-3">
              <OutlineResults outlines={result.items} label={overview.label} locale={locale} />
            </div>
            <Pagination
              label={overview.pages}
              locale={locale}
              hrefAt={(target) => outlinesHref({ ...query, page: target })}
              page={result.page}
              totalPages={result.totalPages}
            />
          </>
        )}
      </OutlinesProvider>
    </div>
  );
}

/** One outline from the device's copy, in the application's own editor. */
export function OfflineOutline({ account, id }: { account: string | null; id: string }) {
  const t = useT("offline").outlines;
  const page = useT("outlines").page;
  const locale = useLocale();
  const [kept, setKept] = useState<{
    outline: OfflineOutline | null;
    generation: number;
    state: OutlinesState;
    waiting: number;
  } | null>(null);
  // What the editor starts from, and what it is given when it asks to read the outline again.
  const [snapshot, setSnapshot] = useState<OutlineSnapshot | null>(null);
  // The copy the editor started from: a new one is handed over only when it is to start again.
  const started = useRef<number | null>(null);

  const read = useCallback(async () => {
    if (!account) return null;
    const [copy, state, queued] = await Promise.all([
      getKeptOutline(account, id),
      readOutlinesState(account),
      listMutations(account, { entityId: id }),
    ]);
    return {
      outline: shownOutline(copy),
      generation: copy?.generation ?? 0,
      state,
      waiting: queued.length,
    };
  }, [account, id]);

  useEffect(() => {
    let current = true;
    const again = () =>
      void read().then(
        (value) => {
          if (!current || !value) return;
          const start = value.outline ? value.generation : null;
          if (start !== started.current) {
            started.current = start;
            setSnapshot(value.outline ? outlineSnapshot(value.outline) : null);
          }
          setKept(value);
        },
        () =>
          current &&
          setKept({ outline: null, generation: 0, state: emptyOutlinesState, waiting: 0 }),
      );
    again();
    const stopOutlines = onOutlinesChange(again);
    const stopQueue = onQueueChange(again);
    return () => {
      current = false;
      stopOutlines();
      stopQueue();
    };
  }, [read]);

  const device = useMemo(
    () =>
      account
        ? {
            api: createDeviceOutlineApi(account, id, { locale }),
            // The store asks to read the outline again: the device's copy as it is now.
            reload: () =>
              void read().then((value) => {
                if (value?.outline) setSnapshot(outlineSnapshot(value.outline));
              }),
          }
        : null,
    [account, id, locale, read],
  );

  const back = routes.outlines;
  if (!account) {
    return (
      <div className="container-page py-10 lg:py-12">
        <BackLink href={back}>{t.back}</BackLink>
        <Unavailable title={t.off} body={t.signedOut} />
      </div>
    );
  }
  if (!kept) return null;
  const outline = kept.outline;
  if (!outline || !snapshot || !device) {
    return (
      <div className="container-page py-10 lg:py-12">
        <BackLink href={back}>{t.back}</BackLink>
        <Unavailable title={t.missing} body={t.missingBody} />
      </div>
    );
  }
  const { sermon } = outline;
  const aside = sermon.kind !== "sermon" ? page.refiled : sermon.archivedAt ? page.archived : null;

  return (
    <div className="container-page py-10 lg:py-12">
      <BackLink href={back}>{t.back}</BackLink>
      <PageHeader
        title={page.title}
        description={
          <>
            {page.sermon}{" "}
            <a
              href={`${routes.library}/${sermon.id}`}
              className="rounded-sm font-serif font-medium text-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline"
            >
              {sermon.title}
            </a>
          </>
        }
      />
      <CopyNotice state={kept.state} waiting={kept.waiting} partial={false} />
      {aside && (
        <p className="mt-4 flex max-w-4xl items-start gap-2 rounded-xl border bg-muted/50 px-4 py-3 text-sm">
          <Archive className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {aside}
        </p>
      )}
      <OutlineEditor
        key={`${outline.id}:${kept.generation}`}
        snapshot={snapshot}
        sermon={sermon}
        sermonReferences={outline.sermonReferences}
        device={device}
      />
    </div>
  );
}
