"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, LoaderCircle, Trash2 } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { readerHref } from "../../reader-location";
import { deleteFavorite, updateFavorite } from "../../saved/actions";
import { savedLimits, type FavoriteSummary } from "../../saved/model";
import { defaultSavedQuery, savedHref } from "../../saved/saved-query";
import { formatVerseSet, parseVerseSet, sameVerses } from "../../saved/verse-set";
import { translations } from "../../translations";
import { dropFavorite, putFavorite } from "../../use-chapter-marks";

type FavoriteEditorProps = {
  /** The favorite being edited. Null closes the dialog. */
  favorite: FavoriteSummary | null;
  onClose: () => void;
  onSaved?: (favorite: FavoriteSummary) => void;
  onDeleted?: (id: string) => void;
  /** Offers the way to the passage in the Bible, where it is not already on screen. */
  linkToBible?: boolean;
};

/**
 * One saved passage, to change or remove: which verses it is, what it is
 * called, and what was noted beside it. The same dialog serves the Bible
 * reader and the library. Nothing is shown as done before the server says so.
 */
export function FavoriteEditor({
  favorite,
  onClose,
  onSaved,
  onDeleted,
  linkToBible,
}: FavoriteEditorProps) {
  // The one last opened stays drawn while the dialog closes over it.
  const [shown, setShown] = useState(favorite);
  if (favorite && favorite !== shown) setShown(favorite);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={favorite !== null}
      onOpenChange={(open, details) => {
        if (open || busy) return;
        // A stray click beside the dialog does not throw away what was written.
        if (dirty && details?.reason === "outside-press") return;
        onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        {shown && (
          <EditorForm
            // A form of its own for each favorite: nothing typed for one is carried to the next.
            key={shown.id}
            favorite={shown}
            linkToBible={linkToBible}
            onDirty={setDirty}
            onBusy={setBusy}
            onClose={() => {
              setDirty(false);
              onClose();
            }}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({
  favorite,
  linkToBible,
  onDirty,
  onBusy,
  onClose,
  onSaved,
  onDeleted,
}: {
  favorite: FavoriteSummary;
  linkToBible?: boolean;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
  onSaved?: (favorite: FavoriteSummary) => void;
  onDeleted?: (id: string) => void;
}) {
  const id = useId();
  const toast = useToast();
  const t = useT("scripture").saved.editor;
  const locale = useLocale();
  const offline: ActionResult = { ok: false, message: useT("scripture").saved.offline };
  // A favorite belongs to one translation, and its passage is written as that one names the books.
  const translation = translations[favorite.translation];
  const [passage, setPassage] = useState(favorite.reference);
  const [label, setLabel] = useState(favorite.label ?? "");
  const [notes, setNotes] = useState(favorite.notes ?? "");
  const [passageProblem, setPassageProblem] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  /** Set when the verses asked for are another favorite's: a search that finds that one. */
  const [conflict, setConflict] = useState<string | null>(null);
  const [working, setWorking] = useState<"save" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const passageBox = useRef<HTMLInputElement>(null);

  const [first] = favorite.verses;
  const over = notes.length > savedLimits.notes;

  function edited<Value>(set: (value: Value) => void) {
    return (value: Value) => {
      set(value);
      onDirty(true);
      if (result && !result.ok) setResult(null);
      setConflict(null);
    };
  }

  function run(kind: "save" | "delete", busy: boolean) {
    setWorking(busy ? kind : null);
    onBusy(busy);
  }

  async function save() {
    if (working) return;
    const read = parseVerseSet(passage, locale);
    if (!read.ok) {
      setPassageProblem(read.message);
      return passageBox.current?.focus();
    }
    if (read.verses.length > savedLimits.verses) {
      setPassageProblem(t.tooManyVerses(savedLimits.verses));
      return passageBox.current?.focus();
    }
    if (over) return;

    run("save", true);
    const outcome = await updateFavorite(favorite.id, {
      label,
      notes,
      // The verses are sent only when they were changed, so an edit to the notes cannot move them.
      ...(sameVerses(read.verses, favorite.verses) ? {} : { verses: read.verses }),
    }).catch(() => offline);
    run("save", false);

    if (!outcome.ok || !("favorite" in outcome) || !outcome.favorite) {
      setResult(outcome);
      if ("conflictId" in outcome && outcome.conflictId) {
        setConflict(formatVerseSet(read.verses, translation.language));
      }
      return;
    }
    putFavorite(outcome.favorite);
    toast({ message: outcome.message });
    onSaved?.(outcome.favorite);
    onClose();
  }

  async function remove() {
    if (working) return;
    run("delete", true);
    const outcome = await deleteFavorite(favorite.id).catch(() => offline);
    run("delete", false);
    if (!outcome.ok) {
      setConfirming(false);
      return setResult(outcome);
    }
    dropFavorite(favorite.id);
    toast({ message: outcome.message });
    onDeleted?.(favorite.id);
    onClose();
  }

  return (
    <form
      noValidate
      aria-busy={working !== null}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex min-h-0 flex-col"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>
            {favorite.reference} · {translation.name}
          </DialogDescription>
        </div>
        <DialogClose label={t.close} className="-mr-2" disabled={working !== null} />
      </div>

      <div className="min-h-0 flex-1 scroll-quiet space-y-4 overflow-y-auto px-5 pb-1">
        <div>
          <Label htmlFor={`${id}-passage`}>{t.passage}</Label>
          <Input
            ref={passageBox}
            id={`${id}-passage`}
            value={passage}
            onChange={(event) => {
              edited(setPassage)(event.target.value);
              setPassageProblem(null);
            }}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            aria-invalid={passageProblem ? true : undefined}
            aria-describedby={`${id}-passage-help`}
            className="mt-2 font-serif italic"
          />
          <p
            id={`${id}-passage-help`}
            role={passageProblem ? "alert" : undefined}
            className={cn(
              "mt-1.5 text-[0.8125rem]",
              passageProblem ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {passageProblem ?? t.passageHelp}
          </p>
        </div>

        <div>
          <Label htmlFor={`${id}-label`}>
            {t.label} <span className="font-normal text-muted-foreground">{t.optional}</span>
          </Label>
          <Input
            id={`${id}-label`}
            value={label}
            onChange={(event) => edited(setLabel)(event.target.value)}
            maxLength={savedLimits.label}
            placeholder={t.labelPlaceholder}
            autoComplete="off"
            className="mt-2"
          />
        </div>

        <div>
          <Label htmlFor={`${id}-notes`}>
            {t.notes} <span className="font-normal text-muted-foreground">{t.optional}</span>
          </Label>
          <Textarea
            id={`${id}-notes`}
            value={notes}
            onChange={(event) => edited(setNotes)(event.target.value)}
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
            {t.count(formatNumber(locale, notes.length), formatNumber(locale, savedLimits.notes))}
            <span className="sr-only">{t.characters}</span>
          </p>
        </div>

        <ActionStatus result={result} />
        {conflict && (
          <p className="text-sm">
            <Link
              href={savedHref({ ...defaultSavedQuery, q: conflict })}
              className="rounded-sm font-medium text-primary link-underline"
            >
              {t.findExisting}
            </Link>
          </p>
        )}
      </div>

      {confirming ? (
        // Asked here, in the dialog's own footer, so one layer never sits on another.
        <div
          role="alertdialog"
          aria-labelledby={`${id}-confirm`}
          aria-describedby={`${id}-confirm-detail`}
          className="mt-3 animate-menu border-t px-5 py-4"
        >
          <p id={`${id}-confirm`} className="text-sm font-semibold">
            {t.confirmRemove(favorite.reference)}
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
              disabled={working !== null}
              onClick={() => setConfirming(false)}
            >
              {t.keep}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={working !== null}
              aria-busy={working === "delete"}
              onClick={() => void remove()}
            >
              {working === "delete" && <LoaderCircle className="animate-spin" aria-hidden />}
              {working === "delete" ? t.removing : t.remove}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="-ml-3 px-3 text-muted-foreground hover:text-destructive"
            disabled={working !== null}
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden />
            {t.remove}
          </Button>
          {linkToBible && first && (
            <Link
              href={readerHref({
                book: first.book,
                chapter: first.chapter,
                verse: first.verse,
                // Opened in the translation it was saved from, whatever the reader usually reads.
                translation: favorite.translation,
              })}
              className={buttonVariants({
                variant: "ghost",
                className: "px-3 text-muted-foreground hover:text-foreground",
              })}
            >
              <BookOpen aria-hidden />
              {t.openInBible}
            </Link>
          )}
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="outline" disabled={working !== null} onClick={onClose}>
              {t.cancel}
            </Button>
            <Button
              type="submit"
              disabled={working !== null || over}
              aria-busy={working === "save"}
            >
              {working === "save" && <LoaderCircle className="animate-spin" aria-hidden />}
              {working === "save" ? t.saving : t.save}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
