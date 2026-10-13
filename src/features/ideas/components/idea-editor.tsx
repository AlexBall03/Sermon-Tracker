"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CircleAlert, LoaderCircle, Trash2 } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { referenceKey } from "@/features/scripture/reference";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";
import { archiveIdea, changeIdeaKind, deleteIdea, restoreIdea, updateIdea } from "../actions";
import type { IdeaKind } from "../model";
import { draftTagIds, fieldErrors, ideaSchemas, type IdeaDraft } from "../schemas";
import type { IdeaTag } from "../tags";
import { ClassificationSection } from "./classification-section";
import {
  KindField,
  NotesField,
  ReferencesField,
  SubjectField,
  TagsField,
  TitleField,
  type UpdateDraft,
} from "./idea-fields";

type IdeaEditorProps = {
  id: string;
  /** The idea as it is saved, including the tags it already has. */
  initial: IdeaDraft;
  /** Every tag the account has, to choose from. */
  allTags?: IdeaTag[];
  /** Where "back" and a deletion lead: the library as it was left. */
  backHref?: string;
  createdAt: Date;
  updatedAt: Date;
  /** When the idea was archived, if it is. Never part of the draft: a save does not touch it. */
  archivedAt?: Date | null;
  /** True when the idea has an outline, which a deletion takes with it and so must say. */
  hasOutline?: boolean;
  /** Shown between the form and the footer: the sermon's preaching history, which is not part of the draft. */
  children?: React.ReactNode;
};

const form = "idea";

/**
 * One idea, open for editing. Content is saved with the Save button.
 * Reclassifying is its own step and takes effect at once: it changes only the
 * kind, so the title, notes, references, and sermon details all stay, whether
 * or not there are unsaved edits on the page. Leaving with unsaved edits, by
 * any route, asks first (`useLeaveGuard`).
 *
 * Tags are saved with the rest. The draft starts from the tags the idea
 * already has and every save sends the draft's tags, so changing only the
 * title sends the same tags back and none is lost. The classifications are in
 * the draft too, behind `ClassificationSection`, and go back the same way.
 *
 * Archiving and restoring are their own steps, like reclassifying: they change
 * only whether the idea is archived, leave the draft and any unsaved edits as
 * they are, and say nothing has happened until the server says so.
 */
export function IdeaEditor({
  id,
  initial,
  allTags = [],
  backHref = routes.sermonIdeas,
  createdAt,
  updatedAt,
  archivedAt = null,
  hasOutline = false,
  children,
}: IdeaEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const t = useT("ideas").editor;
  const locale = useLocale();
  const offline: ActionResult = { ok: false, message: t.offline };
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState<"save" | "kind" | "delete" | "archive" | "restore" | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  /** Why the idea could not be deleted, when that is because it has been preached. */
  const [preached, setPreached] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  // The idea can change while this page is kept: a passage added to it from the
  // Bible, or an edit made in another tab. The server then sends it again. With
  // nothing unsaved here, the page simply shows it. With edits under way they
  // are kept, and only passages added elsewhere are brought in, so the next
  // Save does not take them off again.
  const incoming = JSON.stringify(initial);
  const [seen, setSeen] = useState(incoming);
  if (incoming !== seen) {
    setSeen(incoming);
    setSaved(initial);
    if (!dirty) {
      setDraft(initial);
    } else {
      const before = new Set((JSON.parse(seen) as IdeaDraft).references.map(referenceKey));
      const arrived = initial.references.filter((item) => !before.has(referenceKey(item)));
      if (arrived.length > 0) {
        setDraft((current) => {
          const held = new Set(current.references.map(referenceKey));
          const fresh = arrived
            .filter((item) => !held.has(referenceKey(item)))
            .map((item) => ({ ...item, isPrimary: false }));
          return { ...current, references: [...current.references, ...fresh] };
        });
      }
    }
  }

  // Leaving with unsaved edits asks first, however the page is left.
  const guard = useLeaveGuard(dirty, t.unsaved, () => {
    // Leaving without saving puts the idea back as it was last saved.
    setDraft(saved);
    setErrors({});
    setResult(null);
  });

  const update: UpdateDraft = useCallback((change) => {
    setDraft(change);
    setErrors({});
    setResult(null);
  }, []);

  async function save() {
    if (busy) return;
    const parsed = ideaSchemas(locale).ideaInput.safeParse({
      ...draft,
      tagIds: draftTagIds(draft),
    });
    if (!parsed.success) {
      const found = fieldErrors(parsed.error);
      setErrors(found);
      setResult({ ok: false, message: Object.values(found)[0] });
      return;
    }
    setBusy("save");
    setResult(null);
    const attempt = draft;
    const outcome = await updateIdea(id, parsed.data).catch(() => offline);
    setBusy(null);
    setResult(outcome);
    if (outcome.ok) setSaved(attempt);
  }

  async function reclassify(kind: IdeaKind) {
    if (busy || kind === draft.kind) return;
    const previous = draft.kind;
    setBusy("kind");
    setResult(null);
    setDraft((current) => ({ ...current, kind }));
    const outcome = await changeIdeaKind(id, kind).catch(() => offline);
    setBusy(null);
    setResult(outcome);
    if (outcome.ok) setSaved((current) => ({ ...current, kind }));
    else setDraft((current) => ({ ...current, kind: previous }));
  }

  async function restore() {
    if (busy) return;
    setBusy("restore");
    setResult(null);
    const outcome = await restoreIdea(id).catch(() => offline);
    setBusy(null);
    if (!outcome.ok) return setResult(outcome);
    toast({ message: outcome.message });
    router.refresh();
  }

  function askToArchive() {
    setConfirmation({
      title: t.archiveTitle,
      description: t.archiveDescription(saved.title),
      confirmLabel: t.archiveConfirm,
      run: () => archiveIdea(id),
    });
  }

  async function confirmed(request: Confirmation) {
    const deleting = request.destructive === true;
    setBusy(deleting ? "delete" : "archive");
    const outcome = await request.run().catch(() => offline);
    setBusy(null);
    setConfirmation(null);
    if (!outcome.ok) {
      // A preached sermon is kept with its history. That is said beside the way to archive it.
      if ("reason" in outcome && outcome.reason === "preached") return setPreached(outcome.message);
      return setResult(outcome);
    }
    if (!deleting) {
      // Archived, and still here: the page says so once the server sends it again.
      setPreached(null);
      toast({ message: outcome.message });
      router.refresh();
      return;
    }
    // The idea is gone; there is nothing left to lose by leaving.
    guard.allowLeaving();
    setSaved(draft);
    toast({ message: outcome.message });
    router.push(backHref);
  }

  return (
    <>
      {archivedAt && (
        <div className="mt-6 flex max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border bg-muted/50 px-4 py-3">
          <p className="min-w-0 text-sm">
            <span className="flex items-center gap-1.5 font-semibold">
              <Archive className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {t.archivedOn(formatDate(archivedAt, locale))}
            </span>
            <span className="mt-0.5 block text-muted-foreground">{t.archivedHint}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            aria-busy={busy === "restore"}
            onClick={() => void restore()}
          >
            {busy === "restore" ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <ArchiveRestore aria-hidden />
            )}
            {busy === "restore" ? t.restoring : t.restore}
          </Button>
        </div>
      )}
      <form
        noValidate
        aria-busy={busy === "save"}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className={`${archivedAt ? "mt-6" : "mt-8"} max-w-2xl space-y-6`}
      >
        <TitleField form={form} draft={draft} update={update} errors={errors} />
        <div>
          <KindField
            form={form}
            value={draft.kind}
            onChange={(kind) => void reclassify(kind)}
            disabled={busy !== null}
          />
          <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{t.kindHint}</p>
        </div>
        <ReferencesField draft={draft} update={update} ideaId={id} />
        <TagsField draft={draft} update={update} options={allTags} />
        <NotesField
          form={form}
          draft={draft}
          update={update}
          errors={errors}
          onSubmitShortcut={() => void save()}
        />
        {draft.kind === "sermon" && (
          <SubjectField form={form} draft={draft} update={update} errors={errors} />
        )}
        <ClassificationSection draft={draft} update={update} />

        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" disabled={busy !== null || !dirty} aria-busy={busy === "save"}>
              {busy === "save" && <LoaderCircle className="animate-spin" aria-hidden />}
              {busy === "save" ? t.saving : t.save}
            </Button>
            {dirty && <span className="text-sm text-muted-foreground">{t.unsavedChanges}</span>}
          </div>
          <ActionStatus result={result} />
        </div>
      </form>

      {children}

      {preached && (
        <div
          role="alert"
          className="mt-10 flex max-w-2xl animate-menu flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border bg-muted/50 px-4 py-3"
        >
          <p className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-sm font-medium">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            {preached}
          </p>
          {/* Offered, never done for them: archiving is still theirs to confirm. */}
          {!archivedAt && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={askToArchive}
            >
              <Archive aria-hidden />
              {t.archiveInstead}
            </Button>
          )}
        </div>
      )}

      <footer
        className={`${preached ? "mt-4" : "mt-10 border-t pt-6"} flex max-w-2xl flex-wrap items-center justify-between gap-4`}
      >
        <p className="text-sm text-muted-foreground">
          {t.captured}{" "}
          <time dateTime={createdAt.toISOString()}>{formatDate(createdAt, locale)}</time>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          {t.lastChanged}{" "}
          <time dateTime={updatedAt.toISOString()}>{formatDate(updatedAt, locale)}</time>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!archivedAt && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={askToArchive}
            >
              <Archive aria-hidden />
              {t.archive}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            className="text-destructive hover:border-destructive/60"
            onClick={() => {
              // A refusal from the last try goes when it is tried again.
              setPreached(null);
              setConfirmation({
                title: t.deleteTitle,
                description: t.deleteDescription(saved.title, hasOutline),
                confirmLabel: t.deleteConfirm(saved.kind),
                destructive: true,
                run: () => deleteIdea(id),
              });
            }}
          >
            <Trash2 aria-hidden />
            {t.delete}
          </Button>
        </div>
      </footer>

      {guard.dialog}
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy === "delete" || busy === "archive"}
        onConfirm={(request) => void confirmed(request)}
        onCancel={() => setConfirmation(null)}
      />
    </>
  );
}
