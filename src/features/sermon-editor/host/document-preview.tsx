"use client";

import { Editor, type JSONContent } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { useLocale, useT } from "@/i18n/client";
import "@/features/editor-lab/v4/lab-v4.css";

/**
 * A whole sermon document, read only (A3): the recovered and the saved
 * versions in recovery, and the saved one while another tab edits. It is
 * the editor's own schema, extensions, and look (`labV4Extensions`), not a
 * second rendering, and it is never editable: it holds no session, saves
 * nothing, and its document is never the outline's. The page scrolls it; it
 * does not scroll inside itself. A document the editor refuses is said to be
 * unavailable, never shown empty.
 */
export function DocumentPreview({
  content,
  label,
  testId,
}: {
  content: JSONContent;
  label: string;
  testId?: string;
}) {
  const t = useT("editorLab");
  const unavailable = useT("sermonEditor").recovery.previewUnavailable;
  const locale = useLocale();
  const host = useRef<HTMLDivElement>(null);
  const [refused, setRefused] = useState(false);
  const labels = t.v4.components;

  useEffect(() => {
    if (!host.current) return;
    const editor = new Editor({
      element: host.current,
      editable: false,
      extensions: labV4Extensions({ locale, preset: "balanced", componentLabels: labels }),
      editorProps: {
        attributes: {
          class: "lab-editor",
          "aria-readonly": "true",
          "aria-label": label,
          role: "document",
        },
      },
    });
    const loaded = loadV4(editor, content, `preview:${testId ?? "document"}`);
    // A passage shows its verses, as the full document does.
    if (loaded.ok) editor.commands.setPassagesExpanded(true);
    setRefused(!loaded.ok);
    return () => editor.destroy();
  }, [content, label, labels, locale, testId]);

  return (
    <div
      data-testid={testId}
      data-refused={refused ? "true" : undefined}
      className="rounded-lg border bg-surface"
    >
      {refused && <p className="p-4 text-sm text-muted-foreground">{unavailable}</p>}
      <div ref={host} className="lab-surface" hidden={refused} />
    </div>
  );
}
