"use client";

import { useId } from "react";

import {
  CustomLevels,
  NumberingStyleChoice,
  numberingProblems,
} from "@/features/outlines/components/numbering-fields";
import type { NumberingConfig } from "@/features/outlines/numbering";
import { UNSET } from "@/features/editor-lab/styles/draft";
import { useT } from "@/i18n/client";
import { ConflictLine } from "./controls";
import type { AppearanceSession } from "./session";

/*
 * Outline Settings → Numbering (A4.2A): what the outline's numbers say, with
 * the outline editor's own parts (`numbering-fields.tsx`: the built-in styles,
 * Custom, and the level editor) and the outline's own engine (`entryLabel`).
 *
 * It edits the same session as Appearance: one edit, the whole
 * configuration (`{ layer: "numbering" }`), previewed as view state in the
 * outline and the preview, written only by Apply in the one transaction with
 * every other pending change, and refused whole if it does not validate or
 * the outline's layout cannot be read (which is never replaced from here).
 * How the numbers look is Appearance's (Components and Levels).
 */
export function NumberingSettings({ session }: { session: AppearanceSession }) {
  const a = useT("editorLab").appearance;
  const uid = useId();
  const drafted = session.draft.edits.get("numbering")?.value;
  const current =
    drafted !== undefined && drafted !== UNSET ? (drafted as NumberingConfig) : session.numbering;
  const conflict = session.conflictFor({ layer: "numbering" });

  if (!session.layoutReadable) {
    return (
      <p role="status" className="text-sm text-muted-foreground" data-testid="numbering-unreadable">
        {a.numbering.unreadable}
      </p>
    );
  }

  const wrong = numberingProblems(current);
  const set = (next: NumberingConfig) => session.set({ layer: "numbering" }, next);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="numbering-settings">
      <p className="text-xs text-muted-foreground">{a.numbering.hint}</p>
      <NumberingStyleChoice uid={uid} draft={current} onChange={set} />
      {current.preset === "custom" && (
        <CustomLevels uid={uid} draft={current} wrong={wrong} onChange={set} />
      )}
      {wrong.size > 0 && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {a.numbering.invalid}
        </p>
      )}
      {conflict && <ConflictLine {...conflict} />}
      <p className="text-xs text-muted-foreground">{a.numbering.previewHint}</p>
    </div>
  );
}
