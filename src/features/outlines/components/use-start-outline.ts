"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { createOutline, type OutlineActionResult } from "../actions";
import { outlineHref } from "../outlines-query";

/**
 * Gives a sermon its outline and opens it, for the places where a sermon was
 * chosen for exactly that: the overview's picker, and a sermon captured to be
 * outlined. A sermon that already has an outline is opened all the same, so
 * choosing one never makes a second.
 *
 * The outline's ID is made here, once for each sermon, so asking twice or
 * again after a lost answer makes one outline; the table's UNIQUE (sermon_id)
 * stands behind it.
 */
export function useStartOutline() {
  const router = useRouter();
  const offline = useT("outlines").picker.offline;
  const ids = useRef(new Map<string, string>());
  /** The sermon whose outline is being made, while it is. */
  const [starting, setStarting] = useState<string | null>(null);
  const busy = useRef(false);

  const start = useCallback(
    async (sermonId: string): Promise<ActionResult> => {
      if (busy.current) return { ok: false, message: "" };
      busy.current = true;
      setStarting(sermonId);
      const id = ids.current.get(sermonId) ?? crypto.randomUUID();
      ids.current.set(sermonId, id);
      const outcome = await createOutline(sermonId, id).catch((): OutlineActionResult => ({
        ok: false,
        message: offline,
      }));
      busy.current = false;
      setStarting(null);
      // Made now, or there already: either way it is the sermon's outline.
      if (outcome.outlineId) {
        router.push(outlineHref(outcome.outlineId));
        return { ok: true, message: outcome.message };
      }
      return outcome;
    },
    [router, offline],
  );

  return { start, starting };
}
