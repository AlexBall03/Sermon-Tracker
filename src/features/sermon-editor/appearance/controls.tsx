"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { ColorField, NumberField } from "@/features/editor-lab/components/style-fields";
import type { ColorValue } from "@/features/editor-lab/styles/colors";
import { UNSET, type Draft, type Path } from "@/features/editor-lab/styles/draft";
import {
  accentPositions,
  borderStyles,
  fontRegistry,
  isFontSize,
  userPresetIds,
  type ComponentKind,
  type FontKey,
  type UserPresetId,
} from "@/features/editor-lab/styles/model";
import type { Preset, PresetId } from "@/features/editor-lab/styles/presets";
import { sourceOf, type Layer, type LayerSource } from "@/features/editor-lab/styles/resolve";
import { textAlignments } from "@/features/editor-lab/schema/model";
import type { Dictionaries } from "@/i18n";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { FieldGroup, FieldSpec } from "./fields";
import type { AppearanceSession } from "./session";

/*
 * The Appearance controls (A1-UI.2B.2), shared by Outline Settings and
 * Component Appearance: one set of fields (`fields.ts`), one way of showing
 * where a value comes from, and one footer with Apply and Cancel.
 *
 * Each property shows the value in force and where it comes from. "Use
 * inherited setting" takes this layer's value away (the property inherits
 * again); a color's None or Theme color is a value of its own, never the same
 * as inheriting.
 */

/** What the draft would change, in words. */
export function pendingParts(
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

export function PresetChooser({
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

export function ConflictLine({ keep, current }: { keep: () => void; current: () => void }) {
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

export type FieldListProps = {
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
export function FieldList(props: FieldListProps) {
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

/**
 * The foot of an Appearance session, kept in reach while its body scrolls:
 * what blocks Apply (conflicts, orphans), what the draft holds, a slot for
 * the resets (`start`), Apply, and Cancel (which discards the draft and keeps
 * the window open).
 */
export function SessionFooter({
  session,
  start,
}: {
  session: AppearanceSession;
  start?: React.ReactNode;
}) {
  const a = useT("editorLab").appearance;
  const { dirty, conflictCount, orphanCount, message } = session;
  return (
    <div className="flex flex-col gap-2 border-t bg-surface px-4 py-3 sm:px-5">
      {conflictCount > 0 && (
        <div role="alert" className="flex flex-col gap-1.5 text-xs text-destructive">
          <span>{a.conflicts(conflictCount)}</span>
          <span className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={session.keepAllMine}>
              {a.keepAllMine}
            </Button>
            <Button size="sm" variant="outline" onClick={session.useAllCurrent}>
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
            onClick={session.discardOrphans}
          >
            {a.discardOrphans}
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {start}
        <p role="status" className="min-h-4 min-w-0 flex-1 text-xs text-gold-ink">
          {message === "applied"
            ? a.applied
            : message === "invalid"
              ? a.invalid
              : message === "refused"
                ? a.refused
                : dirty
                  ? a.pending(pendingParts(session.draft, a.pendingParts))
                  : ""}
        </p>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-none pointer-coarse:h-11"
            disabled={!dirty}
            onClick={session.discard}
          >
            {a.cancel}
          </Button>
          <Button
            type="button"
            className="flex-1 sm:min-w-24 sm:flex-none pointer-coarse:h-11"
            disabled={!dirty || conflictCount > 0 || orphanCount > 0}
            onClick={session.apply}
          >
            {a.apply}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The fields of one layer, as a session edits them. */
export function SessionFields({
  session,
  ...props
}: Omit<FieldListProps, "preset" | "set" | "conflictFor" | "onInvalid"> & {
  session: AppearanceSession;
}) {
  return (
    <FieldList
      {...props}
      preset={session.preset}
      set={session.set}
      conflictFor={session.conflictFor}
      onInvalid={() => session.setMessage("invalid")}
    />
  );
}
