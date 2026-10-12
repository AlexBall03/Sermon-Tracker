"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

const subscribe = () => () => {};

/**
 * The same theme control as the application bar, reading and writing the same
 * stored choice, so the two always agree. Nothing about the theme is saved to
 * the account.
 */
export function AppearanceSettings() {
  const t = useT("settings").appearance;
  const { theme, setTheme } = useTheme();
  // The stored choice is unknown on the server.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const chosen = mounted && theme !== undefined && theme !== "system";

  return (
    <div>
      <ThemeToggle showLabels className="flex w-full max-w-xs" />
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground" aria-live="polite">
        {chosen ? t.remembered : t.following}
      </p>
      {chosen && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setTheme("system")}>
          {t.useDevice}
        </Button>
      )}
    </div>
  );
}
