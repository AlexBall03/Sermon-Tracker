"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { formatDay } from "../dates";
import { sermonHistoryHref } from "../history-query";
import type { HistoryItem } from "../occurrences";
import { HistoryList } from "./history-results";
import { OccurrenceDialog, type OccurrenceDialogState } from "./occurrence-dialog";
import type { ReferenceOption } from "./reference-field";

type SermonHistoryProps = {
  sermon: { id: string; title: string };
  /** False once the idea is filed as something else: its history stays, and nothing new is recorded. */
  recordable: boolean;
  /** The most recent occasions, newest first. */
  recent: HistoryItem[];
  /** Every occasion this sermon has, of which `recent` is the first few. */
  total: number;
  venues: readonly ReferenceOption[];
  contexts: readonly ReferenceOption[];
};

/**
 * A sermon's own preaching history, on its page: how often, when last, the
 * latest few occasions, and the way to record another. Everything is counted
 * from history when the page is read; nothing about preaching is kept on the
 * idea, and nothing here changes it.
 *
 * It stays when the idea is archived or refiled, since history outlives both.
 * Only recording a new occasion needs the idea to be a sermon.
 */
export function SermonHistory({
  sermon,
  recordable,
  recent,
  total,
  venues,
  contexts,
}: SermonHistoryProps) {
  const locale = useLocale();
  const t = useT("preaching").sermon;
  const [dialog, setDialog] = useState<OccurrenceDialogState>(null);
  const [latest] = recent;

  return (
    <section aria-labelledby="sermon-history" className="mt-10 max-w-2xl border-t pt-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id="sermon-history" className="font-display text-xl leading-snug font-semibold">
            {t.heading}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {latest
              ? t.summary(total, formatNumber(locale, total), formatDay(latest.preachedOn, locale))
              : t.never}
          </p>
        </div>
        {recordable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-haspopup="dialog"
            onClick={() => setDialog({ mode: "record", sermon })}
          >
            <Plus aria-hidden />
            {t.record}
          </Button>
        )}
      </div>

      {!recordable && <p className="mt-3 text-sm text-muted-foreground">{t.notSermon}</p>}

      {recent.length > 0 && (
        <div className="mt-4">
          <HistoryList
            items={recent}
            label={t.recent}
            hideSermon
            onOpen={(item) => setDialog({ mode: "view", item })}
          />
          {total > recent.length && (
            <Link
              href={sermonHistoryHref(sermon.id)}
              className="group/all mt-3 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-primary link-underline"
            >
              {t.viewAll(formatNumber(locale, total))}
              <ArrowRight
                className="size-3.5 transition-transform duration-200 group-hover/all:translate-x-0.5"
                aria-hidden
              />
            </Link>
          )}
        </div>
      )}

      <OccurrenceDialog
        state={dialog}
        onClose={() => setDialog(null)}
        venues={venues}
        contexts={contexts}
        linkToSermon={false}
      />
    </section>
  );
}
