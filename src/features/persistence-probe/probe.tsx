"use client";

import type { JSONContent } from "@tiptap/core";
import { useEffect, useRef } from "react";

import {
  readOutlineDocument,
  saveOutlineDocument,
} from "@/features/sermon-editor/persistence/actions";
import { documentTransport } from "@/features/sermon-editor/persistence/autosave/transport";
import type {
  DocumentReadOutcome,
  DocumentSaveOutcome,
} from "@/features/sermon-editor/persistence/saving";
import { useT } from "@/i18n/client";
import { createProbeFixture, removeProbeFixture } from "./actions";

/**
 * What a test run may do through the probe: make its own fixture, save and
 * read that fixture's document, and remove it. No operation takes an outline
 * or a sermon ID, so nothing else can be named. `readByAction` is the Server
 * Action read the transport no longer uses, kept only as the control that
 * shows the browser's action queue is real.
 */
export type PersistenceProbe = {
  setup(): Promise<{ outlineId: string; revision: number } | null>;
  save(content: JSONContent, expectedRevision: number): Promise<DocumentSaveOutcome>;
  read(): Promise<DocumentReadOutcome>;
  readByAction(): Promise<{ ok: boolean; revision?: number }>;
  teardown(): Promise<boolean>;
};

declare global {
  interface Window {
    __persistenceProbe?: PersistenceProbe;
  }
}

/** The development-only persistence probe (A2.3B.2D): no editor, no autosave, nothing mounted. */
export function PersistenceProbeHarness() {
  const t = useT("editorLab").persistenceProbe;
  const marker = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const transport = documentTransport({ save: saveOutlineDocument });
    let fixture: { sermonId: string; outlineId: string } | null = null;
    const outline = () => {
      if (!fixture) throw new Error("No probe fixture: call setup() first.");
      return fixture.outlineId;
    };
    window.__persistenceProbe = {
      async setup() {
        if (fixture) return null;
        const made = await createProbeFixture();
        if (!made.ok) return null;
        fixture = { sermonId: made.sermonId, outlineId: made.outlineId };
        return { outlineId: made.outlineId, revision: made.revision };
      },
      save: (content, expectedRevision) =>
        transport.save({ outlineId: outline(), content, expectedRevision, sequence: 1 }),
      read: () => transport.read(outline()),
      async readByAction() {
        const result = await readOutlineDocument(outline());
        return { ok: result.ok, revision: result.revision };
      },
      async teardown() {
        if (!fixture) return false;
        const removed = await removeProbeFixture(fixture.sermonId);
        if (removed.ok) fixture = null;
        return removed.ok;
      },
    };
    const element = marker.current;
    element?.setAttribute("data-ready", "true");
    return () => {
      delete window.__persistenceProbe;
      element?.removeAttribute("data-ready");
    };
  }, []);

  return (
    <p ref={marker} data-testid="persistence-probe">
      {t.ready}
    </p>
  );
}
