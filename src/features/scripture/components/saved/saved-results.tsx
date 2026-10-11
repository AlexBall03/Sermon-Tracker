"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { chaptersIn } from "../../books";
import { firstLocation, readerHref } from "../../reader-location";
import { deleteFavorite } from "../../saved/actions";
import type { ListedFavorite } from "../../saved/favorites";
import { highlightBackground } from "../../saved/highlight-style";
import { highlightColorLabels, type FavoriteSummary } from "../../saved/model";
import { dropFavorite } from "../../use-chapter-marks";
import { FavoriteEditor } from "./favorite-editor";

const offline: ActionResult = {
  ok: false,
  message: "That did not reach the server. Check your connection and try again.",
};

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
 */
export function SavedResults({ favorites, label }: { favorites: ListedFavorite[]; label: string }) {
  const toast = useToast();
  const [editing, setEditing] = useState<FavoriteSummary | null>(null);
  const [removing, setRemoving] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function askToRemove(favorite: ListedFavorite) {
    setProblem(null);
    setRemoving({
      title: `Remove ${favorite.label ?? favorite.reference}?`,
      description:
        "It leaves your saved Scripture, with its label and notes. Highlights on these verses stay, and so do your ideas.",
      confirmLabel: "Remove",
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
                    href={readerHref(first ?? firstLocation)}
                    title="Open in the Bible"
                    className="rounded-sm font-medium text-primary link-underline"
                  >
                    {favorite.reference}
                    <span className="sr-only">, open in the Bible</span>
                  </Link>
                </Reference>

                {favorite.preview.length > 0 && (
                  <p className="mt-2.5 line-clamp-4 font-serif text-[0.9375rem] leading-relaxed">
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    and {more} more {more === 1 ? "verse" : "verses"}
                  </p>
                )}

                {favorite.notes && (
                  <p className="mt-3 line-clamp-3 border-l-2 pl-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                    <span className="sr-only">Notes: </span>
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
                      <span className="sr-only">Highlighted </span>
                      {favorite.colors.map((color) => highlightColorLabels[color]).join(", ")}
                    </span>
                  </p>
                )}
                <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  Saved{" "}
                  <time dateTime={favorite.createdAt.toISOString()}>
                    {formatDate(favorite.createdAt)}
                  </time>
                </p>
                <div className="-mr-2 -mb-1.5 ml-auto flex gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-2.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Edit ${name}`}
                    aria-haspopup="dialog"
                    onClick={() => setEditing(favorite)}
                  >
                    <Pencil aria-hidden />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-2.5 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${name}`}
                    aria-haspopup="dialog"
                    onClick={() => askToRemove(favorite)}
                  >
                    <Trash2 aria-hidden />
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <FavoriteEditor favorite={editing} onClose={() => setEditing(null)} linkToBible />
      <ConfirmDialog
        confirmation={removing}
        busy={busy}
        onConfirm={(request) => void confirm(request)}
        onCancel={() => !busy && setRemoving(null)}
      />
    </>
  );
}
