"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, LoaderCircle, Pencil, Trash2 } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { deleteOccurrence, recordOccurrence, updateOccurrence } from "../actions";
import { formatDay, localDate, splitDuration } from "../dates";
import {
  actualFormats,
  defaultActualFormat,
  earliestPreachedOn,
  preachingLimits,
  timeOfDayFilters,
  type ActualFormat,
  type TimeOfDayFilter,
} from "../model";
import type { HistoryItem } from "../occurrences";
import { latestDateOnEarth, preachingSchemas } from "../schemas";
import type { SermonMatch } from "../sermon-search";
import { ReferenceField, referenceLabel, type ReferenceOption } from "./reference-field";
import { SermonPicker } from "./sermon-picker";

/** What the dialog is open on. Null closes it. */
export type OccurrenceDialogState =
  /** A new occasion: for the sermon given, or for one chosen in the form. */
  | { mode: "record"; sermon?: { id: string; title: string } }
  /** One occasion, to read, change, or remove. */
  | { mode: "view"; item: HistoryItem }
  | null;

type OccurrenceDialogProps = {
  state: OccurrenceDialogState;
  onClose: () => void;
  /** The account's venues and contexts, to choose from. */
  venues: readonly ReferenceOption[];
  contexts: readonly ReferenceOption[];
  /** Offers the way to the sermon's own page, where that is not the page already. */
  linkToSermon?: boolean;
};

/**
 * Room for the dialog to float: wide enough to stand clear of the edges, and
 * tall enough to keep its fields and its footer both in view. Anything less
 * gets the whole screen, so the form keeps its height when the keyboard comes up.
 */
const roomToFloat = "(min-width: 48rem) and (min-height: 40rem)";

/**
 * One occasion a sermon was preached on: recorded, read, changed, or removed.
 * The same dialog serves the history section and a sermon's own page. Nothing
 * is shown as done before the server says so, and removing an occasion never
 * touches its sermon.
 */
export function OccurrenceDialog({
  state,
  onClose,
  venues,
  contexts,
  linkToSermon = true,
}: OccurrenceDialogProps) {
  // The one last opened stays drawn while the dialog closes over it.
  const [shown, setShown] = useState(state);
  // Counts the openings, so each has a form, and a new occasion an ID, of its own.
  const [opening, setOpening] = useState(0);
  if (state && state !== shown) {
    setShown(state);
    setOpening(opening + 1);
  }
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const wide = useMediaQuery(roomToFloat);
  const box = useRef<HTMLInputElement>(null);

  function close() {
    setDirty(false);
    onClose();
  }

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open, details) => {
        // A request in flight finishes first.
        if (open || busy) return;
        // A stray click beside the dialog does not throw away what was written.
        if (dirty && details?.reason === "outside-press") return;
        close();
      }}
    >
      <DialogContent
        placement={wide ? "top" : "full"}
        className={wide ? "max-w-xl" : undefined}
        initialFocus={shown?.mode === "record" && !shown.sermon ? box : undefined}
      >
        {shown?.mode === "record" && (
          <OccurrenceForm
            key={opening}
            sermon={shown.sermon}
            box={box}
            venues={venues}
            contexts={contexts}
            onDirty={setDirty}
            onBusy={setBusy}
            onCancel={close}
            onDone={close}
          />
        )}
        {shown?.mode === "view" && (
          <OccurrenceView
            key={opening}
            item={shown.item}
            venues={venues}
            contexts={contexts}
            linkToSermon={linkToSermon}
            onDirty={setDirty}
            onBusy={setBusy}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Shared = {
  venues: readonly ReferenceOption[];
  contexts: readonly ReferenceOption[];
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
};

/** One occasion, read. Everything that was recorded is here, and nothing that was not. */
function OccurrenceView({
  item,
  venues,
  contexts,
  linkToSermon,
  onDirty,
  onBusy,
  onClose,
}: Shared & { item: HistoryItem; linkToSermon: boolean; onClose: () => void }) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const locale = useLocale();
  const words = useT("preaching");
  const t = words.detail;
  const ideas = useT("ideas");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  if (editing) {
    return (
      <OccurrenceForm
        item={item}
        venues={venues}
        contexts={contexts}
        onDirty={onDirty}
        onBusy={onBusy}
        onCancel={() => {
          onDirty(false);
          setEditing(false);
        }}
        onDone={onClose}
      />
    );
  }

  const date = formatDay(item.preachedOn, locale);
  const length =
    item.durationMinutes === null
      ? null
      : words.duration(
          splitDuration(item.durationMinutes).hours,
          splitDuration(item.durationMinutes).minutes,
        );

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    onBusy(true);
    const outcome = await deleteOccurrence(item.id).catch((): ActionResult => ({
      ok: false,
      message: words.offline,
    }));
    setDeleting(false);
    onBusy(false);
    if (!outcome.ok) {
      setConfirming(false);
      return setResult(outcome);
    }
    toast({ message: outcome.message });
    router.refresh();
    onClose();
  }

  const row = "grid gap-0.5 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4";
  const term = "text-[0.8125rem] text-muted-foreground";

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy={deleting}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            <time dateTime={item.preachedOn}>{date}</time>
            {item.timeOfDay && <> · {words.timesOfDay[item.timeOfDay]}</>}
          </DialogDescription>
        </div>
        <DialogClose label={t.close} className="-mr-2" disabled={deleting} />
      </div>

      <div className="min-h-0 flex-1 scroll-quiet overflow-y-auto overscroll-contain px-5 pb-2">
        <p className={term}>{t.sermon}</p>
        <p className="mt-0.5 font-serif text-xl leading-snug font-medium text-pretty">
          {item.sermon.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {item.sermon.archivedAt && <Badge tone="muted">{ideas.archived}</Badge>}
          {item.sermon.kind !== "sermon" && (
            <span className="text-xs text-muted-foreground">
              {words.history.results.notSermon(ideas.kinds[item.sermon.kind])}
            </span>
          )}
          {linkToSermon && (
            <Link
              href={`${routes.library}/${item.sermon.id}`}
              className="rounded-sm text-sm font-medium text-primary link-underline"
            >
              {t.openSermon}
            </Link>
          )}
        </div>

        <dl className="mt-4 divide-y border-t">
          <div className={row}>
            <dt className={term}>{t.date}</dt>
            <dd className="text-sm">
              {date}
              {item.timeOfDay && (
                <span className="text-muted-foreground">
                  {" "}
                  · {words.timesOfDay[item.timeOfDay]} ({words.timeOfDayMeanings[item.timeOfDay]})
                </span>
              )}
            </dd>
          </div>
          {item.venue && (
            <div className={row}>
              <dt className={term}>{t.venue}</dt>
              <dd className="text-sm">{referenceLabel(item.venue)}</dd>
            </div>
          )}
          {item.context && (
            <div className={row}>
              <dt className={term}>{t.context}</dt>
              <dd className="text-sm">{item.context.name}</dd>
            </div>
          )}
          {item.actualFormat !== defaultActualFormat && (
            <div className={row}>
              <dt className={term}>{t.format}</dt>
              <dd className="text-sm">{ideas.formats[item.actualFormat]}</dd>
            </div>
          )}
          {length && (
            <div className={row}>
              <dt className={term}>{t.duration}</dt>
              <dd className="text-sm tabular-nums">{length}</dd>
            </div>
          )}
          {item.notes && (
            <div className={row}>
              <dt className={term}>{t.notes}</dt>
              <dd className="text-sm leading-relaxed whitespace-pre-line">{item.notes}</dd>
            </div>
          )}
          {item.recordingUrl && (
            <div className={row}>
              <dt className={term}>{t.recording}</dt>
              <dd className="min-w-0 text-sm">
                <a
                  href={item.recordingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-sm font-medium text-primary link-underline"
                >
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{t.openRecording}</span>
                  <span className="sr-only">{t.newTab}</span>
                </a>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {URL.canParse(item.recordingUrl)
                    ? new URL(item.recordingUrl).hostname
                    : item.recordingUrl}
                </p>
              </dd>
            </div>
          )}
        </dl>
        <ActionStatus result={result} />
      </div>

      {confirming ? (
        // Asked here, in the dialog's own footer, so one layer never sits on another.
        <div
          role="alertdialog"
          aria-labelledby={`${id}-confirm`}
          aria-describedby={`${id}-confirm-detail`}
          className="shrink-0 animate-menu border-t px-5 py-4"
        >
          <p id={`${id}-confirm`} className="text-sm font-semibold">
            {t.confirmDelete(item.sermon.title, date)}
          </p>
          <p id={`${id}-confirm-detail`} className="mt-1 text-sm text-muted-foreground">
            {t.confirmDetail}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              // Focus lands on the way back, so a second Enter cannot remove anything.
              autoFocus
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              {t.keep}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              aria-busy={deleting}
              onClick={() => void remove()}
            >
              {deleting && <LoaderCircle className="animate-spin" aria-hidden />}
              {deleting ? t.deleting : t.delete}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 px-3 text-muted-foreground hover:text-destructive"
            onClick={() => {
              setResult(null);
              setConfirming(true);
            }}
          >
            <Trash2 aria-hidden />
            {t.delete}
          </Button>
          <Button type="button" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {t.edit}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Hours and minutes as typed, in whole minutes: null when neither was given, NaN when one is not a number. */
function readDuration(hours: string, minutes: string): number | null {
  const [h, m] = [hours.trim(), minutes.trim()];
  if (!h && !m) return null;
  if (!/^\d*$/.test(h) || !/^\d*$/.test(m)) return Number.NaN;
  return Number(h || 0) * 60 + Number(m || 0);
}

/** Both lists as one, each venue or context once: those made in this form are not on the page yet. */
function withMade(listed: readonly ReferenceOption[], made: readonly ReferenceOption[]) {
  const known = new Set(listed.map((option) => option.id));
  return [...listed, ...made.filter((option) => !known.has(option.id))];
}

/**
 * The form for a new occasion, or for changing one. A new one is sent with an
 * ID made here, once, when the form opens: sent again after a failure or a
 * lost answer, it is the same occasion and is recorded once. A change sends
 * only the fields that differ, with null for one that was cleared.
 */
function OccurrenceForm({
  item,
  sermon: fixed,
  box,
  venues,
  contexts,
  onDirty,
  onBusy,
  onCancel,
  onDone,
}: Shared & {
  /** The occasion being changed. Without one, this records a new occasion. */
  item?: HistoryItem;
  /** The sermon a new occasion is for, when the page already knows. */
  sermon?: { id: string; title: string };
  box?: React.RefObject<HTMLInputElement | null>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const locale = useLocale();
  const words = useT("preaching");
  const t = words.form;
  const formats = useT("ideas").formats;
  const ownBox = useRef<HTMLInputElement>(null);
  // Made once for this form, and sent with every attempt to record from it.
  const [occurrenceId] = useState(() => crypto.randomUUID());

  const started = item?.durationMinutes == null ? null : splitDuration(item.durationMinutes);
  const [sermon, setSermon] = useState<SermonMatch | null>(null);
  const [preachedOn, setPreachedOn] = useState(item?.preachedOn ?? localDate());
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayFilter>(item?.timeOfDay ?? "unspecified");
  const [venueId, setVenueId] = useState(item?.venueId ?? null);
  const [contextId, setContextId] = useState(item?.contextId ?? null);
  const [actualFormat, setActualFormat] = useState<ActualFormat>(
    item?.actualFormat ?? defaultActualFormat,
  );
  const [hours, setHours] = useState(started && started.hours > 0 ? String(started.hours) : "");
  const [minutes, setMinutes] = useState(started ? String(started.minutes) : "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [recordingUrl, setRecordingUrl] = useState(item?.recordingUrl ?? "");
  const [madeVenues, setMadeVenues] = useState<ReferenceOption[]>([]);
  const [madeContexts, setMadeContexts] = useState<ReferenceOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [working, setWorking] = useState(false);

  const over = notes.length > preachingLimits.notes;
  const picking = !item && !fixed;

  function edited<Value>(set: (value: Value) => void, field?: string) {
    return (value: Value) => {
      set(value);
      onDirty(true);
      if (result && !result.ok) setResult(null);
      if (field && errors[field]) {
        setErrors((current) => {
          const rest = { ...current };
          delete rest[field];
          return rest;
        });
      }
    };
  }

  function refuse(issues: readonly { path: PropertyKey[]; message: string }[]) {
    const found: Record<string, string> = {};
    for (const issue of issues) found[String(issue.path[0] ?? "form")] ??= issue.message;
    setErrors(found);
    setResult({ ok: false, message: Object.values(found)[0] });
  }

  async function send(run: () => Promise<ActionResult>) {
    setWorking(true);
    onBusy(true);
    setResult(null);
    const outcome = await run().catch((): ActionResult => ({ ok: false, message: words.offline }));
    setWorking(false);
    onBusy(false);
    if (!outcome.ok) return setResult(outcome);
    toast({ message: outcome.message });
    // The action has told the page already; this is for a page that was kept.
    router.refresh();
    onDone();
  }

  async function submit() {
    if (working || over) return;
    const schemas = preachingSchemas(locale);
    const written = {
      preachedOn,
      timeOfDay: timeOfDay === "unspecified" ? null : timeOfDay,
      venueId,
      contextId,
      actualFormat,
      durationMinutes: readDuration(hours, minutes),
      notes: notes.trim() || null,
      recordingUrl: recordingUrl.trim() || null,
    };

    if (!item) {
      const parsed = schemas.occurrenceInput.safeParse({
        sermonId: fixed?.id ?? sermon?.id ?? "",
        ...written,
      });
      if (!parsed.success) return refuse(parsed.error.issues);
      return send(() => recordOccurrence(parsed.data, occurrenceId));
    }

    // Only what was changed is sent, so a field not touched here cannot be moved.
    const change = Object.fromEntries(
      (Object.keys(written) as (keyof typeof written)[])
        .filter((key) => !Object.is(written[key], item[key]))
        .map((key) => [key, written[key]]),
    );
    if (Object.keys(change).length === 0) return onCancel();
    const parsed = schemas.occurrenceUpdate.safeParse(change);
    if (!parsed.success) return refuse(parsed.error.issues);
    return send(() => updateOccurrence(item.id, parsed.data));
  }

  const problem = (field: string) =>
    errors[field] ? (
      <p
        id={`${id}-${field}-error`}
        role="alert"
        className="mt-1.5 text-[0.8125rem] font-medium text-destructive"
      >
        {errors[field]}
      </p>
    ) : null;
  const invalid = (field: string) =>
    errors[field]
      ? ({ "aria-invalid": true, "aria-describedby": `${id}-${field}-error` } as const)
      : {};
  const optional = <span className="font-normal text-muted-foreground">{t.optional}</span>;
  const title = item?.sermon.title ?? fixed?.title;

  return (
    <form
      noValidate
      aria-busy={working}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <DialogTitle>{item ? t.editTitle : t.recordTitle}</DialogTitle>
          {title ? (
            // The sermon is said whole, and wraps: it is what the record is of.
            <DialogDescription className="mt-0.5 font-serif text-base text-pretty text-foreground">
              {title}
            </DialogDescription>
          ) : (
            <DialogDescription>{t.recordDescriptionPick}</DialogDescription>
          )}
        </div>
        <DialogClose label={t.close} className="-mr-2" disabled={working} />
      </div>

      <div className="min-h-0 flex-1 scroll-quiet space-y-5 overflow-y-auto overscroll-contain px-5 pb-1">
        {picking && (
          <SermonPicker
            value={sermon}
            onChange={edited(setSermon, "sermonId")}
            error={errors.sermonId}
            box={box ?? ownBox}
            disabled={working}
          />
        )}

        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <div className="min-w-0">
            <Label htmlFor={`${id}-date`}>{t.date}</Label>
            <Input
              id={`${id}-date`}
              type="date"
              required
              value={preachedOn}
              onChange={(event) => edited(setPreachedOn, "preachedOn")(event.target.value)}
              min={earliestPreachedOn}
              max={latestDateOnEarth()}
              className="mt-2"
              {...invalid("preachedOn")}
            />
            {problem("preachedOn")}
          </div>
          <Segmented
            label={t.timeOfDay}
            name={`${id}-time`}
            options={timeOfDayFilters.map((value) => ({
              value,
              label: value === "unspecified" ? words.timeNotSpecified : words.timesOfDay[value],
            }))}
            value={timeOfDay}
            onChange={edited(setTimeOfDay)}
            disabled={working}
            // "Not specified" is the long one, and needs the room.
            className="[&_label:last-child]:flex-[2.2]"
          />
        </div>

        <ReferenceField
          kind="venue"
          value={venueId}
          onChange={edited(setVenueId, "venueId")}
          options={withMade(venues, madeVenues)}
          onCreated={(option) => setMadeVenues((current) => [...current, option])}
          disabled={working}
        />
        <ReferenceField
          kind="context"
          value={contextId}
          onChange={edited(setContextId, "contextId")}
          options={withMade(contexts, madeContexts)}
          onCreated={(option) => setMadeContexts((current) => [...current, option])}
          disabled={working}
        />

        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-sm leading-none font-medium">
              {t.format} {optional}
            </p>
            <Select
              label={t.format}
              value={actualFormat}
              onChange={(value) => edited(setActualFormat)(value as ActualFormat)}
              options={actualFormats.map((value) => ({ value, label: formats[value] }))}
              disabled={working}
              className="mt-2 w-full"
            />
            <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{t.formatHint}</p>
          </div>
          <fieldset className="min-w-0">
            <legend className="text-sm leading-none font-medium">
              {t.duration} {optional}
            </legend>
            <div className="mt-2 flex items-center gap-2">
              <Input
                aria-label={t.hours}
                inputMode="numeric"
                value={hours}
                onChange={(event) => edited(setHours, "durationMinutes")(event.target.value)}
                maxLength={2}
                autoComplete="off"
                className="w-16 text-center tabular-nums"
                {...invalid("durationMinutes")}
              />
              <span className="text-sm text-muted-foreground" aria-hidden>
                {t.hoursShort}
              </span>
              <Input
                aria-label={t.minutes}
                inputMode="numeric"
                value={minutes}
                onChange={(event) => edited(setMinutes, "durationMinutes")(event.target.value)}
                maxLength={4}
                autoComplete="off"
                className="w-16 text-center tabular-nums"
                {...invalid("durationMinutes")}
              />
              <span className="text-sm text-muted-foreground" aria-hidden>
                {t.minutesShort}
              </span>
            </div>
            {problem("durationMinutes")}
          </fieldset>
        </div>

        <div>
          <Label htmlFor={`${id}-notes`} className="gap-1">
            {t.notes} {optional}
          </Label>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            onChange={(event) => edited(setNotes, "notes")(event.target.value)}
            placeholder={t.notesPlaceholder}
            aria-invalid={over ? true : undefined}
            aria-describedby={`${id}-notes-count`}
            className="mt-2"
          />
          <p
            id={`${id}-notes-count`}
            className={cn(
              "mt-1 text-right text-xs tabular-nums",
              over ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {t.count(
              formatNumber(locale, notes.length),
              formatNumber(locale, preachingLimits.notes),
            )}
            <span className="sr-only">{t.characters}</span>
          </p>
        </div>

        <div>
          <Label htmlFor={`${id}-recording`} className="gap-1">
            {t.recording} {optional}
          </Label>
          <Input
            id={`${id}-recording`}
            type="url"
            inputMode="url"
            value={recordingUrl}
            onChange={(event) => edited(setRecordingUrl, "recordingUrl")(event.target.value)}
            placeholder="https://"
            maxLength={preachingLimits.recordingUrl}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-2"
            {...(errors.recordingUrl
              ? invalid("recordingUrl")
              : { "aria-describedby": `${id}-recording-hint` })}
          />
          {problem("recordingUrl") ?? (
            <p
              id={`${id}-recording-hint`}
              className="mt-1.5 text-[0.8125rem] text-muted-foreground"
            >
              {t.recordingHint}
            </p>
          )}
        </div>

        <ActionStatus result={result} />
      </div>

      <div className="mt-3 flex shrink-0 justify-end gap-2 border-t px-5 py-4">
        <Button type="button" variant="outline" disabled={working} onClick={onCancel}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={working || over} aria-busy={working}>
          {working && <LoaderCircle className="animate-spin" aria-hidden />}
          {item ? (working ? t.savingChanges : t.saveChanges) : working ? t.saving : t.save}
        </Button>
      </div>
    </form>
  );
}
