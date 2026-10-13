"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/client";
import { useMediaQuery, wideEnough } from "@/lib/use-media-query";
import {
  bullets,
  counterStyles,
  letterCases,
  numberingLimits,
  numberingPresetIds,
  overflowRules,
  type CounterStyle,
  type OverflowRule,
} from "../model";
import {
  entryLabel,
  numberingConfigSchema,
  resolveNumbering,
  type CustomNumbering,
  type LevelFormat,
  type NumberingConfig,
} from "../numbering";

type NumberingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How the outline is numbered now. */
  value: NumberingConfig;
  /** A style that has been checked, to number the outline with. */
  onApply: (numbering: NumberingConfig) => void;
};

/**
 * Chooses how an outline is numbered: one of the built-in styles, or a custom
 * one written level by level. Nothing changes until Apply; until then the
 * choice is a draft, shown on a sample outline with the same `entryLabel` the
 * outline itself is numbered by.
 */
export function NumberingDialog({ open, onOpenChange, value, onApply }: NumberingDialogProps) {
  const wide = useMediaQuery(wideEnough);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent placement={wide ? "side" : "full"}>
        {/* Mounted with the dialog, so each opening starts from the outline's own style. */}
        <NumberingForm
          value={value}
          onApply={(numbering) => {
            onApply(numbering);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Where the sample outline's entries are: enough to show four levels, siblings, and a second main point. */
const samplePaths: number[][] = [
  [1],
  [1, 1],
  [1, 1, 1],
  [1, 1, 1, 1],
  [1, 1, 2],
  [1, 2],
  [2],
  [2, 1],
];

/** One of each level, for the line under a style's name. */
const glancePaths = [[1], [1, 1], [1, 1, 1], [1, 1, 1, 1]];

const counts = (counter: CounterStyle) => counter !== "bullet" && counter !== "none";

function asCustom(config: NumberingConfig): CustomNumbering {
  const resolved = resolveNumbering(config);
  return {
    version: 1,
    preset: "custom",
    levels: resolved.levels.map((level) => ({ ...level })),
    overflow: resolved.overflow,
    repeatFrom: resolved.repeatFrom,
  };
}

function NumberingForm({
  value,
  onApply,
  onCancel,
}: {
  value: NumberingConfig;
  onApply: (numbering: NumberingConfig) => void;
  onCancel: () => void;
}) {
  const t = useT("outlines").numbering;
  const common = useT("common");
  const uid = useId();
  const [draft, setDraft] = useState<NumberingConfig>(value);

  const parsed = numberingConfigSchema.safeParse(draft);
  /** The fields a person can put right, by where they are: "levels.0.prefix". */
  const wrong = new Set(
    parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join(".")),
  );

  const glance = (config: NumberingConfig) =>
    glancePaths
      .map((path) => entryLabel(config, path))
      .filter(Boolean)
      .join("  ");

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed.success) onApply(parsed.data);
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription className="mt-1 text-pretty">{t.description}</DialogDescription>
        </div>
        <DialogClose label={t.close} className="-mr-2" />
      </div>

      <div className="min-h-0 flex-1 scroll-quiet overflow-y-auto px-5 pb-5">
        <fieldset>
          <legend className="text-sm font-semibold">{t.style}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[...numberingPresetIds, "custom" as const].map((preset) => {
              const sample =
                preset === "custom" ? t.customHint : glance({ version: 1, preset }) || t.noNumbers;
              return (
                <label key={preset} className="min-w-0">
                  <input
                    type="radio"
                    name={`${uid}-preset`}
                    value={preset}
                    checked={draft.preset === preset}
                    onChange={() =>
                      setDraft(preset === "custom" ? asCustom(draft) : { version: 1, preset })
                    }
                    className="peer sr-only"
                  />
                  <span className="flex h-full min-h-14 cursor-pointer flex-col justify-center rounded-lg border bg-surface px-3 py-2 transition-[border-color,background-color] duration-150 peer-checked:cursor-default peer-checked:border-primary peer-checked:bg-primary-soft peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 not-peer-checked:hover:border-foreground/30 not-peer-checked:active:bg-foreground/5">
                    <span className="text-sm font-semibold">{t.presets[preset]}</span>
                    <span className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground tabular-nums">
                      {sample}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {draft.preset === "custom" && (
          <CustomLevels uid={uid} draft={draft} wrong={wrong} onChange={setDraft} />
        )}

        <section aria-label={t.preview} className="mt-6">
          <h3 className="text-sm font-semibold">{t.preview}</h3>
          <ul className="mt-2 space-y-1 rounded-lg border bg-surface px-3 py-3">
            {samplePaths.map((path) => {
              const label = entryLabel(draft, path);
              return (
                <li
                  key={path.join(".")}
                  className="flex items-baseline gap-2 text-sm"
                  style={{ paddingLeft: `${(path.length - 1) * 1.125}rem` }}
                >
                  {/* Whatever was typed around a number is text here and nothing else. */}
                  {label && <span className="shrink-0 font-medium tabular-nums">{label}</span>}
                  <span className="min-w-0 truncate font-serif text-muted-foreground">
                    {t.sample[Math.min(path.length, t.sample.length) - 1]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="shrink-0 border-t px-5 py-3">
        {!parsed.success && (
          <p role="alert" className="mb-2 text-[0.8125rem] font-medium text-destructive">
            {[...wrong].some((path) => /\.(prefix|suffix|separator)$/.test(path))
              ? t.custom.invalidText
              : t.custom.invalid}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {common.cancel}
          </Button>
          <Button type="submit" disabled={!parsed.success}>
            {t.apply}
          </Button>
        </div>
      </div>
    </form>
  );
}

const caption = "mb-1.5 block text-[0.8125rem] font-medium text-muted-foreground";

function CustomLevels({
  uid,
  draft,
  wrong,
  onChange,
}: {
  uid: string;
  draft: CustomNumbering;
  wrong: ReadonlySet<string>;
  onChange: (draft: CustomNumbering) => void;
}) {
  const t = useT("outlines").numbering.custom;
  const { levels } = draft;

  const setLevel = (index: number, change: Partial<LevelFormat>) =>
    onChange({
      ...draft,
      levels: levels.map((level, at) => (at === index ? { ...level, ...change } : level)),
    });

  const text = (index: number, field: "prefix" | "suffix" | "separator", label: string) => {
    const invalid = wrong.has(`levels.${index}.${field}`);
    return (
      <label className="min-w-0">
        <span className={caption}>{label}</span>
        <Input
          value={levels[index][field]}
          onChange={(event) => setLevel(index, { [field]: event.target.value })}
          maxLength={numberingLimits[field]}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={`${t.level(index + 1)}: ${label}`}
          aria-invalid={invalid ? true : undefined}
        />
      </label>
    );
  };

  return (
    <fieldset className="mt-6">
      <legend className="text-sm font-semibold">{t.levels}</legend>
      <ol className="mt-2 space-y-3">
        {levels.map((level, index) => (
          <li key={index} className="rounded-lg border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{t.level(index + 1)}</h4>
              {levels.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-my-1 -mr-1.5 text-muted-foreground"
                  aria-label={t.removeLevel(index + 1)}
                  onClick={() => {
                    const remaining = levels.filter((_, at) => at !== index);
                    onChange({
                      ...draft,
                      levels: remaining,
                      repeatFrom: Math.min(draft.repeatFrom, remaining.length - 1),
                    });
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <span className={caption}>{t.counter}</span>
                <Select
                  label={t.counterOf(index + 1)}
                  value={level.counter}
                  onChange={(counter) => setLevel(index, { counter: counter as CounterStyle })}
                  options={counterStyles.map((counter) => ({
                    value: counter,
                    label: t.counters[counter],
                  }))}
                  className="w-full"
                />
              </div>
              {(level.counter === "alpha" || level.counter === "roman") && (
                <Segmented
                  className="col-span-2 sm:col-span-1 [&>legend]:mb-1.5 [&>legend]:text-[0.8125rem] [&>legend]:leading-normal [&>legend]:text-muted-foreground"
                  label={t.letterCase}
                  name={`${uid}-case-${index}`}
                  options={letterCases.map((letterCase) => ({
                    value: letterCase,
                    label: t.cases[letterCase],
                  }))}
                  value={level.case}
                  onChange={(letterCase) => setLevel(index, { case: letterCase })}
                />
              )}
              {level.counter === "bullet" && (
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <span className={caption}>{t.bullet}</span>
                  <Select
                    label={t.bulletOf(index + 1)}
                    value={level.bullet}
                    onChange={(bullet) =>
                      setLevel(index, { bullet: bullet as (typeof bullets)[number] })
                    }
                    options={bullets.map((bullet) => ({ value: bullet, label: bullet }))}
                    className="w-full"
                  />
                </div>
              )}
              {level.counter !== "none" && (
                <>
                  {text(index, "prefix", t.prefix)}
                  {text(index, "suffix", t.suffix)}
                </>
              )}
              {counts(level.counter) && index > 0 && (
                <>
                  <Switch
                    className="col-span-2"
                    label={t.composite}
                    description={t.compositeHint}
                    checked={level.composite}
                    onChange={(composite) => setLevel(index, { composite })}
                  />
                  {level.composite && text(index, "separator", t.separator)}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        disabled={levels.length >= numberingLimits.levels}
        onClick={() =>
          onChange({ ...draft, levels: [...levels, { ...levels[levels.length - 1] }] })
        }
      >
        <Plus aria-hidden />
        {t.addLevel}
      </Button>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <span className={caption}>{t.overflow}</span>
          <Select
            label={t.overflow}
            value={draft.overflow}
            onChange={(overflow) => onChange({ ...draft, overflow: overflow as OverflowRule })}
            options={overflowRules.map((rule) => ({ value: rule, label: t.overflows[rule] }))}
            className="w-full"
          />
        </div>
        {draft.overflow === "repeat" && (
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <span className={caption}>{t.repeatFrom}</span>
            <Select
              label={t.repeatFrom}
              value={String(draft.repeatFrom)}
              onChange={(from) => onChange({ ...draft, repeatFrom: Number(from) })}
              options={levels.map((_, index) => ({
                value: String(index),
                label: t.level(index + 1),
              }))}
              className="w-full"
            />
          </div>
        )}
        <p className="col-span-2 text-[0.8125rem] text-muted-foreground">{t.overflowHint}</p>
      </div>
    </fieldset>
  );
}
