import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { layoutParses, type OutlineLayout } from "@/features/editor-lab/layout";
import { applyPlan, type Draft } from "@/features/editor-lab/styles/draft";
import { userPresetIds, type DocumentStyles } from "@/features/editor-lab/styles/model";
import type { PresetId } from "@/features/editor-lab/styles/presets";
import { snapshotAppearance, type AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { prepareAppearance } from "./model";

/*
 * "Save as preset" and "Update preset" (A4.2C): the appearance the person is
 * previewing, pending edits included (owner's decision 1), taken as a
 * snapshot. Pure, and used in the browser only; the server prepares and
 * validates whatever it is sent again (`prepareAppearance`).
 *
 * The draft is checked exactly as Apply would check it (`applyPlan`, the
 * owner's correction): a conflict, an edit for a component that is gone, or
 * anything invalid refuses the capture. The styles and the numbering are then
 * taken from what that plan would leave, never from the committed state
 * where the draft changes it, so a pending numbering is never replaced by
 * the committed one. A refusal changes nothing: not the draft, not the
 * document.
 *
 * What is captured is only the snapshot contract: no sermon text, component
 * ID, single component's own appearance, running header, or view state.
 */

export type CaptureRefusal =
  "conflict" | "orphan" | "invalid" | "layout_unreadable" | "no_preset" | "too_large";

export type Capture =
  { ok: true; snapshot: AppearanceSnapshot } | { ok: false; reason: CaptureRefusal };

export function captureAppearance(
  draft: Draft,
  stored: DocumentStyles | null,
  doc: ProseMirrorNode,
  fallback: PresetId,
): Capture {
  const plan = applyPlan(draft, stored, doc);
  if (!plan.ok) return { ok: false, reason: plan.reason };

  const styles = plan.styles !== undefined ? plan.styles : stored;
  const layout = plan.layout ?? (doc.attrs.layout as unknown);
  if (!layoutParses(layout)) return { ok: false, reason: "layout_unreadable" };
  const numbering = (layout as OutlineLayout).numbering;

  const preset = styles?.preset ?? fallback;
  if (!userPresetIds.some((id) => id === preset)) return { ok: false, reason: "no_preset" };

  const snapshot = snapshotAppearance(styles, numbering, preset as (typeof userPresetIds)[number]);
  const prepared = prepareAppearance(snapshot);
  if (!prepared.ok)
    return { ok: false, reason: prepared.code === "too_large" ? "too_large" : "invalid" };
  return { ok: true, snapshot };
}
