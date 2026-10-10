"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CircleCheck, X } from "lucide-react";

type Toast = {
  message: string;
  /** One follow-up, such as opening what was just saved. */
  action?: { label: string; href: string };
};

type Shown = Toast & { key: number };

const ToastContext = createContext<(toast: Toast) => void>(() => {});

/** Shows a short confirmation that floats above the page and clears itself. */
export function useToast() {
  return useContext(ToastContext);
}

const lifetimeMs = 6000;

/**
 * One confirmation at a time, at the foot of the screen. It is a status
 * region, so it is announced without taking focus, and it never blocks the
 * page: a newer message simply replaces the old one.
 */
export function ToastProvider({
  children,
  aboveTabBar = false,
}: {
  children: React.ReactNode;
  /** The shell shows the small-screen tab bar, so the message sits above it there. */
  aboveTabBar?: boolean;
}) {
  const [toast, setToast] = useState<Shown | null>(null);
  const show = useCallback((next: Toast) => setToast({ ...next, key: Date.now() }), []);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(dismiss, lifetimeMs);
    return () => window.clearTimeout(timer);
  }, [toast, dismiss]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 sm:bottom-8 ${
          aboveTabBar ? "max-md:bottom-[calc(var(--bar-h)+env(safe-area-inset-bottom)+1rem)]" : ""
        }`}
      >
        {toast && (
          <div
            key={toast.key}
            className="pointer-events-auto flex max-w-md animate-menu items-center gap-3 rounded-xl glass-float py-2 pr-2 pl-4 text-sm font-medium [--float:color-mix(in_oklab,var(--surface-raised)_94%,transparent)]"
          >
            <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">{toast.message}</span>
            {toast.action && (
              <Link
                href={toast.action.href}
                onClick={dismiss}
                className="rounded-md px-2 py-1.5 font-semibold text-primary underline-offset-4 hover:underline"
              >
                {toast.action.label}
              </Link>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
