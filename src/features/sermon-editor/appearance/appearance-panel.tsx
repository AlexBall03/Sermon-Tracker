"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { ChevronDown, Crosshair, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { ColorField, NumberField } from "@/features/editor-lab/components/style-fields";
import type { ColorValue } from "@/features/editor-lab/styles/colors";
import { findComponent } from "@/features/editor-lab/styles/component-node";
import {
  applyPlan,
  committedAt,
  conflicts as conflictsOf,
  emptyDraft,
  isDirty,
  keyOf,
  mergeAppearance,
  mergeStyles,
  orphans as orphansOf,
  rebaseEdit,
  resetLayer,
  restoreOutline,
  setEdit,
  UNSET,
  withoutEdits,
  type Draft,
  type Edit,
  type LayerPath,
  type Path,
} from "@/features/editor-lab/styles/draft";
import {
  accentPositions,
  borderStyles,
  componentKinds,
  fontRegistry,
  isFontSize,
  namedStyles,
  userPresetIds,
  type ComponentKind,
  type ComponentStyle,
  type FontKey,
  type NamedStyle,
  type UserPresetId,
} from "@/features/editor-lab/styles/model";
import { documentStylesKey } from "@/features/editor-lab/styles/plugin";
import { presets, type Preset, type PresetId } from "@/features/editor-lab/styles/presets";
import {
  componentLayers,
  namedLayers,
  readStyles,
  resolveComponent,
  resolveNamed,
  sourceOf,
  type Layer,
  type LayerSource,
} from "@/features/editor-lab/styles/resolve";
import { textAlignments } from "@/features/editor-lab/schema/model";
import type { Dictionaries } from "@/i18n";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { blockGroups, componentGroups, type FieldGroup, type FieldSpec } from "./fields";
import { useAppearanceTarget, type TargetStatus } from "./target";

/*
 * Appearance (A1-UI.2B.2): one panel for how the outline looks, in three
 * scopes: the Outline (its preset, its shared defaults, its text styles), a
 * kind of Component (every main point, every passage), and the Selected
 * component alone.
 *
 * Every scope edits one draft (`styles/draft.ts`): opening reads what is
 * committed; each adjustment changes the draft, which the outline shows at
 * once as a preview (view state: no document change, no history); Apply
 * writes all of it in one transaction (`applyAppearanceDraft`), undone in one
 * step, or nothing if any of it is stale; Cancel and Close throw it away.
 * Switching scope, kind, text style, or preset keeps it.
 *
 * Each property shows the value in force and where it comes from. "Use
 * inherited setting" takes this layer's value away (the property inherits
 * again); a color's None or Theme color is a value of its own, never the same
 * as inheriting.
 */

export type AppearanceScope = "outline" | "components" | "selected";
export type OutlineTarget = "defaults" | NamedStyle;

type Props = {
  editor: Editor;
  scope: AppearanceScope;
  onScope: (scope: AppearanceScope) => void;
  outlineTarget: OutlineTarget;
  onOutlineTarget: (target: OutlineTarget) => void;
  /** Closes the panel; the draft is already discarded. */
  onClose: () => void;
};

export function AppearancePanel({
  editor,
  scope,
  onScope,
  outlineTarget,
  onOutlineTarget,
  onClose,
}: Props) {
  const t = useT("editorLab");
  const a = t.appearance;
  const titleId = useId();
  const root = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [kind, setKind] = useState<ComponentKind>("point");
  const [message, setMessage] = useState<"applied" | "invalid" | "refused" | null>(null);
  const target = useAppearanceTarget(editor);
  const targetId = target.state === "none" ? null : target.target.id;

  // What is committed, and what in the draft is stale: read on every change of the document.
  const committed = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { doc } = current.state;
      const styles = readStyles(doc.attrs.styles);
      return {
        styles,
        fallback: documentStylesKey.getState(current.state)?.fallback ?? "baseline",
        appearance: targetId
          ? ((findComponent(doc, targetId)?.node.attrs.appearance ?? null) as ComponentStyle | null)
          : null,
        conflicts: conflictsOf(draft, styles, doc)
          .map((edit) => keyOf(edit.path))
          .join("\n"),
        orphans: orphansOf(draft, doc).length,
      };
    },
    equalityFn: (x, y) =>
      Boolean(x && y) &&
      x!.styles === y!.styles &&
      x!.fallback === y!.fallback &&
      x!.appearance === y!.appearance &&
      x!.conflicts === y!.conflicts &&
      x!.orphans === y!.orphans,
  });
  const stored = committed?.styles ?? null;
  const merged = useMemo(() => mergeStyles(stored, draft), [stored, draft]);
  const presetId: PresetId = merged?.preset ?? (committed?.fallback as PresetId) ?? "balanced";
  const preset = presets[presetId];
  const conflictKeys = new Set(committed?.conflicts ? committed.conflicts.split("\n") : []);
  const dirty = isDirty(draft);

  // The outline shows the draft while there is one: view state only, never the document's.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.commands.setStylesPreview(dirty ? { draft } : null);
  }, [editor, draft, dirty]);
  // The Selected scope's component is marked in the outline while it is customized.
  const marked = scope === "selected" && target.state === "ready" ? target.target.id : null;
  useEffect(() => {
    if (!editor.isDestroyed) editor.commands.setAppearanceTarget(marked);
  }, [editor, marked]);
  // Leaving the panel leaves nothing behind: no preview, no mark.
  useEffect(
    () => () => {
      if (editor.isDestroyed) return;
      editor.commands.setStylesPreview(null);
      editor.commands.setAppearanceTarget(null);
    },
    [editor],
  );
  useEffect(() => heading.current?.focus(), []);
  // "Applied" describes the last change only: any later change of the outline (an Undo) retires it.
  useEffect(() => {
    const retire = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) setMessage((shown) => (shown === "applied" ? null : shown));
    };
    editor.on("transaction", retire);
    return () => {
      editor.off("transaction", retire);
    };
  }, [editor]);

  const change = (next: Draft) => {
    setMessage(null);
    setDraft(next);
  };
  const set = (path: Path, value: unknown) =>
    change(setEdit(draft, path, value, committedAt(stored, editor.state.doc, path)));
  const reset = (layer: LayerPath) => change(resetLayer(draft, stored, editor.state.doc, layer));
  const discard = () => {
    setMessage(null);
    setDraft(emptyDraft);
  };
  const apply = () => {
    if (editor.commands.applyAppearanceDraft(draft)) {
      setDraft(emptyDraft);
      setMessage("applied");
      return;
    }
    const plan = applyPlan(draft, readStyles(editor.state.doc.attrs.styles), editor.state.doc);
    setMessage(!plan.ok && plan.reason === "invalid" ? "invalid" : "refused");
  };
  const allConflicts = () => conflictsOf(draft, stored, editor.state.doc);
  const keepMine = (edits: Edit[]) =>
    change(edits.reduce((next, edit) => rebaseEdit(next, edit, stored, editor.state.doc), draft));
  const takeCurrent = (edits: Edit[]) => change(withoutEdits(draft, edits));
  const conflictFor = (path: Path) => {
    const key = keyOf(path);
    if (!conflictKeys.has(key)) return null;
    const edit = draft.edits.get(key);
    return edit ? { keep: () => keepMine([edit]), current: () => takeCurrent([edit]) } : null;
  };

  let body: React.ReactNode;
  let resetAction: { label: string; run: () => void; hint?: string } | null = null;

  if (scope === "outline") {
    const layerPath: LayerPath =
      outlineTarget === "defaults"
        ? { layer: "defaults" }
        : { layer: "named", name: outlineTarget };
    const layers: Layer[] =
      outlineTarget === "defaults"
        ? [
            { source: "presetDefaults", values: preset.defaults },
            { source: "defaults", values: merged?.defaults },
          ]
        : namedLayers(merged, outlineTarget, null, preset);
    const resolved =
      outlineTarget === "defaults"
        ? { ...preset.defaults, ...(merged?.defaults ?? {}) }
        : resolveNamed(merged, outlineTarget, null, preset);
    resetAction = {
      label: a.restoreOutline(a.presets[(merged?.preset ?? presetId) as UserPresetId] ?? ""),
      hint: a.restoreHint,
      run: () => change(restoreOutline(draft, stored, editor.state.doc)),
    };
    body = (
      <>
        <PresetChooser
          value={presetId}
          onChange={(id) => set({ layer: "preset" }, id)}
          conflict={conflictFor({ layer: "preset" })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{a.textStyle}</span>
          <Select
            label={a.textStyle}
            value={outlineTarget}
            onChange={(value) => onOutlineTarget(value as OutlineTarget)}
            options={[
              { value: "defaults", label: a.sharedDefaults },
              ...namedStyles.map((name) => ({
                value: name,
                label: t.format.styleNames[name],
              })),
            ]}
          />
        </div>
        <FieldList
          groups={blockGroups}
          layers={layers}
          ownSource={outlineTarget === "defaults" ? "defaults" : "style"}
          resolved={resolved}
          preset={preset}
          pathOf={(field) => ({ ...layerPath, field }) as Path}
          set={set}
          conflictFor={conflictFor}
          onInvalid={() => setMessage("invalid")}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          onClick={() => reset(layerPath)}
        >
          <RotateCcw aria-hidden /> {a.resetTextStyle}
        </Button>
      </>
    );
  } else if (scope === "components") {
    resetAction = {
      label: a.resetComponent(a.kinds[kind]),
      run: () => reset({ layer: "component", kind }),
    };
    body = (
      <>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{a.componentType}</span>
          <Select
            label={a.componentType}
            value={kind}
            onChange={(value) => setKind(value as ComponentKind)}
            options={componentKinds.map((each) => ({ value: each, label: a.kinds[each] }))}
          />
        </div>
        <FieldList
          key={kind}
          groups={componentGroups[kind]}
          kind={kind}
          layers={componentLayers(merged, kind, null, preset)}
          ownSource="style"
          resolved={resolveComponent(merged, kind, null, preset)}
          preset={preset}
          pathOf={(field) => ({ layer: "component", kind, field })}
          set={set}
          conflictFor={conflictFor}
          onInvalid={() => setMessage("invalid")}
        />
      </>
    );
  } else {
    const ready = target.state === "ready" ? target.target : null;
    if (ready) {
      resetAction = {
        label: a.resetSelected,
        run: () => reset({ layer: "instance", ...ready }),
      };
    }
    const appearance = ready ? mergeAppearance(committed?.appearance, draft, ready.id) : null;
    body = (
      <>
        <TargetCard editor={editor} status={target} />
        {ready && (
          <FieldList
            key={ready.id}
            groups={componentGroups[ready.kind]}
            kind={ready.kind}
            layers={componentLayers(merged, ready.kind, appearance, preset)}
            ownSource="own"
            resolved={resolveComponent(merged, ready.kind, appearance, preset)}
            preset={preset}
            pathOf={(field) => ({ layer: "instance", ...ready, field })}
            set={set}
            conflictFor={conflictFor}
            onInvalid={() => setMessage("invalid")}
          />
        )}
      </>
    );
  }

  const conflictCount = conflictKeys.size;
  const orphanCount = committed?.orphans ?? 0;

  return (
    <section
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="appearance-panel"
      className="flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        // A popup or picker (portalled out of the panel) closes itself first; otherwise
        // Escape goes back to the outline, keeping the panel and its draft.
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (!root.current?.contains(event.target as Node)) return;
        event.preventDefault();
        editor.view.focus();
      }}
    >
      <div className="flex items-start gap-2 border-b px-4 pt-3 pb-3">
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="text-base font-semibold outline-none"
          >
            {a.title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{a.hint}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={a.close}
          title={a.close}
          onClick={() => {
            discard();
            onClose();
          }}
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-3">
        <div>
          <Segmented
            label={a.scope}
            hideLabel
            name={`${titleId}-scope`}
            value={scope}
            onChange={onScope}
            options={(["outline", "components", "selected"] as const).map((value) => ({
              value,
              label: a.scopes[value],
            }))}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{a.scopeHints[scope]}</p>
        </div>
        {body}
        {/* The reset for what is being customized, at the end of its settings. */}
        {resetAction && (
          <div className="border-t pt-3">
            <Button type="button" size="sm" variant="outline" onClick={resetAction.run}>
              <RotateCcw aria-hidden /> {resetAction.label}
            </Button>
            {resetAction.hint && (
              <p className="mt-1 text-xs text-muted-foreground">{resetAction.hint}</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t bg-surface px-4 py-3">
        {conflictCount > 0 && (
          <div role="alert" className="flex flex-col gap-1.5 text-xs text-destructive">
            <span>{a.conflicts(conflictCount)}</span>
            <span className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => keepMine(allConflicts())}>
                {a.keepAllMine}
              </Button>
              <Button size="sm" variant="outline" onClick={() => takeCurrent(allConflicts())}>
                {a.useAllCurrent}
              </Button>
            </span>
          </div>
        )}
        {orphanCount > 0 && (
          <div role="alert" className="flex flex-col gap-1.5 text-xs text-destructive">
            <span>{a.orphans}</span>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => change(withoutEdits(draft, orphansOf(draft, editor.state.doc)))}
            >
              {a.discardOrphans}
            </Button>
          </div>
        )}
        <p role="status" className="min-h-4 text-xs text-gold-ink">
          {message === "applied"
            ? a.applied
            : message === "invalid"
              ? a.invalid
              : message === "refused"
                ? a.refused
                : dirty
                  ? a.pending(pendingParts(draft, a.pendingParts))
                  : ""}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 pointer-coarse:h-11"
            disabled={!dirty || conflictCount > 0 || orphanCount > 0}
            onClick={apply}
          >
            {a.apply}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="flex-1 pointer-coarse:h-11"
            disabled={!dirty}
            onClick={discard}
          >
            {a.cancel}
          </Button>
        </div>
      </div>
    </section>
  );
}

/** What the draft would change, in words. */
function pendingParts(
  draft: Draft,
  words: {
    outline: string;
    kinds: (count: number) => string;
    components: (count: number) => string;
  },
): string {
  let outline = false;
  const kinds = new Set<string>();
  const components = new Set<string>();
  for (const { path } of draft.edits.values()) {
    if (path.layer === "component") kinds.add(path.kind);
    else if (path.layer === "instance") components.add(path.id);
    else outline = true;
  }
  return [
    outline ? words.outline : null,
    kinds.size ? words.kinds(kinds.size) : null,
    components.size ? words.components(components.size) : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function PresetChooser({
  value,
  onChange,
  conflict,
}: {
  value: PresetId;
  onChange: (id: UserPresetId) => void;
  conflict: { keep: () => void; current: () => void } | null;
}) {
  const a = useT("editorLab").appearance;
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{a.preset}</legend>
      {userPresetIds.map((id) => (
        <label
          key={id}
          className="flex cursor-pointer flex-col rounded-lg border px-3 py-2 has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
        >
          <span className="flex items-center gap-2">
            <input
              type="radio"
              name={name}
              value={id}
              checked={value === id}
              onChange={() => onChange(id)}
              className="accent-primary"
            />
            <span className="text-sm font-medium">{a.presets[id]}</span>
          </span>
          <span className="pl-6 text-xs text-muted-foreground">{a.presetHints[id]}</span>
        </label>
      ))}
      {conflict && <ConflictLine {...conflict} />}
    </fieldset>
  );
}

function ConflictLine({ keep, current }: { keep: () => void; current: () => void }) {
  const a = useT("editorLab").appearance;
  return (
    <span className="flex flex-wrap items-center gap-2 text-xs text-destructive">
      {a.changedElsewhere}
      <button type="button" className="underline underline-offset-2" onClick={keep}>
        {a.keepMine}
      </button>
      <button type="button" className="underline underline-offset-2" onClick={current}>
        {a.useCurrent}
      </button>
    </span>
  );
}

/** Which component the Selected scope customizes, and a way to find it in the outline. */
function TargetCard({ editor, status }: { editor: Editor; status: TargetStatus }) {
  const a = useT("editorLab").appearance;
  if (status.state === "none") {
    return <p className="rounded-lg border border-dashed p-3 text-sm">{a.noTarget}</p>;
  }
  if (status.state !== "ready") {
    return (
      <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
        {status.state === "gone" ? a.targetGone : a.targetChanged}
      </p>
    );
  }
  const { target, text, kept } = status;
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" data-testid="appearance-target">
      <span className="text-xs text-muted-foreground">{a.customizing}</span>
      <span className="text-sm">
        <span className="font-semibold">{a.kind[target.kind]}</span>
        {text ? ` · ${text}` : ""}
      </span>
      {kept && <span className="text-xs text-muted-foreground">{a.keptTarget}</span>}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        onClick={() => {
          const found = findComponent(editor.state.doc, target.id);
          const dom = found ? editor.view.nodeDOM(found.pos) : null;
          if (dom instanceof HTMLElement)
            dom.scrollIntoView({ block: "center", behavior: "smooth" });
        }}
      >
        <Crosshair aria-hidden /> {a.showTarget}
      </Button>
    </div>
  );
}

type FieldListProps = {
  groups: FieldGroup[];
  kind?: ComponentKind;
  layers: Layer[];
  /** The layer being edited: a property it sets is "Customized". */
  ownSource: LayerSource;
  resolved: Record<string, unknown>;
  preset: Preset;
  pathOf: (field: string) => Path;
  set: (path: Path, value: unknown) => void;
  conflictFor: (path: Path) => { keep: () => void; current: () => void } | null;
  onInvalid: () => void;
};

/** The groups of one layer's properties, the less common under "More options". */
function FieldList(props: FieldListProps) {
  const a = useT("editorLab").appearance;
  return (
    <div className="flex flex-col gap-4">
      {props.groups.map((group) => {
        const main = group.fields.filter((spec) => !spec.advanced);
        const more = group.fields.filter((spec) => spec.advanced);
        return (
          <section key={group.id} aria-label={a.groups[group.id]} data-group={group.id}>
            <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {a.groups[group.id]}
            </h3>
            <div className="flex flex-col divide-y">
              {main.map((spec) => (
                <FieldRow key={spec.field} spec={spec} {...props} />
              ))}
            </div>
            {more.length > 0 && (
              <details className="group mt-1">
                <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1 text-xs font-medium text-primary pointer-coarse:min-h-11">
                  <ChevronDown
                    className="size-3.5 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                  {a.more}
                </summary>
                <div className="flex flex-col divide-y">
                  {more.map((spec) => (
                    <FieldRow key={spec.field} spec={spec} {...props} />
                  ))}
                </div>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FieldRow({
  spec,
  kind,
  layers,
  ownSource,
  resolved,
  preset,
  pathOf,
  set,
  conflictFor,
  onInvalid,
}: FieldListProps & { spec: FieldSpec }) {
  const a = useT("editorLab").appearance;
  const { field } = spec;
  const path = pathOf(field);
  const source = sourceOf(layers, field);
  const own = source === ownSource;
  const label = fieldLabel(a, field, kind);
  const conflict = conflictFor(path);
  const value = resolved[field];
  const inherited =
    source === "defaults"
      ? a.sources.defaults
      : source === "style" && kind
        ? a.sources.style(a.kinds[kind])
        : a.sources.preset;
  return (
    <div className="flex flex-col gap-1.5 py-2" data-field={field}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {own ? (
          <span className="flex shrink-0 items-center gap-1">
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
              {a.customized}
            </span>
            <button
              type="button"
              aria-label={a.useInheritedFor(label)}
              title={a.useInherited}
              onClick={() => set(path, UNSET)}
              className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:size-10"
            >
              <RotateCcw className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">
            {a.inheritedFrom(inherited)}
          </span>
        )}
      </div>
      <Control
        spec={spec}
        label={label}
        value={value}
        own={own}
        preset={preset}
        onChange={(next) => set(path, next)}
        onInvalid={onInvalid}
      />
      {conflict && <ConflictLine {...conflict} />}
    </div>
  );
}

type AppearanceWords = Dictionaries["editorLab"]["appearance"];

function fieldLabel(a: AppearanceWords, field: string, kind?: ComponentKind): string {
  if ((kind === "introduction" || kind === "conclusion") && field in a.sectionFields) {
    return a.sectionFields[field as keyof typeof a.sectionFields];
  }
  if (kind === "scripture" && field in a.scriptureFields) {
    return a.scriptureFields[field as keyof typeof a.scriptureFields];
  }
  if ((kind === "preacherNote" || kind === "script") && field in a.paragraphFields) {
    return a.paragraphFields[field as keyof typeof a.paragraphFields];
  }
  return a.fields[field as keyof typeof a.fields] ?? field;
}

/*
 * A property's control. Each reports only a value other than the one shown,
 * so redrawing it never turns an inherited value into a set one. `value`
 * undefined: the preset's design draws it (its CSS), named "Preset design".
 */
function Control({
  spec,
  label,
  value,
  own,
  preset,
  onChange,
  onInvalid,
}: {
  spec: FieldSpec;
  label: string;
  value: unknown;
  own: boolean;
  preset: Preset;
  onChange: (value: unknown) => void;
  onInvalid: () => void;
}) {
  const t = useT("editorLab");
  const a = t.appearance;
  const name = useId();
  const muted = !own && "text-muted-foreground";
  switch (spec.control) {
    case "font": {
      // A label left to the preset is in its structural face.
      const shown = (value ?? preset.structureFont ?? "source-sans-3") as FontKey;
      return (
        <Select
          label={label}
          value={shown}
          onChange={(next) => next !== shown && onChange(next)}
          options={(Object.keys(fontRegistry) as FontKey[]).map((key) => ({
            value: key,
            label: fontRegistry[key].name,
          }))}
          className={cn("h-9 pointer-coarse:h-11", muted)}
        />
      );
    }
    case "toggle":
      return (
        <Segmented
          label={label}
          hideLabel
          name={name}
          value={value ? "on" : "off"}
          onChange={(next) => onChange(next === "on")}
          options={[
            { value: "on", label: a.on },
            { value: "off", label: a.off },
          ]}
        />
      );
    case "align":
      return (
        <Select
          label={label}
          value={value as string}
          onChange={(next) => next !== value && onChange(next)}
          options={textAlignments.map((align) => ({
            value: align,
            label: t.documentStyles.alignments[align],
          }))}
          className={cn("h-9 pointer-coarse:h-11", muted)}
        />
      );
    case "borderStyle":
      return (
        <Select
          label={label}
          value={(value as string | undefined) ?? ""}
          onChange={(next) => next && next !== value && onChange(next)}
          options={[
            ...(value === undefined ? [{ value: "", label: a.presetDesign }] : []),
            ...borderStyles.map((style) => ({ value: style, label: a.borderStyles[style] })),
          ]}
          className={cn("h-9 pointer-coarse:h-11", muted)}
        />
      );
    case "accentPosition":
      return (
        <Segmented
          label={label}
          hideLabel
          name={name}
          // Left is the presets' design.
          value={(value as string | undefined) ?? "left"}
          onChange={(next) => onChange(next)}
          options={accentPositions.map((side) => ({ value: side, label: a.accentPositions[side] }))}
        />
      );
    case "ink":
    case "inkOrNone":
    case "fill":
      return (
        <ColorField
          label={label}
          value={value as ColorValue | null | undefined}
          own={own}
          kind={spec.control === "fill" ? "fill" : "ink"}
          noneLabel={spec.control === "ink" ? undefined : a.none}
          presetLabel={a.presetDesign}
          onChange={onChange}
        />
      );
    case "size":
    case "number":
      return (
        <NumberField
          label={label}
          value={value as number | undefined}
          own={own}
          placeholder={a.presetDesign}
          valid={(number) =>
            spec.control === "size"
              ? isFontSize(number)
              : number >= spec.limits!.min && number <= spec.limits!.max
          }
          onChange={onChange}
          onInvalid={onInvalid}
        />
      );
  }
}
