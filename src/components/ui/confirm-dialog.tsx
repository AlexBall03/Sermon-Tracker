"use client";

import { LoaderCircle } from "lucide-react";

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
import type { ActionResult } from "@/lib/action-result";

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

/** One confirmation dialog shared by a view's consequential actions. */
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
