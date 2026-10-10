"use client";

import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ActionResult } from "../actions";

export type Confirmation = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<ActionResult>;
};

type ConfirmDialogProps = {
  confirmation: Confirmation | null;
  busy: boolean;
  onConfirm: (confirmation: Confirmation) => void;
  onCancel: () => void;
};

/** One confirmation dialog shared by a table's consequential actions. */
export function ConfirmDialog({ confirmation, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <AlertDialog open={confirmation !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmation?.destructive ? "destructive" : "default"}
            disabled={busy}
            aria-busy={busy}
            onClick={() => confirmation && onConfirm(confirmation)}
          >
            {busy && <LoaderCircle className="animate-spin" aria-hidden />}
            {busy ? "Working…" : confirmation?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Announces the result of the last action to everyone, including screen
 * readers. The icon means success and failure do not differ by colour alone.
 */
export function ActionStatus({ result }: { result: ActionResult | null }) {
  const Icon = result?.ok ? CircleCheck : CircleAlert;
  return (
    <p
      role="status"
      aria-live="polite"
      className={
        result
          ? `mt-3 flex animate-menu items-start gap-2 text-sm font-medium ${result.ok ? "text-primary" : "text-destructive"}`
          : "sr-only"
      }
    >
      {result && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {result?.message}
    </p>
  );
}
