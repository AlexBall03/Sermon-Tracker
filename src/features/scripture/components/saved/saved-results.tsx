"use client";

import { useState } from "react";
import Link from "next/link";
import { Lightbulb, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { AttachScripture } from "@/features/ideas/components/attach-scripture";
import { useReading } from "@/features/preferences/client";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chaptersIn } from "../../books";
import { firstLocation, readerHref } from "../../reader-location";
import type { ScriptureReference } from "../../reference";
import { deleteFavorite } from "../../saved/actions";
import type { ListedFavorite } from "../../saved/favorites";
import { highlightBackground } from "../../saved/highlight-style";
import type { FavoriteSummary } from "../../saved/model";
import { versesToRuns } from "../../saved/verse-set";
import { translations } from "../../translations";
import { dropFavorite } from "../../use-chapter-marks";
import { FavoriteEditor } from "./favorite-editor";

/** "3:16", or "5" in a book of one chapter: where a previewed verse is, said shortly. */
function place({ book, chapter, verse }: { book: number; chapter: number; verse: number }) {
  return chaptersIn(book) === 1 ? String(verse) : `${chapter}:${verse}`;
}

/**
 * One page of saved passages. Each is set as Scripture is everywhere: the
 * reference in the serif italic, its opening verses beneath, then whatever
 * was noted beside it. The reference leads to the passage in the Bible; a
 * passage is changed in the same dialog the reader uses, and removed behind a
 * confirmation.
 *
 * "Add to idea" is the reader's own dialog, given the passage's verses as
 * references. What reaches the idea is those references and nothing of the
 * favorite: removing either afterwards leaves the other as it is.
 *
 * A passage is quoted from, and opened in, the translation it was saved from;
 * where more than one is on offer, each says which that is.
 */
export function SavedResults({ favorites, label }: { favorites: ListedFavorite[]; label: string }) {
  const toast = useToast();
  const t = useT("scripture").saved.results;
  const colors = useT("scripture").marks.colors;
  const locale = useLocale();
  const reading = useReading();
  const offline: ActionResult = { ok: false, message: useT("scripture").saved.offline };
  const [editing, setEditing] = useState<FavoriteSummary | null>(null);
  const [attaching, setAttaching] = useState<ScriptureReference[] | null>(null);
  const [removing, setRemoving] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function askToRemove(favorite: ListedFavorite) {
    setProblem(null);
    setRemoving({
      title: t.removeTitle(favorite.label ?? favorite.reference),
      description: t.removeDetail,
      confirmLabel: t.remove,
      destructive: true,
      run: async () => {
        const outcome = await deleteFavorite(favorite.id);
        if (outcome.ok) dropFavorite(favorite.id);
        return outcome;
      },
    });
  }

  async function confirm(request: Confirmation) {
    setBusy(true);
    const outcome = await request.run().catch(() => offline);
    setBusy(false);
    setRemoving(null);
    // The list is brought up to date by the action itself; this only says what happened.
    if (outcome.ok) toast({ message: outcome.message });
    else setProblem(outcome.message);
  }

  return (
    <>
      {problem && (
        <p role="alert" className="mb-3 text-sm font-medium text-destructive">
          {problem}
        </p>
      )}
      <ul aria-label={label} className="grid gap-3 lg:grid-cols-2">
        {favorites.map((favorite) => {
          const [first] = favorite.verses;
          const more = favorite.verses.length - favorite.preview.length;
          const name = favorite.label ?? favorite.reference;
          const translation = translations[favorite.translation];
          // Without a label the reference is the passage's name, and so its heading.
          const Reference = favorite.label ? "p" : "h3";
          return (
            <li
              key={favorite.id}
              className="flex min-w-0 flex-col rounded-xl border bg-surface p-4 shadow-card transition-[border-color] duration-150 focus-within:border-primary/70 hover:border-primary/70"
            >
              <div className="min-w-0 flex-1">
                {favorite.label && (
                  <h3 className="font-serif text-lg leading-snug font-medium text-pretty">
                    {favorite.label}
                  </h3>
                )}
                <Reference
                  className={cn("font-serif italic", favorite.label ? "mt-0.5" : "text-lg")}
                >
                  <Link
                    // In the translation it was saved from, whatever the reader usually reads.
                    href={readerHref({
                      ...(first ?? firstLocation),
                      translation: favorite.translation,
                    })}
                    title={t.openInTheBible}
                    className="rounded-sm font-medium text-primary link-underline"
                  >
                    {favorite.reference}
                    <span className="sr-only">{t.openSuffix}</span>
                  </Link>
                  {reading.translations.length > 1 && (
                    <span
                      data-translation={translation.id}
                      title={translation.name}
                      className="ml-2 align-middle font-sans text-[0.6875rem] font-semibold tracking-wide text-muted-foreground not-italic"
                    >
                      {translation.short}
                    </span>
                  )}
                </Reference>

                {favorite.preview.length > 0 && (
                  <p
                    lang={translation.language}
                    className="mt-2.5 line-clamp-4 font-serif text-[0.9375rem] leading-relaxed"
                  >
                    {favorite.preview.map((verse) => (
                      <span key={`${verse.book}.${verse.chapter}.${verse.verse}`}>
                        {/* One verse needs no number: its reference is right above it. */}
                        {favorite.verses.length > 1 && (
                          <span className="mr-1 font-sans text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
                            {place(verse)}
                          </span>
                        )}
                        {verse.text}{" "}
                      </span>
                    ))}
                  </p>
                )}
                {more > 0 && favorite.preview.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{t.more(more)}</p>
                )}

                {favorite.notes && (
                  <p className="mt-3 line-clamp-3 border-l-2 pl-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                    <span className="sr-only">{t.notes} </span>
                    {favorite.notes}
                  </p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                {favorite.colors.length > 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="flex gap-1" aria-hidden>
                      {favorite.colors.map((color) => (
                        <span
                          key={color}
                          className={cn(
                            "size-3 rounded-full border border-foreground/15",
                            highlightBackground[color],
                          )}
                        />
                      ))}
                    </span>
                    {/* Named as well as shown. */}
                    <span>
                      <span className="sr-only">{t.highlighted} </span>
                      {favorite.colors.map((color) => colors[color]).join(", ")}
                    </span>
                  </p>
                )}
                <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  {t.saved}{" "}
                  <time dateTime={favorite.createdAt.toISOString()}>
                    {formatDate(favorite.createdAt, locale)}
                  </time>
                </p>
                <div className="-mr-2 -mb-1.5 ml-auto flex flex-wrap justify-end gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-2.5 text-muted-foreground hover:text-foreground"
                    aria-label={t.addNamed(name)}
                    aria-haspopup="dialog"
                    onClick={() => setAttaching(versesToRuns(favorite.verses))}
                  >
                    <Lightbulb aria-hidden />
                    {t.addToIdea}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-2.5 text-muted-foreground hover:text-foreground"
                    aria-label={t.editNamed(name)}
                    aria-haspopup="dialog"
                    onClick={() => setEditing(favorite)}
                  >
                    <Pencil aria-hidden />
                    {t.edit}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-2.5 text-muted-foreground hover:text-destructive"
                    aria-label={t.removeNamed(name)}
                    aria-haspopup="dialog"
                    onClick={() => askToRemove(favorite)}
                  >
                    <Trash2 aria-hidden />
                    {t.remove}
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <FavoriteEditor favorite={editing} onClose={() => setEditing(null)} linkToBible />
      <AttachScripture references={attaching} onClose={() => setAttaching(null)} />
      <ConfirmDialog
        confirmation={removing}
        busy={busy}
        onConfirm={(request) => void confirm(request)}
        onCancel={() => !busy && setRemoving(null)}
      />
    </>
  );
}
