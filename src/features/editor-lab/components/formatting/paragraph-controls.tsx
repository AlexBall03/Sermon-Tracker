"use client";

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ChevronDown,
  UnfoldVertical,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatNumber } from "@/i18n";
import { useLocale, useT } from "@/i18n/client";
import {
  setAlignment,
  setParagraphFormat,
  type Alignment,
  type ParagraphFormat,
} from "../../formatting-commands";
import { mixed, type BlockState } from "../../formatting-state";
import { Tool } from "../toolbar";
import type { useKeptSelection } from "./keep-selection";

/*
 * Paragraph formatting (PS-1B.2B.2B): alignment as four buttons, and line
 * and paragraph spacing in one popover. Each applies to every selected
 * paragraph and heading, as one change; in a title they rest.
 */

type Keeper = ReturnType<typeof useKeptSelection>;

const alignIcons = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
};

export function AlignButtons({ state, keeper }: { state: BlockState; keeper: Keeper }) {
  const t = useT("editorLab").format;
  return (
    <>
      {(Object.keys(alignIcons) as Alignment[]).map((align) => (
        <Tool
          key={align}
          label={t.align[align]}
          icon={alignIcons[align]}
          disabled={!state.paragraph}
          pressed={state.align === align}
          onPress={() => keeper.apply(setAlignment(align))}
        />
      ))}
    </>
  );
}

const lineSpacings = [
  { value: 1, key: "single" },
  { value: 1.15, key: "1.15" },
  { value: 1.5, key: "1.5" },
  { value: 2, key: "double" },
] as const;

type NumberKey = Exclude<keyof ParagraphFormat, "lineHeight">;
const numberLimits: Record<NumberKey, { min: number; max: number }> = {
  spaceBefore: { min: 0, max: 72 },
  spaceAfter: { min: 0, max: 72 },
  indentLeft: { min: 0, max: 432 },
  indentFirst: { min: -144, max: 144 },
};

/** One spacing field in points: applied when it is left or Enter is pressed, never per keystroke. */
function PointsField({
  name,
  label,
  value,
  onCommit,
}: {
  name: NumberKey;
  label: string;
  value: number | typeof mixed | null;
  onCommit: (value: number) => void;
}) {
  const locale = useLocale();
  const shown = typeof value === "number" ? formatNumber(locale, value) : "";
  // What is typed, only while it is being typed; otherwise the field shows the selection's value.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const number = Number(draft.replace(",", ".").trim());
    const { min, max } = numberLimits[name];
    if (draft.trim() === "" || !Number.isFinite(number) || number < min || number > max) return;
    if (number !== value) onCommit(Math.round(number * 2) / 2);
  };
  const id = `lab-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        value={draft ?? shown}
        placeholder={value === mixed ? "–" : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        className="h-9 tabular-nums"
      />
    </div>
  );
}

export function SpacingControl({ state, keeper }: { state: BlockState; keeper: Keeper }) {
  const t = useT("editorLab").format;
  const [open, setOpen] = useState(false);
  // Changes made here keep the popover open: the selection is put back for each one, and focus stays.
  const change = (patch: Partial<Record<keyof ParagraphFormat, number | undefined>>) => {
    keeper.apply(setParagraphFormat(patch), { focus: false });
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) keeper.remember();
        setOpen(next);
      }}
    >
      <PopoverTrigger
        aria-label={t.spacing}
        title={t.spacing}
        disabled={!state.paragraph}
        onPointerDown={keeper.remember}
        className="inline-flex h-9 items-center gap-0.5 rounded-md px-1.5 hover:bg-accent disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-accent"
      >
        <UnfoldVertical className="size-4" aria-hidden />
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72" finalFocus={keeper.finalFocus} data-testid="lab-spacing">
        <div className="flex flex-col gap-3 text-sm">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs font-medium">{t.lineSpacing}</legend>
            <div className="grid grid-cols-4 gap-1">
              {lineSpacings.map(({ value, key }) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={state.lineHeight === value ? "default" : "outline"}
                  aria-pressed={state.lineHeight === value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => change({ lineHeight: value })}
                >
                  {t.lineSpacings[key]}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <PointsField
              name="spaceBefore"
              label={t.spaceBefore}
              value={state.spaceBefore}
              onCommit={(value) => change({ spaceBefore: value })}
            />
            <PointsField
              name="spaceAfter"
              label={t.spaceAfter}
              value={state.spaceAfter}
              onCommit={(value) => change({ spaceAfter: value })}
            />
            <PointsField
              name="indentLeft"
              label={t.indentLeft}
              value={state.indentLeft}
              onCommit={(value) => change({ indentLeft: value })}
            />
            <PointsField
              name="indentFirst"
              label={t.indentFirst}
              value={state.indentFirst}
              onCommit={(value) => change({ indentFirst: value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t.indentFirstHint}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              change({
                lineHeight: undefined,
                spaceBefore: undefined,
                spaceAfter: undefined,
                indentLeft: undefined,
                indentFirst: undefined,
              })
            }
          >
            {t.useStyleSpacing}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
