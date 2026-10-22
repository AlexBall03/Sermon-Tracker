"use client";

import { Check, ChevronDown, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { normalizeColor } from "../../schema/formatting";
import { highlightPresets, textColorPresets } from "../../schema/model";
import {
  contrastWarnings,
  isHex,
  modeOf,
  renderColor,
  surfaces,
  type ColorKind,
  type ColorMode,
  type ColorTarget,
  type ColorValue,
} from "../../styles/colors";
import { mixed } from "../../formatting-state";

/*
 * Choosing a color (PS-1B.2B.2B): the theme's own color (or no highlight),
 * a preset, or a custom color in one of three behaviours: Adaptive (the
 * default), Exact, or Per theme. The preview shows what is drawn in the
 * light theme, the dark theme, and print, from the same functions that draw
 * the document (`styles/colors.ts`); a color the person fixed that reads
 * poorly is warned about, never changed.
 */

type Shown = ColorValue | null | typeof mixed;

const presetsOf = (kind: ColorKind): readonly string[] =>
  kind === "ink" ? textColorPresets : highlightPresets;

/** What the custom fields start from: the color in force when it is a custom one. */
function draftOf(value: Shown): { mode: ColorMode; light: string; dark: string } {
  if (value && value !== mixed) {
    if (typeof value === "string" && isHex(value))
      return { mode: "adaptive", light: value, dark: value };
    if (typeof value !== "string") {
      return value.mode === "exact"
        ? { mode: "exact", light: value.color, dark: value.color }
        : { mode: "themed", light: value.light, dark: value.dark };
    }
  }
  return { mode: "adaptive", light: "#2563eb", dark: "#93c5fd" };
}

function valueOf(draft: { mode: ColorMode; light: string; dark: string }): ColorValue | null {
  if (!isHex(draft.light)) return null;
  if (draft.mode === "adaptive") return draft.light;
  if (draft.mode === "exact") return { mode: "exact", color: draft.light };
  return isHex(draft.dark) ? { mode: "themed", light: draft.light, dark: draft.dark } : null;
}

const sameColor = (a: Shown, b: Shown) => JSON.stringify(a) === JSON.stringify(b);

/** One sample of a color as drawn on a target: text on its surface, or the theme's text on a fill. */
function Sample({
  value,
  kind,
  target,
}: {
  value: ColorValue;
  kind: ColorKind;
  target: ColorTarget;
}) {
  const t = useT("editorLab").format;
  const drawn = renderColor(value, kind, target);
  const { background, text } = surfaces[target];
  return (
    <span
      className="flex flex-1 flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-xs"
      style={{ background }}
      data-target={target}
    >
      <span
        className="rounded px-1 text-base font-semibold"
        style={kind === "ink" ? { color: drawn ?? text } : { color: text, background: drawn ?? "" }}
      >
        Aa
      </span>
      <span style={{ color: text }}>{t.targets[target]}</span>
    </span>
  );
}

export function ColorPicker({
  kind,
  value,
  onPick,
  noneLabel,
}: {
  kind: ColorKind;
  value: Shown;
  /** null: the theme's color (ink) or no highlight (fill). */
  onPick: (value: ColorValue | null) => void;
  /** What null is called where it turns a part off (a border, an accent: "None"), instead of the theme color. */
  noneLabel?: string;
}) {
  const t = useT("editorLab").format;
  const id = useId();
  const [draft, setDraft] = useState(() => draftOf(value));
  const custom = valueOf(draft);
  const warnings = custom ? contrastWarnings(custom, kind) : [];
  const field = (which: "light" | "dark", label: string) => (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label={`${t.pick}: ${label}`}
        value={isHex(draft[which]) ? draft[which] : "#000000"}
        onChange={(event) => setDraft({ ...draft, [which]: event.target.value })}
        className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
      />
      <Input
        aria-label={`${t.hex}: ${label}`}
        value={draft[which]}
        spellCheck={false}
        onChange={(event) => {
          const typed = event.target.value;
          setDraft({ ...draft, [which]: normalizeColor(typed, []) ?? typed });
        }}
        className="h-9 font-mono"
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 text-sm" data-testid={`lab-color-${kind}`}>
      <button
        type="button"
        onClick={() => onPick(null)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
      >
        <span
          className="size-5 rounded-full border"
          style={{ background: kind === "ink" && !noneLabel ? "var(--foreground)" : "transparent" }}
        />
        <span className="flex-1">
          {noneLabel ?? (kind === "ink" ? t.themeColor : t.noHighlight)}
        </span>
        {value === null && <Check className="size-4 text-primary" aria-hidden />}
      </button>
      <div
        className="grid grid-cols-9 gap-1.5"
        role="group"
        aria-label={kind === "ink" ? t.textColor : t.highlight}
      >
        {presetsOf(kind).map((preset) => {
          const label = t.colors[preset as keyof typeof t.colors];
          const chosen = sameColor(value, preset);
          return (
            <button
              key={preset}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={chosen}
              data-color={preset}
              onClick={() => onPick(preset)}
              className={cn(
                "lab-swatch size-6 rounded-full border border-black/10 outline-offset-2 hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring",
                chosen && "outline-2 outline-primary",
              )}
              style={{
                // The swatch is drawn as it would be in each theme (`lab.css`).
                ["--swatch-l" as string]: renderColor(preset, kind, "light") ?? "",
                ["--swatch-d" as string]: renderColor(preset, kind, "dark") ?? "",
              }}
            />
          );
        })}
      </div>
      <div className="flex flex-col gap-2 border-t pt-3">
        <p className="font-medium">{t.custom}</p>
        <Segmented
          label={t.mode}
          hideLabel
          name={`${id}-mode`}
          value={draft.mode}
          onChange={(mode) => setDraft({ ...draft, mode })}
          options={(["adaptive", "exact", "themed"] as const).map((mode) => ({
            value: mode,
            label: t.modes[mode],
          }))}
        />
        <p className="text-xs text-muted-foreground">{t.modeHints[draft.mode]}</p>
        {draft.mode === "themed" ? (
          <>
            <span className="text-xs font-medium">{t.lightColor}</span>
            {field("light", t.lightColor)}
            <span className="text-xs font-medium">{t.darkColor}</span>
            {field("dark", t.darkColor)}
          </>
        ) : (
          field("light", t.custom)
        )}
        {custom && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t.preview}</span>
            <div className="flex gap-1.5">
              {(["light", "dark", "paper"] as const).map((target) => (
                <Sample key={target} value={custom} kind={kind} target={target} />
              ))}
            </div>
          </div>
        )}
        {warnings.map((target) => (
          <p key={target} role="status" className="flex items-start gap-1.5 text-xs text-gold-ink">
            <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {t.lowContrast(t.lowContrastWhere[target])}
          </p>
        ))}
        <Button
          type="button"
          size="sm"
          disabled={!custom}
          onClick={() => custom && onPick(custom)}
          data-mode={custom ? modeOf(custom) : undefined}
        >
          {t.apply}
        </Button>
      </div>
    </div>
  );
}

/**
 * What the bar under a toolbar color button shows (A1-UI.2B.2 finalization):
 * a color in force, the theme's own text color (drawn, since it is what the
 * text is in), no highlight (an empty outline), or a selection of more than
 * one (a split bar, never one of its colors).
 */
export type BarState = "color" | "theme" | "none" | "mixed";

export function barStateOf(kind: ColorKind, value: Shown): BarState {
  if (value === mixed) return "mixed";
  if (value === null) return kind === "ink" ? "theme" : "none";
  return "color";
}

/** The toolbar's color button: the color in force under the icon, the picker in a popover. */
export function ColorControl({
  kind,
  value,
  icon: Icon,
  onOpen,
  onPick,
  finalFocus,
  lightPaper = false,
}: {
  kind: ColorKind;
  value: Shown;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onOpen: () => void;
  onPick: (value: ColorValue | null) => void;
  finalFocus: () => boolean;
  /**
   * Whether the text is on light paper (Print Layout, `v4/paper.ts`): the bar
   * then shows the color as the paper draws it, in either theme.
   */
  lightPaper?: boolean;
}) {
  const t = useT("editorLab").format;
  const [open, setOpen] = useState(false);
  const label = kind === "ink" ? t.textColor : t.highlight;
  const state = barStateOf(kind, value);
  const bar =
    value && value !== mixed
      ? {
          ["--swatch-l" as string]: renderColor(value, kind, "light") ?? "",
          ["--swatch-d" as string]: renderColor(value, kind, "dark") ?? "",
        }
      : undefined;
  const shown =
    state === "mixed"
      ? t.mixed
      : state === "theme"
        ? t.themeColor
        : state === "none"
          ? t.noHighlight
          : typeof value === "string" && value in t.colors
            ? t.colors[value as keyof typeof t.colors]
            : t.custom;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen();
        setOpen(next);
      }}
    >
      <PopoverTrigger
        aria-label={label}
        aria-description={shown}
        title={`${label}: ${shown}`}
        // The selection is remembered before the popover takes focus (`keep-selection.ts`).
        onPointerDown={onOpen}
        className="inline-flex h-9 items-center gap-0.5 rounded-md px-1.5 text-foreground hover:bg-accent data-popup-open:bg-accent"
      >
        <span className="flex flex-col items-center">
          <Icon className="size-4" aria-hidden />
          <span
            data-state={state}
            data-surface={lightPaper ? "paper" : undefined}
            className={cn(
              "lab-bar mt-0.5 h-1 w-4 rounded-full",
              state === "color" && "lab-swatch",
              // The text is in the theme's own color (`lab.css`).
              state === "theme" && "lab-swatch-theme",
              state === "none" && "border border-muted-foreground",
              state === "mixed" && "lab-swatch-mixed",
            )}
            style={bar}
          />
        </span>
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-80" finalFocus={finalFocus}>
        <ColorPicker
          kind={kind}
          value={value}
          onPick={(next) => {
            setOpen(false);
            onPick(next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
