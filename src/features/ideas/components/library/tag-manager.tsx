"use client";

import { useId, useRef, useState } from "react";
import { LoaderCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { tagLimits } from "../../model";
import { createTag, deleteTag, renameTag } from "../../tag-actions";
import type { TagSummary } from "../../tags";
import { useLibrary } from "./library-state";

/** With more tags than this, the dialog offers a box to find one. */
const searchFrom = 8;

/**
 * Create, rename, and delete the account's tags, from the library.
 *
 * Nothing is shown as done until the server says so: a new tag appears, a
 * name changes, and a tag goes only when the action has answered and the
 * page has the new list. A refusal leaves what was typed where it was.
 * Deleting a tag takes it off its ideas and leaves the ideas alone.
 */
export function TagManager() {
  const { tags, managingTags, setManagingTags, query, apply } = useLibrary();
  const t = useT("ideas").tags.manage;
  const offline: ActionResult = { ok: false, message: t.offline };
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"create" | "rename" | "delete" | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TagSummary | null>(null);

  const confirmation: Confirmation | null = deleting && {
    title: t.deleteTitle(deleting.name),
    description: deleting.ideaCount === 0 ? t.deleteUnused : t.deleteUsed(deleting.ideaCount),
    confirmLabel: t.deleteConfirm,
    destructive: true,
    run: () => deleteTag(deleting.id),
  };

  function close() {
    if (busy) return;
    setManagingTags(false);
    setResult(null);
    setEditing(null);
    setEditError(null);
    setSearch("");
  }

  async function create() {
    if (busy) return;
    setBusy("create");
    setResult(null);
    const outcome = await createTag(name).catch(() => offline);
    setBusy(null);
    setResult(outcome);
    // What was typed stays until it has been saved.
    if (outcome.ok) setName("");
    nameRef.current?.focus();
  }

  async function rename() {
    if (busy || !editing) return;
    const current = tags.find((tag) => tag.id === editing.id);
    if (current && current.name === editing.name.trim()) return setEditing(null);
    setBusy("rename");
    setEditError(null);
    setResult(null);
    const outcome = await renameTag(editing.id, editing.name).catch(() => offline);
    setBusy(null);
    if (!outcome.ok) return setEditError(outcome.message);
    setEditing(null);
    setResult(outcome);
  }

  async function confirmDelete(request: Confirmation, tag: TagSummary) {
    setBusy("delete");
    const outcome = await request.run().catch(() => offline);
    setBusy(null);
    setDeleting(null);
    setResult(outcome);
    // A deleted tag cannot stay in the filter: it would match nothing, unexplained.
    if (outcome.ok && query.tagIds.includes(tag.id)) {
      apply((current) => ({ tagIds: current.tagIds.filter((value) => value !== tag.id) }), {
        history: "replace",
      });
    }
  }

  const wanted = search.trim().toLowerCase();
  const shown = wanted ? tags.filter((tag) => tag.name.toLowerCase().includes(wanted)) : tags;

  return (
    <>
      <Dialog open={managingTags} onOpenChange={(open) => (open ? setManagingTags(true) : close())}>
        <DialogContent initialFocus={nameRef} className="max-w-lg">
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
            <div className="min-w-0">
              <DialogTitle>{t.title}</DialogTitle>
              <DialogDescription>{t.description}</DialogDescription>
            </div>
            <DialogClose label={t.close} className="-mr-2" />
          </div>

          <form
            noValidate
            aria-busy={busy === "create"}
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
            className="border-b px-5 pb-4"
          >
            <label htmlFor={`${id}-name`} className="text-sm leading-none font-medium">
              {t.newTag}
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                ref={nameRef}
                id={`${id}-name`}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (result && !result.ok) setResult(null);
                }}
                maxLength={tagLimits.name}
                placeholder={t.placeholder}
                autoComplete="off"
                enterKeyHint="done"
                aria-invalid={result && !result.ok ? true : undefined}
              />
              <Button type="submit" disabled={busy !== null || !name.trim()}>
                {busy === "create" ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <Plus aria-hidden />
                )}
                {busy === "create" ? t.creating : t.create}
              </Button>
            </div>
            <ActionStatus result={result} />
          </form>

          <div className="min-h-0 flex-1 scroll-quiet overflow-y-auto overscroll-contain px-5 py-4">
            {tags.length === 0 ? (
              <div className="rounded-xl border border-dashed border-input px-5 py-8">
                <p className="font-display text-lg leading-snug font-medium">{t.noneTitle}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.noneBody}</p>
              </div>
            ) : (
              <>
                {tags.length > searchFrom && (
                  <div className="relative mb-3">
                    <Search
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      aria-label={t.find}
                      placeholder={t.find}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      autoComplete="off"
                      className="h-9 pl-9"
                    />
                  </div>
                )}
                <ul aria-label={t.yourTags} className="divide-y">
                  {shown.map((tag) =>
                    editing?.id === tag.id ? (
                      <li key={tag.id} className="py-2.5">
                        <form
                          noValidate
                          aria-busy={busy === "rename"}
                          onSubmit={(event) => {
                            event.preventDefault();
                            void rename();
                          }}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <Input
                            autoFocus
                            aria-label={t.newName(tag.name)}
                            value={editing.name}
                            onChange={(event) => {
                              setEditing({ id: tag.id, name: event.target.value });
                              setEditError(null);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Escape") return;
                              // Escape leaves the rename, not the dialog.
                              event.stopPropagation();
                              event.preventDefault();
                              setEditing(null);
                              setEditError(null);
                            }}
                            maxLength={tagLimits.name}
                            autoComplete="off"
                            enterKeyHint="done"
                            aria-invalid={editError ? true : undefined}
                            aria-describedby={editError ? `${id}-edit-error` : undefined}
                            className="h-9 min-w-0 flex-1 basis-full sm:basis-40"
                          />
                          <Button type="submit" size="sm" disabled={busy !== null}>
                            {busy === "rename" && (
                              <LoaderCircle className="animate-spin" aria-hidden />
                            )}
                            {busy === "rename" ? t.saving : t.save}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => {
                              setEditing(null);
                              setEditError(null);
                            }}
                          >
                            {t.cancel}
                          </Button>
                        </form>
                        {editError && (
                          <p
                            id={`${id}-edit-error`}
                            role="alert"
                            className="mt-1.5 text-[0.8125rem] font-medium text-destructive"
                          >
                            {editError}
                          </p>
                        )}
                      </li>
                    ) : (
                      <li key={tag.id} className="flex items-center gap-2 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{tag.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {tag.ideaCount === 0 ? t.notOnAny : t.on(tag.ideaCount)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t.renameNamed(tag.name)}
                          title={t.rename}
                          disabled={busy !== null}
                          onClick={() => {
                            setEditing({ id: tag.id, name: tag.name });
                            setEditError(null);
                            setResult(null);
                          }}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t.deleteNamed(tag.name)}
                          title={t.delete}
                          disabled={busy !== null}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            setResult(null);
                            setDeleting(tag);
                          }}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </li>
                    ),
                  )}
                </ul>
                {shown.length === 0 && (
                  <p className="py-4 text-sm text-muted-foreground">{t.noneNamed}</p>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmation={confirmation}
        busy={busy === "delete"}
        onConfirm={(request) => {
          if (deleting) void confirmDelete(request, deleting);
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
