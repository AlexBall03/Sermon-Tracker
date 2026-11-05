"use client";

import { LoaderCircle, Save, WifiOff } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

import { ActionStatus } from "@/components/ui/action-status";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Draft } from "@/features/editor-lab/styles/draft";
import type { UserPresetId } from "@/features/editor-lab/styles/model";
import { snapshotDraft, type AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import type { AppearanceSession } from "@/features/sermon-editor/appearance/session";
import type { Dictionaries } from "@/i18n";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { captureAppearance } from "../capture";
import {
  createIntent,
  sendIntent,
  sendReplace,
  type Intent,
  type ReplaceSent,
  type Sent,
} from "../client";
import type { PresetActionResult } from "../actions";
import { presetLimits } from "../model";
import type { PresetMeta } from "../presets";
import { useBrowserOnline, usePresetLibrary, type PresetLibrary } from "./preset-library";

/*
 * Personal presets inside Outline Settings → Appearance → Outline (A4.2C),
 * below the built-in presets, through the one Appearance session:
 *
 * - Previewing a preset loads its snapshot and turns it into ordinary draft
 *   edits (`snapshotDraft`): the outline and the window's preview show it,
 *   nothing is written until Apply (`applyAppearanceDraft`, one undo step),
 *   and Cancel leaves the outline as it was. Pending outline-wide edits are
 *   replaced only after the person confirms; a single component's pending
 *   edits are kept, as `snapshotDraft` keeps them.
 * - Save as preset and Update a preset take the previewed appearance
 *   (`captureAppearance`, checked as Apply checks it). Neither changes the
 *   draft, the outline, autosave, or the account default.
 *
 * Shown only where the host provides the library (the production editor).
 */

export function OutlinePresets({ session }: { session: AppearanceSession }) {
  const library = usePresetLibrary();
  return library ? <Presets library={library} session={session} /> : null;
}

/** Whether a draft holds any edit beyond single components' own. */
const outlineWide = (draft: Draft) =>
  [...draft.edits.values()].some((edit) => edit.path.layer !== "instance");

type Loaded =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; items: PresetMeta[]; page: number; totalPages: number };

function Presets({ library, session }: { library: PresetLibrary; session: AppearanceSession }) {
  const t = useT("appearancePresets");
  const e = t.editor;
  const online = useBrowserOnline();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });

  const fetchPage = useCallback(
    (page: number) => library.list({ page, pageSize: presetLimits.pageSize }).catch(() => null),
    [library],
  );
  const receive = useCallback((page: number, answer: Awaited<ReturnType<typeof fetchPage>>) => {
    if (!answer?.ok || !answer.page) {
      if (page === 1) setLoaded({ state: "failed" });
      return;
    }
    const { items, page: at, total, pageSize } = answer.page;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    setLoaded((before) => ({
      state: "ready",
      items: page === 1 || before.state !== "ready" ? items : [...before.items, ...items],
      page: at,
      totalPages,
    }));
  }, []);
  const load = (page: number) => fetchPage(page).then((answer) => receive(page, answer));
  // Once, when the window opens: a bounded first page, metadata only.
  useEffect(() => {
    let live = true;
    void fetchPage(1).then((answer) => live && receive(1, answer));
    return () => {
      live = false;
    };
  }, [fetchPage, receive]);

  const items = loaded.state === "ready" ? loaded.items : [];
  const remember = (preset: PresetMeta) =>
    setLoaded((before) =>
      before.state === "ready"
        ? {
            ...before,
            items: before.items.some((item) => item.id === preset.id)
              ? before.items.map((item) => (item.id === preset.id ? preset : item))
              : [...before.items, preset].sort((a, b) => a.name.localeCompare(b.name)),
          }
        : before,
    );

  return (
    <section className="flex flex-col gap-4 border-t pt-4" data-testid="outline-presets">
      {!online && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <WifiOff className="size-4 shrink-0" aria-hidden />
          {e.offline}
        </p>
      )}
      <Chooser
        library={library}
        session={session}
        loaded={loaded}
        online={online}
        onMore={() => loaded.state === "ready" && void load(loaded.page + 1)}
        onRetry={() => {
          setLoaded({ state: "loading" });
          void load(1);
        }}
      />
      <SaveAsPreset library={library} session={session} online={online} onSaved={remember} />
      {items.length > 0 && (
        <UpdatePreset
          library={library}
          session={session}
          online={online}
          items={items}
          onUpdated={remember}
        />
      )}
    </section>
  );
}

function Chooser({
  library,
  session,
  loaded,
  online,
  onMore,
  onRetry,
}: {
  library: PresetLibrary;
  session: AppearanceSession;
  loaded: Loaded;
  online: boolean;
  onMore: () => void;
  onRetry: () => void;
}) {
  const t = useT("appearancePresets");
  const e = t.editor;
  const presetNames = useT("editorLab").appearance.presets;
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ preset: PresetMeta; snapshot: AppearanceSnapshot } | null>(
    null,
  );
  /** The preset being previewed, while the draft is still the one it made. */
  const [previewing, setPreviewing] = useState<{ name: string; draft: Draft } | null>(null);
  const shown = previewing && previewing.draft === session.draft ? previewing.name : null;

  function preview(preset: PresetMeta, snapshot: AppearanceSnapshot) {
    const { editor, stored, draft } = session;
    const next = snapshotDraft(snapshot, stored, editor.state.doc, draft);
    if (!next) {
      setProblem(e.invalid);
      return;
    }
    session.change(next);
    setPreviewing({ name: preset.name, draft: next });
  }

  async function choose(preset: PresetMeta) {
    if (busy) return;
    setProblem(null);
    setBusy(preset.id);
    const answer = await library.get(preset.id).catch((): PresetActionResult => ({
      ok: false,
      code: "failed",
      message: t.outcomes.uncertain,
    }));
    setBusy(null);
    if (!answer.ok || !answer.appearance) {
      setProblem(answer.code === "unreadable" ? e.unreadable : answer.message);
      return;
    }
    // Pending outline-wide edits are replaced only with the person's say-so.
    if (outlineWide(session.draft)) setAsking({ preset, snapshot: answer.appearance });
    else preview(preset, answer.appearance);
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">{e.mine}</h3>
        <p className="text-xs text-muted-foreground">{e.mineHint}</p>
      </div>
      {loaded.state === "loading" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {e.loading}
        </p>
      ) : loaded.state === "failed" ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-destructive" role="status">
          {e.loadFailed}
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {e.retry}
          </Button>
        </p>
      ) : loaded.items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{e.none}</p>
      ) : (
        <ul className="flex flex-col gap-1.5" aria-label={e.mine}>
          {loaded.items.map((preset) => (
            <li
              key={preset.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
              data-preset-name={preset.name}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{preset.name}</span>
                {preset.basePreset && (
                  <span className="block text-xs text-muted-foreground">
                    {t.library.basedOn(presetNames[preset.basePreset as UserPresetId])}
                  </span>
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!online || busy !== null}
                aria-busy={busy === preset.id}
                aria-label={e.previewIn(preset.name)}
                onClick={() => void choose(preset)}
                className="shrink-0 pointer-coarse:h-11"
              >
                {busy === preset.id && <LoaderCircle className="animate-spin" aria-hidden />}
                {t.library.preview}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {loaded.state === "ready" && loaded.page < loaded.totalPages && (
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={onMore}>
          {e.more}
        </Button>
      )}
      <p role="status" aria-live="polite" className={shown ? "text-xs text-primary" : "sr-only"}>
        {shown ? e.previewing(shown) : ""}
      </p>
      <ActionStatus result={problem ? { ok: false, message: problem } : null} />

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{e.replaceTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {asking ? e.replaceBody(asking.preset.name) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {/* Cancel keeps every pending edit as it is. */}
            <AlertDialogCancel>{e.keepEditing}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (asking) preview(asking.preset, asking.snapshot);
                setAsking(null);
              }}
            >
              {e.replaceConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** What the screen says of a send. */
function said(
  sent: Sent<PresetActionResult>,
  t: Dictionaries["appearancePresets"],
  done: string,
): ActionResult {
  switch (sent.status) {
    case "done":
      return { ok: true, message: sent.result.unchanged ? t.actions.unchanged : done };
    case "refused":
      return { ok: false, message: sent.result.message };
    case "uncertain":
      return { ok: false, message: t.outcomes.uncertain };
    case "expired":
      return { ok: false, message: t.outcomes.expired };
    case "settled":
      return sent.settled === "applied"
        ? { ok: true, message: t.outcomes.applied }
        : {
            ok: false,
            message: sent.settled === "not_applied" ? t.outcomes.notApplied : t.outcomes.superseded,
          };
  }
}

function SaveAsPreset({
  library,
  session,
  online,
  onSaved,
}: {
  library: PresetLibrary;
  session: AppearanceSession;
  online: boolean;
  onSaved: (preset: PresetMeta) => void;
}) {
  const t = useT("appearancePresets");
  const e = t.editor;
  const id = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  /** A create whose answer was lost: "Try again" sends exactly this again. */
  const [pending, setPending] = useState<Intent | null>(null);

  async function send(intent: Intent) {
    setBusy(true);
    const sent = await sendIntent(library, intent);
    setBusy(false);
    setResult(said(sent, t, t.actions.created));
    setPending(sent.status === "uncertain" ? intent : null);
    if (sent.status === "done") {
      setName("");
      if (sent.result.preset) onSaved(sent.result.preset);
    }
  }

  function save() {
    if (busy || pending) return;
    const { editor, stored, draft, presetId } = session;
    const captured = captureAppearance(draft, stored, editor.state.doc, presetId);
    if (!captured.ok) {
      setResult({ ok: false, message: e.refusals[captured.reason] });
      return;
    }
    // Fixed now: the name and the appearance as they are at this press, with one operation ID.
    void send(createIntent(name, captured.snapshot));
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-1.5"
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      data-testid="save-preset"
    >
      <h3 className="text-sm font-medium">{e.saveTitle}</h3>
      <p className="text-xs text-muted-foreground">{e.saveHint}</p>
      <label htmlFor={`${id}-name`} className="sr-only">
        {e.name}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={`${id}-name`}
          value={name}
          placeholder={e.name}
          maxLength={presetLimits.name}
          autoComplete="off"
          disabled={pending !== null}
          onChange={(event) => {
            setName(event.target.value);
            if (result && !result.ok && !pending) setResult(null);
          }}
          className="min-w-0 flex-1 basis-40"
        />
        {pending ? (
          <Button type="button" disabled={busy || !online} onClick={() => void send(pending)}>
            {busy && <LoaderCircle className="animate-spin" aria-hidden />}
            {t.outcomes.tryAgain}
          </Button>
        ) : (
          <Button type="submit" disabled={busy || !online || !name.trim()}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
            {busy ? e.saving : e.save}
          </Button>
        )}
      </div>
      <ActionStatus result={result} />
    </form>
  );
}

function UpdatePreset({
  library,
  session,
  online,
  items,
  onUpdated,
}: {
  library: PresetLibrary;
  session: AppearanceSession;
  online: boolean;
  items: PresetMeta[];
  onUpdated: (preset: PresetMeta) => void;
}) {
  const t = useT("appearancePresets");
  const e = t.editor;
  const [targetId, setTargetId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  /** Waiting on the person's confirmation: the preset, at the revision named, and the appearance captured. */
  const [asking, setAsking] = useState<{ preset: PresetMeta; sent: ReplaceSent } | null>(null);
  /** Kept after a conflict or a lost answer, so nothing the person made is lost. */
  const [kept, setKept] = useState<{
    preset: PresetMeta;
    sent: ReplaceSent;
    retry: "same" | "again";
  } | null>(null);
  const target = items.find((item) => item.id === targetId) ?? null;

  function ask() {
    if (!target) return;
    const { editor, stored, draft, presetId } = session;
    const captured = captureAppearance(draft, stored, editor.state.doc, presetId);
    if (!captured.ok) {
      setResult({ ok: false, message: e.refusals[captured.reason] });
      return;
    }
    setResult(null);
    setKept(null);
    setAsking({
      preset: target,
      sent: { id: target.id, expectedRevision: target.revision, appearance: captured.snapshot },
    });
  }

  async function replace(preset: PresetMeta, sent: ReplaceSent) {
    setBusy(true);
    const outcome = await sendReplace(library, sent);
    setBusy(false);
    if (outcome.status === "refused" && outcome.result.code === "conflict") {
      setResult({ ok: false, message: e.updateConflict(preset.name) });
      setKept({ preset, sent, retry: "again" });
      return;
    }
    setResult(said(outcome, t, t.actions.replaced));
    if (outcome.status === "done" && outcome.result.preset) {
      onUpdated(outcome.result.preset);
      setKept(null);
    } else if (
      outcome.status === "uncertain" ||
      (outcome.status === "settled" && outcome.settled === "not_applied")
    ) {
      setKept({ preset, sent, retry: "same" });
    } else if (outcome.status === "settled" && outcome.settled === "superseded") {
      setKept({ preset, sent, retry: "again" });
    } else {
      setKept(null);
    }
  }

  /** After a conflict: read the preset as it is now, then ask again before replacing it. */
  async function again() {
    if (!kept) return;
    setBusy(true);
    const answer = await library.get(kept.preset.id).catch(() => null);
    setBusy(false);
    if (!answer?.ok || !answer.preset) {
      setResult({ ok: false, message: answer?.message ?? t.outcomes.uncertain });
      return;
    }
    onUpdated(answer.preset);
    setAsking({
      preset: answer.preset,
      sent: { ...kept.sent, expectedRevision: answer.preset.revision },
    });
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="update-preset">
      <h3 className="text-sm font-medium">{e.updateTitle}</h3>
      <p className="text-xs text-muted-foreground">{e.updateHint}</p>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <Select
            label={e.updateChoose}
            value={targetId}
            onChange={setTargetId}
            disabled={busy}
            options={items.map((item) => ({ value: item.id, label: item.name }))}
          />
        </div>
        <Button type="button" variant="outline" disabled={busy || !online || !target} onClick={ask}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          {e.update}
        </Button>
      </div>
      {kept && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          disabled={busy || !online}
          onClick={() =>
            kept.retry === "same" ? void replace(kept.preset, kept.sent) : void again()
          }
        >
          {kept.retry === "same" ? t.outcomes.tryAgain : e.replaceAgain}
        </Button>
      )}
      <ActionStatus result={result} />

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {asking ? e.updateConfirmTitle(asking.preset.name) : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>{e.updateConfirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{e.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (asking) void replace(asking.preset, asking.sent);
                setAsking(null);
              }}
            >
              {e.updateConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
