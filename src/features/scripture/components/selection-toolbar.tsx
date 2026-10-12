"use client";

import { ClipboardCopy, Link2, Quote, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale, useT } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
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
   * Further actions on the selection, placed after the copies: a highlight,
   * a favorite, and an idea. Each acts on the same `references`. Six words
   * fit one line of the reading column only just, so a word added here must
   * be short, and the width below at which words give way to icons goes up with it.
   */
  children?: React.ReactNode;
  /** A quiet line beneath the buttons, for something the selection is already part of. */
  footer?: React.ReactNode;
  /** The language the books are named in: that of the text selected from. The interface's when omitted. */
  language?: Locale;
  className?: string;
};

/**
 * A toolbar button: its word beside its icon where the toolbar has room for
 * every word, and the icon alone, still named, where it has not. The room is
 * the toolbar's own width, not the window's: beside an open sidebar a wide
 * window can leave it less than a phone does. Actions added as `children`
 * use the same two classes.
 */
export const toolbarAction = "px-2.5 @max-[41.5rem]:size-10 @max-[41.5rem]:px-0";
export const toolbarLabel = "@max-[41.5rem]:sr-only";
const action = toolbarAction;
const label = toolbarLabel;

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
  footer,
  language,
  className,
}: SelectionToolbarProps) {
  const t = useT("scripture").toolbar;
  const locale = useLocale();
  if (references.length === 0) return null;
  const selected = formatReferences(references, language ?? locale);
  // Said on the one button the keyboard's copy stands for.
  const keys = (kind: CopyKind) =>
    kind === shortcut
      ? ({ "aria-keyshortcuts": "Control+C Meta+C", title: t.copyKeys } as const)
      : {};

  return (
    <div
      role="toolbar"
      aria-label={t.label}
      data-selection-toolbar
      className={cn(
        "@container animate-menu rounded-xl glass-float px-2 py-2 [--float:color-mix(in_oklab,var(--surface-raised)_94%,transparent)]",
        className,
      )}
    >
      {/* The passage has a line to itself, so it is read whole; what can be done with it is beneath. */}
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
          size="icon"
          className="@max-[41.5rem]:size-10"
          aria-label={t.clear}
          onClick={onClear}
        >
          <X aria-hidden />
        </Button>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={action}
          onClick={onCopyText}
          {...keys("text")}
        >
          <ClipboardCopy aria-hidden />
          <span className={label}>{t.copyText}</span>
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
          <span className={label}>{t.copyReference}</span>
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
          <span className={label}>{t.copyLink}</span>
        </Button>
        {/* Copying is one thing and keeping another: a hairline between them. */}
        {children && <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />}
        {children}
      </div>
      {footer}
      {problem && (
        <p role="alert" className="px-2 pt-1.5 text-[0.8125rem] font-medium text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
}
