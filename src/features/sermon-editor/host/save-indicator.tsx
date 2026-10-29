"use client";

import { Check, CloudOff, HardDrive, LoaderCircle, TriangleAlert } from "lucide-react";

import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { SaveAction, SaveView } from "./save-status";

/**
 * The save indicator (A3): one short line beside the sermon's title, read
 * out politely when it changes, with the one action that applies, if any.
 * It says only what `describeSave` says; "Saved" only when the server
 * confirmed the current content.
 */
export function SaveIndicator({
  view,
  onAction,
}: {
  view: SaveView;
  onAction: (action: SaveAction) => void;
}) {
  const editorT = useT("sermonEditor");
  const t = editorT.save;
  const Icon =
    view.tone === "busy"
      ? LoaderCircle
      : view.label === "saved"
        ? Check
        : view.label === "offline"
          ? CloudOff
          : view.tone === "attention" || view.tone === "danger"
            ? TriangleAlert
            : HardDrive;
  const actionLabel =
    view.action === "review"
      ? t.review
      : view.action === "signIn"
        ? editorT.states.signIn
        : t.tryAgain;
  return (
    <span
      className="inline-flex min-w-0 items-center gap-2 text-sm"
      data-testid="save-status"
      data-status={view.status}
      data-label={view.label}
    >
      <span
        role="status"
        aria-label={`${t.label}: ${t[view.label]}`}
        className={cn(
          "inline-flex min-w-0 items-center gap-1.5",
          view.tone === "good" || view.tone === "quiet" || view.tone === "busy"
            ? "text-muted-foreground"
            : view.tone === "attention"
              ? "text-gold-ink"
              : "text-destructive",
        )}
      >
        <Icon
          className={cn("size-4 shrink-0", view.tone === "busy" && "animate-spin")}
          aria-hidden
        />
        <span className="truncate">{t[view.label]}</span>
      </span>
      {view.action && (
        <button
          type="button"
          data-testid="save-action"
          className="shrink-0 rounded-sm text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
          onClick={() => onAction(view.action!)}
        >
          {actionLabel}
        </button>
      )}
    </span>
  );
}
