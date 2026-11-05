"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { renameSermonTitle } from "@/features/ideas/actions";
import { usePendingChanges } from "@/features/offline/components/pending-changes";
import { useT } from "@/i18n/client";
import { holdUnsavedWork, releaseUnsavedWork } from "@/lib/unsaved-work";
import type { TitleControl } from "./sermon-header";
import { createTitleSaver, readHeading, type TitleTransport } from "./title-save";

/**
 * The sermon's title for the production editor's header (A4.3): one saver
 * per sermon (`title-save.ts`), the header's control, and its status. The
 * title can be changed only where the outline can (the editing tab), and not
 * while changes to the sermon wait on this device (they must reach the
 * server first, so nothing here writes over them or is lost behind them).
 */
export function useSermonTitle({
  ideaId,
  title,
  revision,
  canEdit,
  transport,
}: {
  ideaId: string;
  title: string;
  revision: number;
  canEdit: boolean;
  /** For tests. */
  transport?: TitleTransport;
}) {
  const words = useT("sermonEditor").titleSave;
  const [saver] = useState(() =>
    createTitleSaver(
      { title, revision },
      transport ?? {
        rename: (submission) => renameSermonTitle({ ideaId, ...submission }),
        read: () => readHeading(ideaId),
      },
    ),
  );
  // Never disposed from an effect: React runs effects twice in development, and a saver
  // disposed there would drop every later title. Subscriptions end with the component.
  // A newer copy of the sermon from the page is taken while nothing is held.
  useEffect(() => saver.observe({ title, revision }), [saver, title, revision]);
  const snapshot = useSyncExternalStore(saver.subscribe, saver.getSnapshot, saver.getSnapshot);

  const pending = usePendingChanges({ entityId: ideaId });
  const queued = Array.isArray(pending) && pending.length > 0;

  const holds = saver.holdsWork();
  // The application's update waits while the title is not on the server (it is kept nowhere else).
  useEffect(() => {
    if (!holds) return;
    const key = {};
    holdUnsavedWork(key);
    return () => releaseUnsavedWork(key);
  }, [holds]);

  const missing = snapshot.state.kind === "refused" && snapshot.state.reason === "missing";
  const editable = canEdit && !queued && !missing;
  const control: TitleControl = useMemo(
    () => ({
      value: saver.shown(),
      editable,
      commit: (next) => saver.commit(next),
      reason: queued ? words.waitingDevice : !canEdit ? words.readOnly : undefined,
    }),
    // `snapshot` changes whenever what is shown can.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saver, snapshot, editable, queued, canEdit, words],
  );

  return { control, saver, snapshot, holds, queued };
}

/** Where the title's save stands, beside the document's save indicator. */
export function TitleStatus({ title }: { title: ReturnType<typeof useSermonTitle> }) {
  const words = useT("sermonEditor").titleSave;
  const { saver, snapshot, queued } = title;
  const { state } = snapshot;
  const line = "flex flex-wrap items-center gap-x-2 gap-y-1 text-sm";
  const action =
    "rounded-md px-1.5 py-0.5 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11";

  if (queued && state.kind === "idle") {
    return (
      <span className={`${line} text-muted-foreground`} data-testid="title-status">
        {words.waitingDevice}
      </span>
    );
  }
  switch (state.kind) {
    case "idle":
      return null;
    case "saving":
      return (
        <span role="status" className={`${line} text-muted-foreground`} data-testid="title-status">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          {words.saving}
        </span>
      );
    case "saved":
      return (
        <span role="status" className={`${line} text-muted-foreground`} data-testid="title-status">
          {words.saved}
        </span>
      );
    case "uncertain":
      return (
        <span role="alert" className={`${line} text-gold-ink`} data-testid="title-status">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {state.checking ? words.checking : words.uncertain}
          {!state.checking && (
            <>
              <button type="button" className={action} onClick={() => saver.check()}>
                {words.check}
              </button>
              <button type="button" className={action} onClick={() => saver.retry()}>
                {words.retry}
              </button>
            </>
          )}
        </span>
      );
    case "conflict":
      return (
        <span role="alert" className={`${line} text-gold-ink`} data-testid="title-status">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {words.conflict(state.server.title)}
          <button type="button" className={action} onClick={() => saver.keepMine()}>
            {words.keepMine}
          </button>
          <button type="button" className={action} onClick={() => saver.useTheirs()}>
            {words.useTheirs}
          </button>
        </span>
      );
    case "refused":
      return (
        <span role="alert" className={`${line} text-destructive`} data-testid="title-status">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {state.reason === "missing"
            ? words.missing
            : state.reason === "unauthorized"
              ? words.blocked
              : words.invalid}
          {state.reason === "invalid" && (
            <button type="button" className={action} onClick={() => saver.dismiss()}>
              {words.revert}
            </button>
          )}
        </span>
      );
  }
}
