"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { ColorField, NumberField } from "@/features/editor-lab/components/style-fields";
import type { ColorValue } from "@/features/editor-lab/styles/colors";
import { UNSET } from "@/features/editor-lab/styles/draft";
import {
  headerAlignments,
  headerFooterSchema,
  isFontSize,
  type HeaderFooter,
  type HeaderAlignment,
} from "@/features/editor-lab/styles/model";
import { newDocumentHeaderFooter } from "@/features/editor-lab/pagination/page-config";
import { useT } from "@/i18n/client";
import { ConflictLine } from "./controls";
import type { AppearanceSession } from "./session";

/*
 * Outline Settings → Header & Footer (A4.3, UI.2C): where the sermon's title
 * sits on the first page, the header on the pages after it, and the page
 * numbers.
 *
 * It edits the same session as Appearance and Numbering:
 *   - the page's header and footer are one edit (`{ layer: "page" }`), the
 *     whole setting, previewed as view state on the outline's pages and in
 *     the preview, written only by Apply, in the one transaction with
 *     everything else pending, as a version 2 page;
 *   - the header's size and color are the outline's existing running-header
 *     style (`styles.runningHeader`), through the same draft.
 * The title's words are typed on the page itself, never here: they are the
 * sermon's own (`ideas.title`), saved with the sermon.
 */
export function HeaderFooterSettings({ session }: { session: AppearanceSession }) {
  const a = useT("editorLab").appearance;
  const words = a.headerFooter;
  const uid = useId();
  const drafted = session.draft.edits.get("page")?.value;
  const current =
    drafted !== undefined && drafted !== UNSET && headerFooterSchema.safeParse(drafted).success
      ? (drafted as HeaderFooter)
      : session.headerFooter;
  const conflict = session.conflictFor({ layer: "page" });
  const set = (change: (next: HeaderFooter) => void) => {
    const next = structuredClone(current);
    change(next);
    session.set({ layer: "page" }, next);
  };
  const alignments = headerAlignments.map((value) => ({ value, label: words.align[value] }));

  // The header's look: the outline's running-header style, drafted like any other style.
  const styleField = (field: "fontSize" | "color") => {
    const edit = session.draft.edits.get(`runningHeader|${field}`);
    if (edit) return edit.value === UNSET ? undefined : edit.value;
    return (session.stored?.runningHeader as Record<string, unknown> | undefined)?.[field];
  };
  const size = styleField("fontSize") as number | undefined;
  const color = styleField("color") as ColorValue | null | undefined;
  const styleConflict =
    session.conflictFor({ layer: "runningHeader", field: "fontSize" }) ??
    session.conflictFor({ layer: "runningHeader", field: "color" });

  return (
    <div className="flex min-w-0 flex-col gap-5" data-testid="header-footer-settings">
      <p className="text-xs text-muted-foreground">{words.hint}</p>

      <section className="flex flex-col gap-2" aria-labelledby={`${uid}-title`}>
        <h3 id={`${uid}-title`} className="text-sm font-semibold">
          {words.title}
        </h3>
        <Segmented<HeaderAlignment>
          label={words.titleAlign}
          name={`${uid}-title-align`}
          value={current.header.titleAlign}
          onChange={(value) => set((next) => (next.header.titleAlign = value))}
          options={alignments}
        />
        <p className="text-xs text-muted-foreground">{words.titleHint}</p>
      </section>

      <section className="flex flex-col gap-2">
        <Switch
          label={words.runningHeader}
          description={words.runningHeaderHint}
          checked={current.runningHeader.enabled}
          onChange={(checked) => set((next) => (next.runningHeader.enabled = checked))}
        />
        {current.runningHeader.enabled && (
          <div className="flex flex-col gap-3 border-l-2 pl-3">
            <Switch
              label={words.runningSubtitle}
              checked={current.runningHeader.subtitle}
              onChange={(checked) => set((next) => (next.runningHeader.subtitle = checked))}
            />
            <div className="flex flex-wrap items-end gap-3">
              <NumberField
                label={words.runningSize}
                value={size}
                own={size !== undefined}
                placeholder="9"
                valid={(value) => isFontSize(value) && value >= 6 && value <= 18}
                onChange={(value) =>
                  session.set({ layer: "runningHeader", field: "fontSize" }, value)
                }
                onInvalid={() => session.setMessage("invalid")}
                className="w-28"
              />
              <ColorField
                label={words.runningColor}
                value={color}
                own={color !== undefined}
                onChange={(value) => session.set({ layer: "runningHeader", field: "color" }, value)}
              />
            </div>
            {styleConflict && <ConflictLine {...styleConflict} />}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <Switch
          label={words.pageNumbers}
          description={words.pageNumbersHint}
          checked={current.pageNumbers.enabled}
          onChange={(checked) => set((next) => (next.pageNumbers.enabled = checked))}
        />
        {current.pageNumbers.enabled && (
          <div className="flex flex-col gap-3 border-l-2 pl-3">
            <Segmented<HeaderAlignment>
              label={words.numberAlign}
              name={`${uid}-number-align`}
              value={current.pageNumbers.align}
              onChange={(value) => set((next) => (next.pageNumbers.align = value))}
              options={alignments}
            />
            <Switch
              label={words.numberBold}
              checked={current.pageNumbers.weight === "bold"}
              onChange={(checked) =>
                set((next) => (next.pageNumbers.weight = checked ? "bold" : "normal"))
              }
            />
          </div>
        )}
      </section>

      {conflict && <ConflictLine {...conflict} />}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => session.set({ layer: "page" }, structuredClone(newDocumentHeaderFooter))}
        >
          {words.useDefaults}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{words.previewHint}</p>
    </div>
  );
}
