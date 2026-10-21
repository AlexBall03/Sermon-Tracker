"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { renderColor, type ColorKind, type ColorValue } from "../styles/colors";
import { mixed } from "../formatting-state";
import { ColorPicker } from "./formatting/color-control";

/*
 * The style controls shared by Document Styles (the v3 lab) and the
 * Appearance panel (A1-UI.2B.2). Each shows the value in force; `own` says
 * whether the style being edited sets it (an inherited value is muted). Each
 * reports a change only for a value other than the one shown, so a control
 * that is merely redrawn never turns an inherited value into a set one.
 */

/**
 * A number, applied when it is left or Enter is pressed. `value` undefined:
 * nothing sets it and the preset's design draws it, shown as `placeholder`.
 */
export function NumberField({
  label,
  value,
  own,
  valid,
  onChange,
  onInvalid,
  placeholder,
  className,
}: {
  label: string;
  value: number | undefined;
  own: boolean;
  valid: (value: number) => boolean;
  onChange: (value: number) => void;
  onInvalid: () => void;
  placeholder?: string;
  className?: string;
}) {
  const locale = useLocale();
  const shown = value === undefined ? "" : formatNumber(locale, value);
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
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      className={cn(
        "h-9 tabular-nums pointer-coarse:h-11",
        !own && "text-muted-foreground",
        className,
      )}
    />
  );
}

/**
 * A color: a preset, an exact or per-theme color, or null (the theme's text
 * color, or, with `noneLabel`, a part turned off). `value` undefined: the
 * preset's design draws it, named `presetLabel`.
 */
export function ColorField({
  label,
  value,
  own,
  onChange,
  kind = "ink",
  noneLabel,
  presetLabel,
}: {
  label: string;
  value: ColorValue | null | undefined;
  own: boolean;
  onChange: (value: ColorValue | null) => void;
  kind?: ColorKind;
  noneLabel?: string;
  presetLabel?: string;
}) {
  const t = useT("editorLab").format;
  const [open, setOpen] = useState(false);
  const swatch = value === null || value === undefined ? null : renderColor(value, kind, "light");
  const named =
    value === undefined
      ? (presetLabel ?? "")
      : value === null
        ? (noneLabel ?? (kind === "ink" ? t.themeColor : t.noHighlight))
        : typeof value === "string" && value in t.colors
          ? t.colors[value as keyof typeof t.colors]
          : (swatch ?? "");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${label}: ${named}`}
        className={cn(
          "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-surface px-3 text-left shadow-card pointer-coarse:h-11",
          !own && "text-muted-foreground",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-4 shrink-0 rounded-full border",
            value === undefined &&
              "bg-[repeating-linear-gradient(45deg,var(--border)_0_2px,transparent_2px_4px)]",
          )}
          style={
            value === undefined
              ? undefined
              : {
                  background:
                    swatch ?? (kind === "ink" && !noneLabel ? "var(--foreground)" : "transparent"),
                }
          }
        />
        <span className="truncate">{named}</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)]">
        <ColorPicker
          kind={kind}
          value={value === undefined ? mixed : value}
          noneLabel={noneLabel}
          onPick={(next) => {
            setOpen(false);
            onChange(next);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
