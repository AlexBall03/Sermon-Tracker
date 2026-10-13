"use client";

import { Check, CircleAlert, CircleDashed, LoaderCircle, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import type { SaveStatus as Status } from "../editor/store";

const icons = {
  saved: Check,
  saving: LoaderCircle,
  unsaved: CircleDashed,
  failed: CircleAlert,
  conflict: TriangleAlert,
} as const;

/**
 * Whether the outline is saved, said in words with an icon beside them and
 * announced as it changes. A failure says why and offers to try again; it is
 * never shown as saved.
 */
export function SaveStatus({
  status,
  problem,
  onRetry,
}: {
  status: Status;
  problem: string | null;
  onRetry: () => void;
}) {
  const t = useT("outlines").editor;
  const Icon = icons[status];
  const wrong = status === "failed" || status === "conflict";
  return (
    <div className="flex min-w-0 flex-1 basis-56 flex-wrap items-center gap-x-3 gap-y-1">
      <p
        role="status"
        aria-live="polite"
        data-status={status}
        className={`flex min-w-0 items-center gap-1.5 text-sm font-medium ${wrong ? "text-destructive" : "text-muted-foreground"}`}
      >
        <Icon
          className={`size-4 shrink-0 ${status === "saving" ? "animate-spin" : ""}`}
          aria-hidden
        />
        <span>{t.status[status]}</span>
        {status === "failed" && problem && (
          <span className="font-normal text-foreground">{problem}</span>
        )}
      </p>
      {status === "failed" && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t.retry}
        </Button>
      )}
    </div>
  );
}
