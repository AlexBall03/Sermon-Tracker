"use client";

import { ClipboardCopy, Link2, Quote, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CopyKind } from "../copy-preference";
import { formatReferences, type ScriptureReference } from "../reference";

type SelectionToolbarProps = {
  /** What is selected, one reference for each unbroken passage. Nothing is shown for none. */
  references: readonly ScriptureReference[];
  onCopyText: () => void;
  onCopyReference: () => void;
  onCopyLink: () => void;
  onClear: () => void;
  /** The copy that Ctrl or Command with C makes, so its button can say so. */
  shortcut?: CopyKind;
  /** Why the last action failed, said here because it concerns these buttons. */
  problem?: string | null;
  /**
   * Further actions on the selection, placed before Clear. This is where a
   * later phase adds its own (a favourite, a highlight, an idea); each is
   * given the same `references`.
   */
  children?: React.ReactNode;
  className?: string;
};

const action = "px-2.5 max-sm:size-10 max-sm:px-0";
const label = "max-sm:sr-only";

/**
 * What can be done with the Scripture that is selected. It appears with a
 * selection and goes with it, names the selection in words, and floats over
 * the page, so the surface that shows it decides where it rests.
 */
export function SelectionToolbar({
  references,
  onCopyText,
  onCopyReference,
  onCopyLink,
  onClear,
  shortcut,
  problem,
  children,
  className,
}: SelectionToolbarProps) {
  if (references.length === 0) return null;
  const selected = formatReferences(references);
  // Said on the one button the keyboard's copy stands for.
  const keys = (kind: CopyKind) =>
    kind === shortcut
      ? ({ "aria-keyshortcuts": "Control+C Meta+C", title: "Ctrl+C, or Command+C" } as const)
      : {};

  return (
    <div
      role="toolbar"
      aria-label="Selected Scripture"
      data-selection-toolbar
      className={cn(
        "animate-menu rounded-xl glass-float px-2 py-2 [--float:color-mix(in_oklab,var(--surface-raised)_94%,transparent)]",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <p
          aria-live="polite"
          data-selection
          title={selected}
          className="min-w-0 flex-1 truncate px-2 font-serif text-base font-medium italic"
        >
          {selected}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={action}
          onClick={onCopyText}
          {...keys("text")}
        >
          <ClipboardCopy aria-hidden />
          <span className={label}>Copy text</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={action}
          onClick={onCopyReference}
          {...keys("reference")}
        >
          <Quote aria-hidden />
          <span className={label}>Copy reference</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={action}
          onClick={onCopyLink}
          {...keys("link")}
        >
          <Link2 aria-hidden />
          <span className={label}>Copy link</span>
        </Button>
        {children}
        <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="max-sm:size-10"
          aria-label="Clear selection"
          onClick={onClear}
        >
          <X aria-hidden />
        </Button>
      </div>
      {problem && (
        <p role="alert" className="px-2 pt-1.5 text-[0.8125rem] font-medium text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
}
