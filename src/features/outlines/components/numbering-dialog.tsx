"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/client";
import { useMediaQuery, wideEnough } from "@/lib/use-media-query";
import { entryLabel, numberingConfigSchema, type NumberingConfig } from "../numbering";
import { CustomLevels, NumberingStyleChoice } from "./numbering-fields";

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
        <NumberingStyleChoice uid={uid} draft={draft} onChange={setDraft} />

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
