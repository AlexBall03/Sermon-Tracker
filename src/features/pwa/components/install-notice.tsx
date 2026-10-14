"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { installGuide } from "../install";
import { installNoticeAnswer, storeInstallNotice, subscribeInstallNotice } from "../install-notice";
import { promptInstall, usePwa } from "../pwa";

/** Matches the collapse's duration below. */
const leaveMs = 300;

const subscribeNothing = () => () => {};
type Browser = { userAgent: string; maxTouchPoints: number };
let browser: Browser | null = null;
// One object for the page's life: a snapshot must be the same value each time it is read.
const browserOf = () =>
  (browser ??= { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0 });

/**
 * The dashboard's notice that the application can be installed. Shown in a
 * browser that can install it until this browser dismisses it or installs it;
 * never in the installed application. A browser that offered its own prompt
 * gets a real button; any other is sent to Settings, where its steps are.
 * Nothing is drawn on the server or before hydration, so it never flashes.
 */
export function InstallNotice({ className }: { className?: string }) {
  const t = useT("pwa").notice;
  const pwa = usePwa();
  const device = useSyncExternalStore(subscribeNothing, browserOf, () => null);
  const answer = useSyncExternalStore(
    subscribeInstallNotice,
    installNoticeAnswer,
    () => "unknown" as const,
  );
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("gone"), leaveMs);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!device || phase === "gone") return null;
  const guide = installGuide({ ...device, ...pwa });
  const owed =
    answer === null &&
    guide !== "installed" &&
    guide !== "just-installed" &&
    guide !== "unsupported";
  // Once dismissed it folds away, though the answer is already stored.
  if (!owed && phase !== "leaving") return null;

  return (
    // Folds shut on its own height, so the sections beneath move up instead of jumping.
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
        phase === "shown" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="min-h-0">
        <section
          aria-labelledby="install-notice-title"
          inert={phase !== "shown"}
          className="lit-edge mt-8 animate-rise rounded-xl border bg-surface px-5 py-5 shadow-card sm:px-6"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-4">
              <span
                aria-hidden
                className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border border-input bg-surface text-primary shadow-card"
              >
                <Download className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 id="install-notice-title" className="text-lg font-semibold tracking-[-0.015em]">
                  {t.title}
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t.body}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
              {guide === "prompt" ? (
                <Button
                  disabled={busy}
                  aria-busy={busy || undefined}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await promptInstall();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t.install}
                </Button>
              ) : (
                <Link href={`${routes.settings}#install`} className={buttonVariants()}>
                  {t.howTo}
                </Link>
              )}
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  setPhase("leaving");
                  storeInstallNotice("dismissed");
                }}
              >
                {t.dismiss}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
