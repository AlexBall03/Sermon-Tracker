"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { textAlignments } from "../schema/model";
import { renderColor, type ColorValue } from "../styles/colors";
import {
  documentStylesSchema,
  fontRegistry,
  isFontSize,
  namedStyles,
  type DocumentStyles,
  type FontKey,
  type NamedStyle,
} from "../styles/model";
import { documentStylesKey, presetInForce } from "../styles/plugin";
import type { Preset } from "../styles/presets";
import { readStyles, resolveNamed, type ResolvedBlock } from "../styles/resolve";
import { ColorPicker } from "./formatting/color-control";

/*
 * Document Styles (PS-1B.2B.2B): the document's defaults and its named
 * styles, edited in the inspector. Each property shows the value in force
 * and whether this style sets it ("Customized", with a reset) or inherits it
 * (and from where), as the resolver works it out (`resolve.ts`).
 *
 * What is edited is a draft, shown on the document as a preview (view state,
 * `setStylesPreview`): nothing is written while controls are adjusted. Apply
 * writes the whole change in one transaction, undone in one step; Cancel,
 * leaving the panel, or opening another document ends the preview and
 * leaves the document as it was. Text with its own formatting keeps it,
 * since a mark or a paragraph's own format comes after its style.
 */

type Target = "defaults" | NamedStyle;
type Field = keyof ResolvedBlock;
type Layer = Partial<ResolvedBlock>;

const fields: Field[] = [
  "fontFamily",
  "fontSize",
  "bold",
  "italic",
  "underline",
  "color",
  "lineHeight",
  "spaceBefore",
  "spaceAfter",
  "indentLeft",
  "indentFirst",
  "align",
];

const numberLimits: Partial<Record<Field, { min: number; max: number }>> = {
  lineHeight: { min: 1, max: 3 },
  spaceBefore: { min: 0, max: 72 },
  spaceAfter: { min: 0, max: 72 },
  indentLeft: { min: 0, max: 432 },
  indentFirst: { min: -144, max: 144 },
};

const layerOf = (styles: DocumentStyles | null, target: Target): Layer =>
  ((target === "defaults" ? styles?.defaults : styles?.named?.[target]) ?? {}) as Layer;

/** `styles` with one style's layer replaced, kept sparse: an empty layer or document is left out. */
function withLayer(
  styles: DocumentStyles | null,
  target: Target,
  layer: Layer,
): DocumentStyles | null {
  const clean = Object.fromEntries(
    Object.entries(layer).filter(([, value]) => value !== undefined),
  );
  const next: Record<string, unknown> = { ...(styles ?? { version: 1 }) };
  if (target === "defaults") {
    if (Object.keys(clean).length) next.defaults = clean;
    else delete next.defaults;
  } else {
    const named: Record<string, unknown> = { ...(styles?.named ?? {}) };
    if (Object.keys(clean).length) named[target] = clean;
    else delete named[target];
    if (Object.keys(named).length) next.named = named;
    else delete next.named;
  }
  const { version: _version, ...rest } = next;
  void _version;
  return Object.keys(rest).length ? (next as DocumentStyles) : null;
}

/** What a property would be if this style did not set it, and where that comes from (the preset's built-in values are level 1). */
function inheritedOf(styles: DocumentStyles | null, target: Target, field: Field, preset: Preset) {
  if (target === "defaults") return { value: preset.defaults[field], fromDefaults: false };
  const without = withLayer(styles, target, { ...layerOf(styles, target), [field]: undefined });
  const builtIn = preset.named[target][field] !== undefined;
  const fromDefaults = !builtIn && layerOf(styles, "defaults")[field] !== undefined;
  return { value: resolveNamed(without, target, null, preset)[field], fromDefaults };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function DocumentStylesPanel({ editor }: { editor: Editor }) {
  const t = useT("editorLab");
  const d = t.documentStyles;
  // An option of the editor, the same for its whole life.
  const preset = presetInForce(editor.state);
  const stored = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      styles: readStyles(current.state.doc.attrs.styles),
      previewing: Boolean(documentStylesKey.getState(current.state)?.preview),
    }),
    equalityFn: (a, b) => a?.styles === b?.styles && a?.previewing === b?.previewing,
  });
  const [draft, setDraft] = useState<DocumentStyles | null>(stored?.styles ?? null);
  const [target, setTarget] = useState<Target>("normal");
  const [message, setMessage] = useState<"applied" | "invalid" | null>(null);
  const dirty = !same(draft, stored?.styles ?? null);

  // Another document, an undo, or anything else that changed the styles while nothing is previewed: start again from them.
  const previewing = stored?.previewing ?? false;
  const storedStyles = stored?.styles ?? null;
  const [base, setBase] = useState(storedStyles);
  if (base !== storedStyles && !previewing) {
    setBase(storedStyles);
    setDraft(storedStyles);
  }

  // Leaving the panel ends the preview: nothing it showed stays.
  useEffect(
    () => () => {
      if (!editor.isDestroyed && documentStylesKey.getState(editor.state)?.preview) {
        editor.commands.setStylesPreview(null);
      }
    },
    [editor],
  );

  const change = (next: DocumentStyles | null) => {
    if (next && !documentStylesSchema.safeParse(next).success) {
      setMessage("invalid");
      return;
    }
    setMessage(null);
    setDraft(next);
    editor.commands.setStylesPreview(same(next, storedStyles) ? null : { styles: next });
  };
  const setField = (field: Field, value: unknown) =>
    change(withLayer(draft, target, { ...layerOf(draft, target), [field]: value }));

  const layer = layerOf(draft, target);
  const resolved =
    target === "defaults"
      ? { ...preset.defaults, ...layer }
      : resolveNamed(draft, target, null, preset);

  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="lab-document-styles">
      <div>
        <h3 className="font-semibold">{d.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{d.hint}</p>
      </div>
      <Select
        label={d.target}
        value={target}
        onChange={(value) => setTarget(value as Target)}
        options={[
          { value: "defaults", label: d.defaults },
          ...namedStyles.map((name) => ({ value: name, label: t.format.styleNames[name] })),
        ]}
      />
      <div className="flex flex-col divide-y">
        {fields.map((field) => {
          const own = layer[field] !== undefined;
          const inherited = inheritedOf(draft, target, field, preset);
          return (
            <div key={field} className="flex flex-col gap-1 py-2" data-field={field}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{d.fields[field]}</span>
                {own ? (
                  <span className="flex items-center gap-1">
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">
                      {d.customized}
                    </span>
                    <button
                      type="button"
                      aria-label={d.reset(d.fields[field])}
                      title={d.reset(d.fields[field])}
                      onClick={() => setField(field, undefined)}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {d.inheritedFrom(inherited.fromDefaults ? d.defaults : d.builtIn)}
                  </span>
                )}
              </div>
              <FieldControl
                field={field}
                value={resolved[field]}
                own={own}
                onChange={(value) => setField(field, value)}
                onInvalid={() => setMessage("invalid")}
              />
            </div>
          );
        })}
      </div>
      {(message || previewing) && (
        <p
          role="status"
          className={cn("text-xs", message === "invalid" ? "text-destructive" : "text-gold-ink")}
        >
          {message === "invalid" ? d.invalid : message === "applied" ? d.applied : d.previewing}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!dirty}
          onClick={() => {
            if (editor.commands.applyDocumentStyles(draft)) setMessage("applied");
          }}
        >
          {d.apply}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty}
          onClick={() => {
            editor.commands.setStylesPreview(null);
            setDraft(storedStyles);
            setMessage(null);
          }}
        >
          {d.cancel}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => change(withLayer(draft, target, {}))}>
          {d.restore}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => change(null)}>
          {d.restoreAll}
        </Button>
      </div>
    </div>
  );
}

/*
 * Each menu calls `onChange` only for a value other than the one shown: a
 * menu whose value or options change (another style chosen) can report its
 * own value, which must not turn an inherited property into a customized one.
 */
function FieldControl({
  field,
  value,
  own,
  onChange,
  onInvalid,
}: {
  field: Field;
  value: ResolvedBlock[Field];
  own: boolean;
  onChange: (value: unknown) => void;
  onInvalid: () => void;
}) {
  const t = useT("editorLab");
  const d = t.documentStyles;
  const label = d.fields[field];
  const muted = !own && "text-muted-foreground";

  if (field === "fontFamily") {
    return (
      <Select
        label={label}
        value={value as FontKey}
        onChange={(next) => next !== value && onChange(next)}
        options={(Object.keys(fontRegistry) as FontKey[]).map((key) => ({
          value: key,
          label: fontRegistry[key].name,
        }))}
        className={cn("h-9", muted)}
      />
    );
  }
  if (field === "bold" || field === "italic" || field === "underline") {
    return (
      <Select
        label={label}
        value={value ? "on" : "off"}
        onChange={(next) => (next === "on") !== value && onChange(next === "on")}
        options={[
          { value: "on", label: d.on },
          { value: "off", label: d.off },
        ]}
        className={cn("h-9", muted)}
      />
    );
  }
  if (field === "align") {
    return (
      <Select
        label={label}
        value={value as string}
        onChange={(next) => next !== value && onChange(next)}
        options={textAlignments.map((align) => ({ value: align, label: d.alignments[align] }))}
        className={cn("h-9", muted)}
      />
    );
  }
  if (field === "color") {
    return <ColorField value={value as ColorValue | null} own={own} onChange={onChange} />;
  }
  return (
    <NumberField
      label={label}
      value={value as number}
      own={own}
      valid={(number) => {
        if (field === "fontSize") return isFontSize(number);
        const limits = numberLimits[field]!;
        return number >= limits.min && number <= limits.max;
      }}
      onChange={onChange}
      onInvalid={onInvalid}
    />
  );
}

/** A number, applied to the draft when it is left or Enter is pressed. */
function NumberField({
  label,
  value,
  own,
  valid,
  onChange,
  onInvalid,
}: {
  label: string;
  value: number;
  own: boolean;
  valid: (value: number) => boolean;
  onChange: (value: number) => void;
  onInvalid: () => void;
}) {
  const locale = useLocale();
  const shown = formatNumber(locale, value);
  // What is typed, only while it is being typed: leaving an untouched field changes nothing.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const number = Number(draft.replace(",", ".").trim());
    if (draft.trim() === "" || !Number.isFinite(number) || !valid(number)) {
      if (draft.trim() !== "") onInvalid();
      return;
    }
    if (number !== value || !own) onChange(number);
  };
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      value={draft ?? shown}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      className={cn("h-9 tabular-nums", !own && "text-muted-foreground")}
    />
  );
}

function ColorField({
  value,
  own,
  onChange,
}: {
  value: ColorValue | null;
  own: boolean;
  onChange: (value: ColorValue | null) => void;
}) {
  const t = useT("editorLab").format;
  const [open, setOpen] = useState(false);
  const swatch = value === null ? null : renderColor(value, "ink", "light");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t.textColor}
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-input bg-surface px-3 text-left shadow-card",
          !own && "text-muted-foreground",
        )}
      >
        <span
          className="size-4 rounded-full border"
          style={{ background: swatch ?? "var(--foreground)" }}
        />
        <span className="truncate">
          {value === null
            ? t.themeColor
            : typeof value === "string" && value in t.colors
              ? t.colors[value as keyof typeof t.colors]
              : (swatch ?? "")}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <ColorPicker
          kind="ink"
          value={value}
          onPick={(next) => {
            setOpen(false);
            onChange(next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
