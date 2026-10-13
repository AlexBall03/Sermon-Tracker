"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { createOutline, type OutlineActionResult } from "../actions";

/**
 * Makes a sermon's outline and opens it. The outline's ID is made here, once,
 * so pressing twice or trying again after a lost answer makes one outline; a
 * sermon that turns out to have one already is opened all the same.
 */
export function CreateOutlineButton({ sermonId }: { sermonId: string }) {
  const t = useT("outlines").create;
  const offline = useT("common").offline;
  const router = useRouter();
  const [id] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function create() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    const outcome = await createOutline(sermonId, id).catch((): OutlineActionResult => ({
      ok: false,
      message: offline,
    }));
    if (outcome.outlineId) {
      router.replace(`${routes.outlines}/${outcome.outlineId}`);
      return;
    }
    setBusy(false);
    setResult(outcome);
  }

  return (
    <div className="mt-6">
      <Button type="button" disabled={busy} aria-busy={busy} onClick={() => void create()}>
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
        {busy ? t.creating : t.action}
      </Button>
      <ActionStatus result={result} />
    </div>
  );
}
