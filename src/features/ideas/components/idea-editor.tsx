"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";
import { changeIdeaKind, deleteIdea, updateIdea } from "../actions";
import { ideaKindLabels, type IdeaKind } from "../model";
import { fieldErrors, ideaInputSchema, type IdeaDraft } from "../schemas";
import {
  KindField,
  NotesField,
  ReferencesField,
  SermonFields,
  StatusField,
  TitleField,
  type UpdateDraft,
} from "./idea-fields";

type IdeaEditorProps = {
  id: string;
  initial: IdeaDraft;
  createdAt: Date;
  updatedAt: Date;
};

const form = "idea";
const offline: ActionResult = {
  ok: false,
  message: "That could not be saved. Check your connection and try again.",
};

/**
 * One idea, open for editing. Content is saved with the Save button.
 * Reclassifying is its own step and takes effect at once: it changes only the
 * kind, so the title, notes, references, and sermon details all stay, whether
 * or not there are unsaved edits on the page. Leaving with unsaved edits, by
 * any route, asks first (`useLeaveGuard`).
 */
export function IdeaEditor({ id, initial, createdAt, updatedAt }: IdeaEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState<"save" | "kind" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  // Leaving with unsaved edits asks first, however the page is left.
  const guard = useLeaveGuard(dirty, "Your changes to this idea have not been saved.", () => {
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
    const parsed = ideaInputSchema.safeParse(draft);
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

  async function confirmDelete(request: Confirmation) {
    setBusy("delete");
    const outcome = await request.run().catch(() => offline);
    setBusy(null);
    setConfirmation(null);
    if (!outcome.ok) return setResult(outcome);
    // The idea is gone; there is nothing left to lose by leaving.
    guard.allowLeaving();
    setSaved(draft);
    toast({ message: outcome.message });
    router.push(routes.library);
  }

  return (
    <>
      <form
        noValidate
        aria-busy={busy === "save"}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="mt-8 max-w-2xl space-y-6"
      >
        <TitleField form={form} draft={draft} update={update} errors={errors} />
        <div>
          <KindField
            form={form}
            value={draft.kind}
            onChange={(kind) => void reclassify(kind)}
            disabled={busy !== null}
          />
          <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">
            Changing this takes effect straight away and keeps everything else as it is.
          </p>
        </div>
        <ReferencesField draft={draft} update={update} />
        <NotesField
          form={form}
          draft={draft}
          update={update}
          errors={errors}
          onSubmitShortcut={() => void save()}
        />
        {draft.kind === "sermon" && (
          <SermonFields form={form} draft={draft} update={update} errors={errors} />
        )}
        <StatusField form={form} draft={draft} update={update} />

        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button type="submit" disabled={busy !== null || !dirty} aria-busy={busy === "save"}>
              {busy === "save" && <LoaderCircle className="animate-spin" aria-hidden />}
              {busy === "save" ? "Saving…" : "Save changes"}
            </Button>
            {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
          </div>
          <ActionStatus result={result} />
        </div>
      </form>

      <footer className="mt-10 flex max-w-2xl flex-wrap items-center justify-between gap-4 border-t pt-6">
        <p className="text-sm text-muted-foreground">
          Captured <time dateTime={createdAt.toISOString()}>{formatDate(createdAt)}</time>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          last changed <time dateTime={updatedAt.toISOString()}>{formatDate(updatedAt)}</time>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          className="text-destructive hover:border-destructive/60"
          onClick={() =>
            setConfirmation({
              title: "Delete this idea?",
              description: `“${saved.title}” and its Scripture references will be deleted. This cannot be undone.`,
              confirmLabel: `Delete ${ideaKindLabels[saved.kind].toLowerCase()}`,
              destructive: true,
              run: () => deleteIdea(id),
            })
          }
        >
          <Trash2 aria-hidden />
          Delete idea
        </Button>
      </footer>

      {guard.dialog}
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy === "delete"}
        onConfirm={(request) => void confirmDelete(request)}
        onCancel={() => setConfirmation(null)}
      />
    </>
  );
}
