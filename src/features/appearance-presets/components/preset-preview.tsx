"use client";

import { useMemo } from "react";

import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { readStyles } from "@/features/editor-lab/styles/resolve";
import { PreviewSurface, sampleOutline } from "@/features/sermon-editor/appearance/preview";
import { initialDocument } from "@/features/sermon-editor/persistence/initialization";
import { useT } from "@/i18n/client";

/** Only a name for the preview's own document: it is never stored. */
const previewOutlineId = "00000000-0000-4000-8000-000000000000";

/**
 * A saved preset drawn on the sample sermon (A4.2C): the same read-only
 * preview Outline Settings shows (`PreviewSurface`), given exactly the
 * document a new outline would start with from this snapshot
 * (`initialDocument`). Nothing is computed a second way.
 */
export function PresetPreview({
  snapshot,
  caption,
  className,
}: {
  snapshot: AppearanceSnapshot;
  caption: string;
  className?: string;
}) {
  const a = useT("editorLab").appearance;
  const content = useMemo(() => sampleOutline(a.sample), [a.sample]);
  const attrs = useMemo(() => {
    const made = initialDocument(
      { id: previewOutlineId, revision: 0, numbering: snapshot.numbering },
      { kind: "snapshot", snapshot },
    );
    return made.ok ? (made.content.attrs as Record<string, unknown>) : null;
  }, [snapshot]);
  // Once per snapshot: the preview compares by identity and redraws only when this changes.
  const styles = useMemo(() => (attrs ? readStyles(attrs.styles) : null), [attrs]);
  if (!attrs) return null;
  return (
    <PreviewSurface
      attrs={attrs}
      styles={styles}
      layout={attrs.layout}
      content={content}
      caption={caption}
      className={className}
    />
  );
}
