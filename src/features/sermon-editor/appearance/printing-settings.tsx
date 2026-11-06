"use client";

import { Check, Printer } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useT } from "@/i18n/client";
import { printColorModes, storePrintColor, type PrintColorMode } from "../presentation/preferences";
import { useDefaultPrintColor } from "../presentation/use-presentation";
import type { AppearanceSession } from "./session";

/*
 * Outline Settings → Printing (A4.4): how this device prints sermons. Not the
 * outline's and not appearance: nothing here enters the session's draft, is
 * applied, or reaches the document, its history, or a save (the window's
 * Apply and Cancel are still the other categories'). Two explicit actions:
 *
 * - "Print": this sermon, once, in the colors chosen here (`printWith`, by
 *   way of the window, which closes first); the default stays as it is.
 * - "Use as default on this device": the remembered default
 *   (`storePrintColor`), which every other print uses (Ctrl+P, the browser's
 *   menu).
 *
 * The chosen mode is shown in the preview beside this, drawn by the print
 * rules themselves (`AppearancePreview printColor`). Printing waits while
 * appearance changes are pending, so what prints is the outline as it is.
 */
export function PrintingSettings({
  session,
  mode,
  onMode,
  onPrint,
}: {
  session: AppearanceSession;
  /** The colors chosen here: a print's, until made the default. */
  mode: PrintColorMode;
  onMode: (mode: PrintColorMode) => void;
  /** Closes the window and prints once in `mode`; absent where nothing prints (a test, a preview). */
  onPrint?: (mode: PrintColorMode) => void;
}) {
  const p = useT("editorLab").appearance.printing;
  const name = useId();
  const ids = useId();
  const saved = useDefaultPrintColor();
  const [told, setTold] = useState<PrintColorMode | null>(null);
  const pending = session.dirty;
  return (
    <div className="flex flex-col gap-4" data-testid="printing-settings">
      <p className="text-sm text-muted-foreground">{p.hint}</p>
      <div>
        <Segmented
          label={p.colorMode}
          name={name}
          value={mode}
          onChange={(next) => {
            setTold(null);
            onMode(next);
          }}
          options={printColorModes.map((value) => ({ value, label: p.modes[value] }))}
        />
        <p id={`${ids}-mode`} className="mt-1.5 text-xs text-muted-foreground">
          {p.modeHints[mode]}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          className="self-start"
          disabled={pending || !onPrint}
          aria-describedby={`${ids}-print`}
          data-testid="printing-print"
          onClick={() => onPrint?.(mode)}
        >
          <Printer aria-hidden /> {p.print}
        </Button>
        <p id={`${ids}-print`} className="text-xs text-muted-foreground">
          {pending ? p.pendingFirst : p.printHint}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 border-t pt-4">
        <p className="text-sm" data-testid="printing-default">
          {p.defaultIs(p.modes[saved])}
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={mode === saved}
          data-testid="printing-make-default"
          onClick={() => {
            storePrintColor(mode);
            setTold(mode);
          }}
        >
          <Check aria-hidden /> {p.makeDefault}
        </Button>
        <p role="status" className="text-xs text-muted-foreground">
          {told !== null && told === saved ? p.madeDefault(p.modes[told]) : ""}
        </p>
        <p className="text-xs text-muted-foreground">{p.shortcutHint}</p>
      </div>
    </div>
  );
}
