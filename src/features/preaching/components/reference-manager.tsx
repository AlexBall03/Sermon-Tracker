"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";

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
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import {
  createContext,
  createVenue,
  deleteContext,
  deleteVenue,
  renameContext,
  updateVenue,
} from "../actions";
import { preachingLimits } from "../model";
import { preachingSchemas } from "../schemas";
import { suggestedContextOptions } from "../suggestions";

export type ReferenceKind = "venue" | "context";

/** A venue or a context as it is managed: with how many occasions name it. */
export type ManagedReference = {
  id: string;
  name: string;
  locality?: string | null;
  occurrenceCount: number;
};

type ReferenceManagerProps = {
  /** Which list is open. Null closes the dialog. */
  kind: ReferenceKind | null;
  venues: readonly ManagedReference[];
  contexts: readonly ManagedReference[];
  onClose: () => void;
  /** One was deleted: whatever was filtering by it should stop. */
  onDeleted?: (kind: ReferenceKind, id: string) => void;
};

/**
 * Create, rename, and delete the account's venues, or its contexts, in the
 * manner of the tag manager. Nothing is shown as done until the server says
 * so. Renaming keeps every record that names it. One that history names
 * cannot be deleted, and says so with how many records hold it; nothing in
 * history is ever changed to make room.
 */
export function ReferenceManager({
  kind,
  venues,
  contexts,
  onClose,
  onDeleted,
}: ReferenceManagerProps) {
  // The list last opened stays drawn while the dialog closes over it.
  const [shown, setShown] = useState<ReferenceKind>(kind ?? "venue");
  if (kind && kind !== shown) setShown(kind);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const t = useT("preaching").manage;

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent initialFocus={nameRef} className="max-w-lg">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <DialogTitle>{shown === "venue" ? t.venues.title : t.contexts.title}</DialogTitle>
            <DialogDescription>
              {shown === "venue" ? t.venues.description : t.contexts.description}
            </DialogDescription>
          </div>
          <DialogClose label={t.close} className="-mr-2" />
        </div>
        <ManagerBody
          // A list of its own for each kind: nothing typed for one is carried to the other.
          key={shown}
          kind={shown}
          items={shown === "venue" ? venues : contexts}
          nameRef={nameRef}
          onBusy={setBusy}
          onDeleted={onDeleted}
        />
      </DialogContent>
    </Dialog>
  );
}

type Editing = { id: string; name: string; locality: string };

function ManagerBody({
  kind,
  items,
  nameRef,
  onBusy,
  onDeleted,
}: {
  kind: ReferenceKind;
  items: readonly ManagedReference[];
  nameRef: React.RefObject<HTMLInputElement | null>;
  onBusy: (busy: boolean) => void;
  onDeleted?: (kind: ReferenceKind, id: string) => void;
}) {
  const id = useId();
  const router = useRouter();
  const locale = useLocale();
  const words = useT("preaching");
  const t = words.manage;
  const form = words.form;
  const venue = kind === "venue";
  const own = venue ? t.venues : t.contexts;
  const offline: ActionResult = { ok: false, message: words.offline };
  const [name, setName] = useState("");
  const [locality, setLocality] = useState("");
  const [working, setWorking] = useState<"create" | "rename" | "delete" | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ManagedReference | null>(null);
  /** The one that could not be deleted because history names it, and why. */
  const [held, setHeld] = useState<{ id: string; message: string } | null>(null);

  const taken = new Set(items.map((item) => item.name.toLowerCase()));
  const suggestions = venue
    ? []
    : suggestedContextOptions(locale).filter((item) => !taken.has(item.name.toLowerCase()));

  function run(kindOfWork: "create" | "rename" | "delete" | null) {
    setWorking(kindOfWork);
    onBusy(kindOfWork !== null);
  }

  async function create(given: string) {
    if (working) return;
    const schemas = preachingSchemas(locale);
    const parsed = venue
      ? schemas.venueInput.safeParse({ name: given, locality: locality || null })
      : schemas.contextName.safeParse(given);
    if (!parsed.success) {
      return setResult({ ok: false, message: parsed.error.issues[0]?.message ?? "" });
    }
    run("create");
    setResult(null);
    setHeld(null);
    const request: Promise<ActionResult> = venue
      ? createVenue(parsed.data)
      : createContext(parsed.data);
    const outcome = await request.catch(() => offline);
    run(null);
    setResult(outcome);
    if (!outcome.ok) return;
    // What was typed stays until it has been saved. A suggestion picked leaves it alone.
    if (given === name) {
      setName("");
      setLocality("");
    }
    router.refresh();
    nameRef.current?.focus();
  }

  async function rename() {
    if (working || !editing) return;
    const current = items.find((item) => item.id === editing.id);
    const sameName = current?.name === editing.name.trim();
    const sameLocality = (current?.locality ?? "") === editing.locality.trim();
    if (current && sameName && (!venue || sameLocality)) return setEditing(null);

    const schemas = preachingSchemas(locale);
    const parsed = venue
      ? schemas.venueUpdate.safeParse({
          // Only what was changed is sent.
          ...(sameName ? {} : { name: editing.name }),
          ...(sameLocality ? {} : { locality: editing.locality || null }),
        })
      : schemas.contextName.safeParse(editing.name);
    if (!parsed.success) return setEditError(parsed.error.issues[0]?.message ?? "");

    run("rename");
    setEditError(null);
    setResult(null);
    const request: Promise<ActionResult> = venue
      ? updateVenue(editing.id, parsed.data)
      : renameContext(editing.id, parsed.data);
    const outcome = await request.catch(() => offline);
    run(null);
    if (!outcome.ok) return setEditError(outcome.message);
    setEditing(null);
    setResult(outcome);
    router.refresh();
  }

  function askToDelete(item: ManagedReference) {
    setResult(null);
    // History names it: said at once, without asking for a confirmation that could only be refused.
    if (item.occurrenceCount > 0) {
      const inUse = venue ? words.actions.venueInUse : words.actions.contextInUse;
      return setHeld({ id: item.id, message: inUse(item.occurrenceCount) });
    }
    setHeld(null);
    setDeleting(item);
  }

  async function confirmDelete(request: Confirmation, item: ManagedReference) {
    run("delete");
    const outcome = await request.run().catch(() => offline);
    run(null);
    setDeleting(null);
    if (!outcome.ok) {
      // Recorded on since the page was read: the server's answer says how often.
      return setHeld({ id: item.id, message: outcome.message });
    }
    setResult(outcome);
    onDeleted?.(kind, item.id);
    router.refresh();
  }

  const confirmation: Confirmation | null = deleting && {
    title: t.deleteTitle(deleting.name),
    description: own.deleteDescription,
    confirmLabel: t.deleteConfirm,
    destructive: true,
    run: () => (venue ? deleteVenue(deleting.id) : deleteContext(deleting.id)),
  };

  const stopEdit = () => {
    setEditing(null);
    setEditError(null);
  };
  /** Escape leaves the rename, not the dialog. */
  const editKeys = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    event.preventDefault();
    stopEdit();
  };

  return (
    <>
      <form
        noValidate
        aria-busy={working === "create"}
        onSubmit={(event) => {
          event.preventDefault();
          void create(name);
        }}
        className="border-b px-5 pb-4"
      >
        <label htmlFor={`${id}-name`} className="text-sm leading-none font-medium">
          {own.new}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            ref={nameRef}
            id={`${id}-name`}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (result && !result.ok) setResult(null);
            }}
            maxLength={venue ? preachingLimits.venueName : preachingLimits.contextName}
            placeholder={venue ? form.venueNamePlaceholder : form.contextNamePlaceholder}
            autoComplete="off"
            enterKeyHint="done"
            aria-invalid={result && !result.ok ? true : undefined}
            className="min-w-0 flex-1 basis-44"
          />
          {venue && (
            <Input
              aria-label={form.locality}
              value={locality}
              onChange={(event) => setLocality(event.target.value)}
              maxLength={preachingLimits.venueLocality}
              placeholder={form.localityPlaceholder}
              autoComplete="off"
              enterKeyHint="done"
              className="min-w-0 flex-1 basis-44"
            />
          )}
          <Button type="submit" disabled={working !== null || !name.trim()}>
            {working === "create" ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Plus aria-hidden />
            )}
            {working === "create" ? t.creating : t.create}
          </Button>
        </div>
        {suggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground">{t.contexts.suggestions}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-label={t.contexts.addSuggestion(item.name)}
                  disabled={working !== null}
                  onClick={() => void create(item.name)}
                  className="inline-flex h-8 max-w-full items-center gap-1 rounded-md border border-input bg-surface pr-2.5 pl-2 text-sm font-medium transition-[border-color,background-color] duration-150 hover:border-foreground/30 active:bg-foreground/5 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:h-10"
                >
                  <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <ActionStatus result={result} />
      </form>

      <div className="min-h-0 flex-1 scroll-quiet overflow-y-auto overscroll-contain px-5 py-4">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-input px-5 py-8">
            <p className="font-display text-lg leading-snug font-medium">{own.noneTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{own.noneBody}</p>
          </div>
        ) : (
          <ul aria-label={own.yours} className="divide-y">
            {items.map((item) =>
              editing?.id === item.id ? (
                <li key={item.id} className="py-2.5">
                  <form
                    noValidate
                    aria-busy={working === "rename"}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void rename();
                    }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Input
                      autoFocus
                      aria-label={t.newName(item.name)}
                      value={editing.name}
                      onChange={(event) => {
                        setEditing({ ...editing, name: event.target.value });
                        setEditError(null);
                      }}
                      onKeyDown={editKeys}
                      maxLength={venue ? preachingLimits.venueName : preachingLimits.contextName}
                      autoComplete="off"
                      enterKeyHint="done"
                      aria-invalid={editError ? true : undefined}
                      aria-describedby={editError ? `${id}-edit-error` : undefined}
                      className="h-9 min-w-0 flex-1 basis-full sm:basis-40"
                    />
                    {venue && (
                      <Input
                        aria-label={t.localityFor(item.name)}
                        value={editing.locality}
                        onChange={(event) => {
                          setEditing({ ...editing, locality: event.target.value });
                          setEditError(null);
                        }}
                        onKeyDown={editKeys}
                        maxLength={preachingLimits.venueLocality}
                        placeholder={form.localityPlaceholder}
                        autoComplete="off"
                        enterKeyHint="done"
                        className="h-9 min-w-0 flex-1 basis-full sm:basis-40"
                      />
                    )}
                    <Button type="submit" size="sm" disabled={working !== null}>
                      {working === "rename" && (
                        <LoaderCircle className="animate-spin" aria-hidden />
                      )}
                      {working === "rename" ? t.saving : t.save}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={working !== null}
                      onClick={stopEdit}
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
                <li key={item.id} className="py-1.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground tabular-nums">
                        {item.locality && <>{item.locality} · </>}
                        {item.occurrenceCount === 0 ? t.notUsed : t.used(item.occurrenceCount)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.renameNamed(item.name)}
                      title={t.rename}
                      disabled={working !== null}
                      onClick={() => {
                        setEditing({
                          id: item.id,
                          name: item.name,
                          locality: item.locality ?? "",
                        });
                        setEditError(null);
                        setResult(null);
                        setHeld(null);
                      }}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t.deleteNamed(item.name)}
                      title={t.delete}
                      disabled={working !== null}
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => askToDelete(item)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                  {held?.id === item.id && (
                    <p
                      role="alert"
                      className="mt-1 mb-1.5 animate-menu rounded-md bg-muted px-3 py-2 text-[0.8125rem] leading-relaxed"
                    >
                      {held.message}
                    </p>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <ConfirmDialog
        confirmation={confirmation}
        busy={working === "delete"}
        onConfirm={(request) => {
          if (deleting) void confirmDelete(request, deleting);
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
