"use client";

import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

const subscribe = () => () => {};

type ThemeToggleProps = {
  /** Show the option names beside the icons (used in the mobile menu). */
  showLabels?: boolean;
  className?: string;
};

/**
 * Light / Dark selector. With no stored choice the site follows the operating
 * system, and the matching option shows as selected; picking one persists it.
 */
export function ThemeToggle({ showLabels = false, className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  // The active theme is unknown on the server, so nothing is marked
  // checked until after hydration.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  function choose(value: string) {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) {
      setTheme(value);
      return;
    }
    document.startViewTransition(() => flushSync(() => setTheme(value)));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const radios = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    const current = radios.indexOf(document.activeElement as HTMLElement);
    const next = radios[(current + step + radios.length) % radios.length];
    next.focus();
    next.click();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      onKeyDown={onKeyDown}
      className={cn("inline-flex gap-0.5 rounded-lg bg-secondary p-0.5", className)}
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mounted && resolvedTheme === value}
          aria-label={showLabels ? undefined : label}
          title={showLabels ? undefined : label}
          onClick={() => choose(value)}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium text-muted-foreground transition-[color,background-color,box-shadow] duration-150 hover:text-foreground not-aria-checked:hover:bg-accent not-aria-checked:active:bg-foreground/10 aria-checked:cursor-default aria-checked:bg-surface-raised aria-checked:text-foreground aria-checked:shadow-card dark:aria-checked:bg-foreground/10",
            showLabels ? "h-10 flex-1 px-3" : "size-8 pointer-coarse:size-10",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {showLabels && label}
        </button>
      ))}
    </div>
  );
}
