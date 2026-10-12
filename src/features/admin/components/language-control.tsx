"use client";

import { useState, useTransition } from "react";

import { ActionStatus } from "@/components/ui/action-status";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { Segmented } from "@/components/ui/segmented";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { setSpanishEnabled } from "../actions";

/**
 * The administrator's switch for Spanish: the Spanish interface and the
 * Spanish Bible together, on or off for every account at once. It only asks
 * the server; the server decides, and every request reads what it decided, so
 * it takes effect at once and with no deployment. Turning it off is asked
 * about first, because everyone feels it. Nothing anyone saved is deleted
 * either way.
 */
export function LanguageControl({ spanishEnabled }: { spanishEnabled: boolean }) {
  const t = useT("admin").language;
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, startTransition] = useTransition();

  function apply(enabled: boolean) {
    startTransition(async () => {
      setResult(await setSpanishEnabled(enabled).catch(() => ({ ok: false, message: t.offline })));
      setConfirmation(null);
    });
  }

  function choose(value: "on" | "off") {
    if ((value === "on") === spanishEnabled) return;
    setResult(null);
    if (value === "on") return apply(true);
    setConfirmation({
      title: t.turnOffTitle,
      description: t.turnOffDescription,
      confirmLabel: t.turnOffConfirm,
      destructive: true,
      run: () => setSpanishEnabled(false),
    });
  }

  return (
    <div className="mt-4 max-w-2xl rounded-xl border bg-surface p-4 shadow-card sm:p-5">
      <Segmented
        label={t.label}
        name="spanish-enabled"
        options={[
          { value: "on", label: t.on },
          { value: "off", label: t.off },
        ]}
        // What the server holds: the control moves when the server has answered.
        value={spanishEnabled ? "on" : "off"}
        onChange={choose}
        disabled={busy}
        className="max-w-xs"
      />
      <p
        data-spanish={spanishEnabled ? "on" : "off"}
        className="mt-3 text-sm leading-relaxed text-muted-foreground"
      >
        {spanishEnabled ? t.onDetail : t.offDetail}
      </p>
      <ActionStatus result={result} />
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onConfirm={() => apply(false)}
        onCancel={() => !busy && setConfirmation(null)}
      />
    </div>
  );
}
