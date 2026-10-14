"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { applyUpdate, usePwa } from "../pwa";

/**
 * Says a new version of the application is waiting, at the foot of the
 * screen, above the tab bar where there is one. It never takes focus and
 * never acts by itself. Update reloads this tab once, and only when nothing
 * in it is unsaved (`applyUpdate`); otherwise it says why and waits to be
 * asked again. Later hides it for this page; the new version still takes over
 * by itself once every window of the application is closed.
 */
export function UpdateNotice() {
  const t = useT("pwa").update;
  const { updateReady } = usePwa();
  const [later, setLater] = useState(false);
  const [state, setState] = useState<"idle" | "unsaved" | "updating">("idle");

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 max-md:bottom-[calc(var(--bar-h)+var(--bar-lift)+1rem)] sm:bottom-8"
    >
      {updateReady && !later && (
        <div className="pointer-events-auto flex w-full max-w-md animate-menu flex-col gap-3 rounded-xl glass-float p-4 text-sm [--float:color-mix(in_oklab,var(--surface-raised)_94%,transparent)]">
          <div className="flex gap-3">
            <RefreshCw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">{t.title}</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">
                {state === "unsaved" ? t.unsaved : t.body}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setLater(true)}>
              {t.later}
            </Button>
            <Button
              size="sm"
              disabled={state === "updating"}
              aria-busy={state === "updating" || undefined}
              onClick={() => {
                const result = applyUpdate();
                setState(
                  result === "started" ? "updating" : result === "unsaved" ? "unsaved" : "idle",
                );
              }}
            >
              {state === "updating" ? t.updating : t.update}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
