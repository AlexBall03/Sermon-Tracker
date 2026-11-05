"use client";

import {
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  LoaderCircle,
  WifiOff,
  X,
} from "lucide-react";
import { useId, useState } from "react";

import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { userPresetIds, type UserPresetId } from "@/features/editor-lab/styles/model";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { formatNumber, type Dictionaries } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import type { DefaultActionResult, PresetActionResult } from "../actions";
import {
  duplicateIntent,
  sendDefault,
  sendDelete,
  sendIntent,
  sendRename,
  type DefaultSent,
  type DeleteSent,
  type Intent,
  type RenameSent,
  type Sent,
} from "../client";
import type { AccountDefault } from "../defaults";
import type { DefaultTarget } from "../model";
import { presetLimits } from "../model";
import type { PresetMeta, PresetPage } from "../presets";
import { presetActions, useBrowserOnline, type PresetLibrary } from "./preset-library";
import { PresetPreview } from "./preset-preview";

/*
 * Settings → Appearance → My presets (A4.2C): the account's presets and its
 * default for new outlines. Every change is the person's press, sent once
 * through `client.ts` (which owns what a lost answer means); nothing is
 * queued, retried by itself, or polled. A preset's appearance is changed only
 * from an outline (Outline Settings, owner's decision 2): there is no second
 * appearance editor here.
 *
 * One preview at a time, loaded when asked: beside the list from `lg`, below
 * it on a narrower screen.
 */

type Words = Dictionaries["appearancePresets"];

function describe(
  sent: Sent<PresetActionResult | DefaultActionResult>,
  t: Words,
  done: string,
): ActionResult {
  switch (sent.status) {
    case "done":
      return {
        ok: true,
        message: (sent.result as PresetActionResult).unchanged ? t.actions.unchanged : done,
      };
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

/** What can be sent again exactly as it was: a create's intent, or a change read back as not applied. */
type Retry =
  | { kind: "intent"; intent: Intent }
  | { kind: "rename"; sent: RenameSent }
  | { kind: "delete"; sent: DeleteSent; name: string }
  | { kind: "default"; sent: DefaultSent };

export function MyPresets({
  initialPage,
  initialDefault,
  defaultName,
  failed = false,
  library = presetActions,
}: {
  initialPage: PresetPage;
  initialDefault: AccountDefault;
  /** The personal default's name, when it is not on the first page. */
  defaultName: string | null;
  /** The server could not read the first page: offered again from here. */
  failed?: boolean;
  library?: PresetLibrary;
}) {
  const t = useT("appearancePresets");
  const l = t.library;
  const presetNames = useT("editorLab").appearance.presets;
  const locale = useLocale();
  const online = useBrowserOnline();
  const headingId = useId();
  // One preview editor at a time: beside the list from lg, under its row below it.
  const beside = useMediaQuery("(min-width: 64rem)");

  const [page, setPage] = useState<PresetPage>(initialPage);
  const [listState, setListState] = useState<"ready" | "loading" | "failed">(
    failed ? "failed" : "ready",
  );
  const [current, setCurrent] = useState<AccountDefault>(initialDefault);
  const [pendingTarget, setPendingTarget] = useState<DefaultTarget | null>(null);
  const [knownDefaultName, setKnownDefaultName] = useState<string | null>(defaultName);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [retry, setRetry] = useState<Retry | null>(null);
  const [editing, setEditing] = useState<{
    mode: "rename" | "duplicate";
    preset: PresetMeta;
    name: string;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [previewing, setPreviewing] = useState<
    | { preset: PresetMeta; state: "loading" }
    | { preset: PresetMeta; state: "ready"; snapshot: AppearanceSnapshot }
    | { preset: PresetMeta; state: "failed" | "unreadable" }
    | null
  >(null);

  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const personalDefault =
    current.target.kind === "personal" ? current.target.presetId.toLowerCase() : null;
  const isDefault = (preset: PresetMeta) => preset.id.toLowerCase() === personalDefault;

  async function load(at: number) {
    setListState("loading");
    const answer = await library
      .list({ page: at, pageSize: presetLimits.pageSize })
      .catch(() => null);
    if (!answer?.ok || !answer.page) {
      setListState("failed");
      return;
    }
    setPage(answer.page);
    setListState("ready");
  }

  const refreshDefault = async () => {
    const answer = await library.getDefault().catch(() => null);
    if (answer?.ok && answer.default) setCurrent(answer.default);
  };

  /* Default for new outlines */

  async function chooseDefault(target: DefaultTarget, sent?: DefaultSent) {
    if (busy) return;
    const request = sent ?? { target, expectedRevision: current.revision };
    setBusy("default");
    setPendingTarget(target);
    setResult(null);
    const outcome = await sendDefault(library, request);
    setBusy(null);
    setPendingTarget(null);
    setResult(describe(outcome, t, t.actions.defaultSaved));
    setRetry(null);
    if (outcome.status === "done" && outcome.result.default) setCurrent(outcome.result.default);
    else if (outcome.status === "refused" && outcome.result.default)
      setCurrent(outcome.result.default);
    else if (outcome.status === "settled") {
      if (outcome.settled === "applied")
        setCurrent({ target: request.target, revision: request.expectedRevision + 1 });
      else if (outcome.settled === "not_applied") setRetry({ kind: "default", sent: request });
      else await refreshDefault();
    } else if (outcome.status === "uncertain") setRetry({ kind: "default", sent: request });
    if (target.kind === "personal") {
      const named = page.items.find((item) => item.id === target.presetId);
      if (named) setKnownDefaultName(named.name);
    }
  }

  /* Rename and duplicate */

  async function sendEdit() {
    if (!editing || busy) return;
    const { mode, preset, name } = editing;
    setBusy(preset.id);
    setResult(null);
    if (mode === "rename") {
      const sent: RenameSent = { id: preset.id, expectedRevision: preset.revision, name };
      await finishRename(sent);
    } else {
      // Fixed at this press: the source, the name, and one operation ID.
      await finishIntent(duplicateIntent(preset.id, name));
    }
    setBusy(null);
  }

  async function finishRename(sent: RenameSent) {
    const outcome = await sendRename(library, sent);
    setResult(describe(outcome, t, t.actions.renamed));
    setRetry(
      outcome.status === "uncertain" ||
        (outcome.status === "settled" && outcome.settled === "not_applied")
        ? { kind: "rename", sent }
        : null,
    );
    if (outcome.status === "done" || outcome.status === "settled") {
      setEditing(null);
      await load(page.page);
    }
    if (outcome.status === "refused" && outcome.result.code === "conflict") await load(page.page);
  }

  async function finishIntent(intent: Intent) {
    const outcome = await sendIntent(library, intent);
    setResult(describe(outcome, t, t.actions.created));
    setRetry(outcome.status === "uncertain" ? { kind: "intent", intent } : null);
    if (outcome.status === "done") {
      setEditing(null);
      await load(page.page);
    }
  }

  /* Delete */

  function askDelete(preset: PresetMeta) {
    const sent: DeleteSent = { id: preset.id, expectedRevision: preset.revision };
    setConfirmation({
      title: l.deleteTitle(preset.name),
      description: isDefault(preset) ? l.deleteDefaultBody : l.deleteBody,
      confirmLabel: l.deleteConfirm,
      destructive: true,
      run: () => finishDelete(sent, preset.name),
    });
  }

  async function finishDelete(sent: DeleteSent, name: string): Promise<ActionResult> {
    setBusy(sent.id);
    setResult(null);
    const outcome = await sendDelete(library, sent);
    setBusy(null);
    setConfirmation(null);
    const said = describe(outcome, t, t.actions.deleted);
    if (outcome.status === "done" && outcome.result.defaultReset) {
      said.message = t.actions.deletedDefault;
      setCurrent({
        target: { kind: "builtin", preset: "balanced" },
        revision: outcome.result.defaultRevision ?? current.revision + 1,
      });
    }
    setResult(said);
    setRetry(
      outcome.status === "uncertain" ||
        (outcome.status === "settled" && outcome.settled === "not_applied")
        ? { kind: "delete", sent, name }
        : null,
    );
    if (previewing?.preset.id === sent.id && outcome.status !== "refused") setPreviewing(null);
    if (outcome.status !== "uncertain") {
      await load(page.page);
      // A delete read back as applied may have reset the default with it.
      if (outcome.status === "settled") await refreshDefault();
    }
    return said;
  }

  /* Preview */

  async function preview(preset: PresetMeta) {
    if (previewing?.preset.id === preset.id) {
      setPreviewing(null);
      return;
    }
    setPreviewing({ preset, state: "loading" });
    const answer = await library.get(preset.id).catch(() => null);
    setPreviewing((shown) => {
      if (shown?.preset.id !== preset.id) return shown;
      if (answer?.ok && answer.appearance)
        return { preset, state: "ready", snapshot: answer.appearance };
      return { preset, state: answer?.code === "unreadable" ? "unreadable" : "failed" };
    });
  }

  function again() {
    if (!retry) return;
    if (retry.kind === "intent") {
      setBusy("retry");
      void finishIntent(retry.intent).finally(() => setBusy(null));
    } else if (retry.kind === "rename") {
      setBusy("retry");
      void finishRename(retry.sent).finally(() => setBusy(null));
    } else if (retry.kind === "delete") void finishDelete(retry.sent, retry.name);
    else void chooseDefault(retry.sent.target, retry.sent);
  }

  // The choice being sent is shown while it is on its way (busy, nothing else can change),
  // then whatever the server answered or a read back proved.
  const shownTarget = pendingTarget ?? current.target;
  const defaultValue =
    shownTarget.kind === "builtin"
      ? `builtin:${shownTarget.preset}`
      : `personal:${shownTarget.presetId.toLowerCase()}`;
  const defaultOffPage =
    current.target.kind === "personal" && !page.items.some((item) => isDefault(item));
  const disabled = !online || busy !== null;

  return (
    <div className="flex flex-col gap-6" data-testid="my-presets">
      {!online && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          {l.offline}
        </p>
      )}

      <fieldset
        className="flex flex-col gap-2"
        data-testid="default-preset"
        aria-busy={busy === "default"}
      >
        <legend className="text-sm font-medium">{l.defaultTitle}</legend>
        <p className="mb-1 text-xs text-muted-foreground">{l.defaultHint}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {userPresetIds.map((id) => (
            <DefaultOption
              key={id}
              label={presetNames[id]}
              hint={l.builtIn}
              value={`builtin:${id}`}
              checked={defaultValue === `builtin:${id}`}
              disabled={disabled}
              onChange={() => void chooseDefault({ kind: "builtin", preset: id })}
            />
          ))}
        </div>
        {(page.items.length > 0 || defaultOffPage) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {defaultOffPage && current.target.kind === "personal" && (
              <DefaultOption
                label={knownDefaultName ?? l.mine}
                hint={l.mine}
                value={`personal:${personalDefault}`}
                checked={defaultValue === `personal:${personalDefault}`}
                disabled={disabled}
                onChange={() => undefined}
              />
            )}
            {page.items.map((preset) => (
              <DefaultOption
                key={preset.id}
                label={preset.name}
                hint={l.mine}
                value={`personal:${preset.id.toLowerCase()}`}
                checked={defaultValue === `personal:${preset.id.toLowerCase()}`}
                disabled={disabled}
                onChange={() => void chooseDefault({ kind: "personal", presetId: preset.id })}
              />
            ))}
          </div>
        )}
      </fieldset>

      <ActionStatus result={result} />
      {retry && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="-mt-4 self-start"
          disabled={disabled}
          onClick={again}
        >
          {busy === "retry" && <LoaderCircle className="animate-spin" aria-hidden />}
          {t.outcomes.tryAgain}
        </Button>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
          <h3 id={headingId} className="text-sm font-medium">
            {l.mine}
          </h3>
          {listState === "failed" ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-destructive" role="status">
              {l.loadFailed}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void load(page.page)}
              >
                {l.retry}
              </Button>
            </p>
          ) : page.items.length === 0 && listState === "ready" ? (
            <div className="rounded-xl border border-dashed border-input px-5 py-6">
              <p className="font-display text-lg leading-snug font-medium">{l.empty}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{l.emptyBody}</p>
            </div>
          ) : (
            <ul
              className={cn("flex flex-col gap-2", listState === "loading" && "opacity-60")}
              aria-busy={listState === "loading"}
            >
              {page.items.map((preset) => (
                <li
                  key={preset.id}
                  className="rounded-lg border px-3 py-2.5"
                  data-preset-name={preset.name}
                >
                  {editing?.preset.id === preset.id ? (
                    <EditRow
                      words={l}
                      name={editing.name}
                      busy={busy === preset.id}
                      disabled={!online}
                      onName={(name) => setEditing({ ...editing, name })}
                      onSave={() => void sendEdit()}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{preset.name}</span>
                          {isDefault(preset) && <Badge tone="accent">{l.defaultBadge}</Badge>}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {[
                            preset.basePreset
                              ? l.basedOn(presetNames[preset.basePreset as UserPresetId])
                              : null,
                            l.updated(formatDate(new Date(preset.updatedAt), locale)),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-expanded={previewing?.preset.id === preset.id}
                          className="pointer-coarse:h-11"
                          onClick={() => void preview(preset)}
                        >
                          {previewing?.preset.id === preset.id ? l.hidePreview : l.preview}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={l.actions(preset.name)}
                            disabled={disabled}
                            className={cn(
                              buttonVariants({ variant: "ghost", size: "icon" }),
                              "pointer-coarse:size-11",
                            )}
                          >
                            <EllipsisVertical aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() =>
                                  setEditing({ mode: "rename", preset, name: preset.name })
                                }
                              >
                                {l.rename}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  setEditing({
                                    mode: "duplicate",
                                    preset,
                                    name: [...l.copyOf(preset.name)]
                                      .slice(0, presetLimits.name)
                                      .join(""),
                                  })
                                }
                              >
                                {l.duplicate}
                              </DropdownMenuItem>
                              {!isDefault(preset) && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    void chooseDefault({ kind: "personal", presetId: preset.id })
                                  }
                                >
                                  {l.makeDefault}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => askDelete(preset)}
                            >
                              {l.delete}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )}
                  {/* Below its row on a narrow screen; beside the list from lg. */}
                  {!beside && previewing?.preset.id === preset.id && (
                    <div className="mt-3">
                      <PreviewPane words={l} shown={previewing} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {totalPages > 1 && (
            <nav className="flex items-center justify-between gap-2" aria-label={l.mine}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page.page <= 1 || listState === "loading"}
                onClick={() => void load(page.page - 1)}
              >
                <ChevronLeft aria-hidden /> {l.previous}
              </Button>
              <span className="text-xs text-muted-foreground">
                {l.page(formatNumber(locale, page.page), formatNumber(locale, totalPages))}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page.page >= totalPages || listState === "loading"}
                onClick={() => void load(page.page + 1)}
              >
                {l.next} <ChevronRight aria-hidden />
              </Button>
            </nav>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">{l.updateHint}</p>
        </section>

        <div className="hidden min-w-0 lg:block">
          {beside && previewing ? (
            <PreviewPane words={l} shown={previewing} />
          ) : (
            page.items.length > 0 && (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                {l.choosePreview}
              </p>
            )
          )}
        </div>
      </div>

      <ConfirmDialog
        confirmation={confirmation}
        busy={busy !== null}
        onConfirm={(asked) => void asked.run()}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  );
}

function DefaultOption({
  label,
  hint,
  value,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-disabled:cursor-not-allowed has-disabled:opacity-70">
      <input
        type="radio"
        name="default-appearance"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="accent-primary"
      />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function EditRow({
  words,
  name,
  busy,
  disabled,
  onName,
  onSave,
  onCancel,
}: {
  words: Words["library"];
  name: string;
  busy: boolean;
  disabled: boolean;
  onName: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  return (
    <form
      noValidate
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {words.name}
      </label>
      <Input
        id={id}
        autoFocus
        value={name}
        maxLength={presetLimits.name * 2}
        autoComplete="off"
        onChange={(event) => onName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className="min-w-0 flex-1 basis-40"
      />
      <Button type="submit" size="sm" disabled={busy || disabled || !name.trim()}>
        {busy && <LoaderCircle className="animate-spin" aria-hidden />}
        {busy ? words.saving : words.save}
      </Button>
      <Button type="button" size="sm" variant="ghost" aria-label={words.cancel} onClick={onCancel}>
        <X aria-hidden />
      </Button>
    </form>
  );
}

function PreviewPane({
  words,
  shown,
}: {
  words: Words["library"];
  shown:
    | { preset: PresetMeta; state: "loading" }
    | { preset: PresetMeta; state: "ready"; snapshot: AppearanceSnapshot }
    | { preset: PresetMeta; state: "failed" | "unreadable" };
}) {
  if (shown.state === "ready") {
    return (
      <PresetPreview
        snapshot={shown.snapshot}
        caption={words.previewOf(shown.preset.name)}
        className="h-[28rem] lg:sticky lg:top-6"
      />
    );
  }
  return (
    <p
      role="status"
      className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground"
    >
      {shown.state === "loading"
        ? words.previewLoading
        : shown.state === "unreadable"
          ? words.previewUnreadable
          : words.previewFailed}
    </p>
  );
}
