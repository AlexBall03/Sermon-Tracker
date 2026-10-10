import { CircleAlert, CircleCheck } from "lucide-react";

import type { ActionResult } from "@/lib/action-result";

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
