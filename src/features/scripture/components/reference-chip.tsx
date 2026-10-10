"use client";

import { useState } from "react";
import { BookOpen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { useMediaQuery, wideEnough } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { countReferenceVerses, formatReference, type ScriptureReference } from "../reference";
import { Passage } from "./passage-text";
import { useScripture } from "./scripture-provider";

type ReferenceChipProps = {
  reference: ScriptureReference;
  /**
   * Given where the reference can be changed: the panel then offers to
   * replace it, with one passage or, when separate verses are chosen, several.
   */
  onChange?: (references: ScriptureReference[]) => void;
  onRemove?: () => void;
  className?: string;
};

/** A preview shows this many verses; "Read" opens the rest in the panel. */
const previewVerses = 6;

export const chipClass =
  "inline-flex h-8 max-w-full items-center rounded-md border bg-surface px-2.5 font-serif text-[0.875rem] leading-none font-medium whitespace-nowrap text-foreground italic shadow-card transition-[border-color,background-color] duration-150 hover:border-primary/70 active:bg-foreground/5 aria-expanded:border-ring pointer-coarse:h-10";

/**
 * A Scripture reference, wherever one appears. Clicking it always opens the
 * Quick Preview: a popover where there is room beside it, a sheet from the
 * foot of a narrow screen. "Read" carries the same passage into the panel.
 */
export function ReferenceChip({ reference, onChange, onRemove, className }: ReferenceChipProps) {
  const [open, setOpen] = useState(false);
  const wide = useMediaQuery(wideEnough);
  const scripture = useScripture();
  const label = formatReference(reference);

  const read = () => {
    setOpen(false);
    scripture.openPanel({
      reference,
      attach: onChange ? { label: "Update reference", onAttach: onChange } : undefined,
    });
  };

  const body = (
    <>
      <Passage reference={reference} limit={previewVerses} className="-mx-2 mt-3" />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={read}>
          <BookOpen aria-hidden />
          {onChange
            ? "Read or change"
            : countReferenceVerses(reference) > previewVerses
              ? "Read all"
              : "Read"}
        </Button>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            <Trash2 aria-hidden />
            Remove
          </Button>
        )}
      </div>
    </>
  );
  const heading = "font-display text-lg leading-snug font-semibold";
  const version = "text-xs text-muted-foreground";

  if (wide) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={`${label}: preview the passage`}
          className={cn(chipClass, className)}
        >
          <span className="truncate">{label}</span>
        </PopoverTrigger>
        <PopoverContent>
          <PopoverTitle className={heading}>{label}</PopoverTitle>
          <p className={version}>King James Version</p>
          {body}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={`${label}: preview the passage`}
        aria-haspopup="dialog"
        // Inside a surface that holds the panel itself, go straight there: no sheet over a sheet.
        onClick={() => (scripture.inline ? read() : setOpen(true))}
        className={cn(chipClass, className)}
      >
        <span className="truncate">{label}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent placement="bottom">
          <div className="overflow-y-auto overscroll-contain px-5 pt-4 pb-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-lg">{label}</DialogTitle>
                <DialogDescription className="text-xs">King James Version</DialogDescription>
              </div>
              <DialogClose label="Close preview" className="-mt-1 -mr-2" />
            </div>
            {body}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
