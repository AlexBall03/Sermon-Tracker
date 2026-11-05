"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";

/**
 * Asked when a new outline cannot start from the account's default because
 * that personal preset can no longer be read (A4.2C, only while conversion is
 * on). Nothing was made. Confirming creates this outline with built-in
 * Balanced, through the same `createOutline` and the same outline ID; it never
 * changes the account's default. Cancel creates nothing.
 */
export function UnreadableDefaultConfirm({
  open,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  busy: boolean;
  onConfirm: () => Promise<ActionResult>;
  onCancel: () => void;
}) {
  const t = useT("outlines").create;
  return (
    <ConfirmDialog
      confirmation={
        open
          ? {
              title: t.fallbackTitle,
              description: t.fallbackBody,
              confirmLabel: t.fallbackConfirm,
              run: onConfirm,
            }
          : null
      }
      busy={busy}
      onConfirm={(confirmation) => void confirmation.run()}
      onCancel={onCancel}
    />
  );
}
