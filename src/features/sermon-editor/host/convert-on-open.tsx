"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { listMutations } from "@/features/offline/queue";
import { useT } from "@/i18n/client";
import { convertOutlineDocument } from "../persistence/actions";
import { Frame, OutlineDocumentHost, type OutlineHostSermon } from "./outline-document-host";
import { Notice } from "./recovery-view";

/*
 * An outline with no sermon document, opened while conversion is on (A3):
 * it is converted here, once the page is in the browser, by the existing
 * `convertOutlineDocument` action, and then opened in the sermon editor.
 * Converting is a write, so it never runs while the server renders the page
 * (a prefetch must never convert). The document is made on the server from
 * the outline's own entries; nothing from this page becomes its content.
 *
 * It is never a blank document: a conversion that would change the outline
 * (`unsafe`), or make it too large, leaves it in the outline editor
 * (`legacy`), and one that did not happen says so and offers to try again.
 * While this device still has legacy changes to the outline queued, it is not
 * converted (they would become conflicts): it opens in the outline editor,
 * which sends them, and is converted on a later opening.
 */

type Phase =
  | { kind: "checking" }
  | { kind: "document" }
  | { kind: "legacy"; reason: "queued" | "unsafe" | "too_large" | "disabled" }
  | { kind: "failed"; message: string };

export function ConvertOnOpen({
  owner,
  clerkUserId,
  outlineId,
  sermon,
  legacy,
}: {
  owner: string;
  clerkUserId: string;
  outlineId: string;
  sermon: OutlineHostSermon;
  /** The outline editor, as the page would show it without conversion. */
  legacy: React.ReactNode;
}) {
  const t = useT("sermonEditor").opening;
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const asked = useRef(false);

  const open = useCallback(async () => {
    setPhase({ kind: "checking" });
    let queued: boolean;
    try {
      queued = (await listMutations(owner, { entityId: outlineId })).length > 0;
    } catch {
      // The device could not say: never convert over work it might hold.
      queued = true;
    }
    if (queued) return setPhase({ kind: "legacy", reason: "queued" });
    let result: Awaited<ReturnType<typeof convertOutlineDocument>>;
    try {
      result = await convertOutlineDocument(outlineId);
    } catch {
      return setPhase({ kind: "failed", message: t.convertFailed });
    }
    if (result.ok || result.code === "exists" || result.code === "unreadable") {
      // Converted, converted already, or a document this version can't read: the host shows which.
      return setPhase({ kind: "document" });
    }
    if (result.code === "unsafe" || result.code === "too_large" || result.code === "disabled") {
      return setPhase({ kind: "legacy", reason: result.code });
    }
    setPhase({ kind: "failed", message: result.message || t.convertFailed });
  }, [outlineId, owner, t.convertFailed]);

  useEffect(() => {
    // Once per mount (Strict Mode runs effects twice; asking twice would answer `exists`).
    if (asked.current) return;
    asked.current = true;
    void open();
  }, [open]);

  if (phase.kind === "document") {
    return (
      <OutlineDocumentHost
        owner={owner}
        clerkUserId={clerkUserId}
        outlineId={outlineId}
        sermon={sermon}
      />
    );
  }
  if (phase.kind === "legacy") {
    const note =
      phase.reason === "queued"
        ? t.queued
        : phase.reason === "unsafe"
          ? t.stayedLegacy
          : phase.reason === "too_large"
            ? t.stayedTooLarge
            : null;
    return (
      <>
        {note && (
          <div className="container-page pt-6" data-testid="outline-stays-legacy">
            <Notice tone="info" text={note} />
          </div>
        )}
        {legacy}
      </>
    );
  }
  return (
    <Frame sermon={sermon}>
      {phase.kind === "failed" ? (
        <div className="mt-6">
          <Notice tone="danger" text={phase.message}>
            <Button variant="outline" onClick={() => void open()} data-testid="convert-retry">
              <RotateCcw aria-hidden />
              {t.retry}
            </Button>
          </Notice>
        </div>
      ) : (
        <p
          role="status"
          data-testid="outline-converting"
          className="mt-6 text-sm text-muted-foreground"
        >
          {t.converting}
        </p>
      )}
    </Frame>
  );
}
