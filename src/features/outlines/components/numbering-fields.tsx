"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n/client";
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

/*
 * The parts of choosing an outline's numbering, shared (A4.2A) by the legacy
 * outline editor's `NumberingDialog` and the sermon editor's Outline
 * Settings → Numbering: the built-in styles and Custom, and a custom style
 * written level by level. Each only reports a new configuration; where it
 * goes (the dialog's own draft, or the Appearance session's) is the caller's.
 * Labels are always `entryLabel`'s, the outline's own engine.
 */

/** One of each level, for the line under a style's name. */
const glancePaths = [[1], [1, 1], [1, 1, 1], [1, 1, 1, 1]];

const counts = (counter: CounterStyle) => counter !== "bullet" && counter !== "none";

export function asCustom(config: NumberingConfig): CustomNumbering {
  const resolved = resolveNumbering(config);
  return {
    version: 1,
    preset: "custom",
    levels: resolved.levels.map((level) => ({ ...level })),
    overflow: resolved.overflow,
    repeatFrom: resolved.repeatFrom,
  };
}

/** The fields a person can put right, by where they are ("levels.0.prefix"), for a configuration that does not parse. */
export function numberingProblems(config: NumberingConfig): ReadonlySet<string> {
  const parsed = numberingConfigSchema.safeParse(config);
  return new Set(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join(".")));
}

/** The built-in styles and Custom, each with a glance at its labels. */
export function NumberingStyleChoice({
  uid,
  draft,
  onChange,
}: {
  uid: string;
  draft: NumberingConfig;
  onChange: (draft: NumberingConfig) => void;
}) {
  const t = useT("outlines").numbering;
  const glance = (config: NumberingConfig) =>
    glancePaths
      .map((path) => entryLabel(config, path))
      .filter(Boolean)
      .join("  ");
  const setDraft = onChange;
  return (
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
  );
}

const caption = "mb-1.5 block text-[0.8125rem] font-medium text-muted-foreground";

export function CustomLevels({
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
