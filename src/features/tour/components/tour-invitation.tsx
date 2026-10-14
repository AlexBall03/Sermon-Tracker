"use client";

import { useEffect, useState } from "react";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { dismissProductTour, markTourOffered } from "../actions";
import { useTour } from "./tour-provider";

/** Matches the collapse's duration below. */
const leaveMs = 300;

/**
 * The dashboard's invitation to take the tour, for an account that has just
 * been through setup (`shouldOfferTour`). It is a card among the dashboard's
 * own, not a layer over them: nothing starts until the person chooses. Being
 * shown records that it was offered; "Maybe Later" records that it was
 * declined, and it is not shown again. Either way it folds away at once.
 */
export function TourInvitation({ className }: { className?: string }) {
  const t = useT("tour").invitation;
  const { start } = useTour();
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">("shown");

  // Asked again on a second render or a second tab, it writes nothing.
  useEffect(() => {
    void markTourOffered().catch(() => {});
  }, []);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("gone"), leaveMs);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;

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
          aria-labelledby="tour-invitation-title"
          inert={phase !== "shown"}
          className="lit-edge mt-8 animate-rise rounded-xl border bg-surface px-5 py-5 shadow-card sm:px-6"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-4">
              <span
                aria-hidden
                className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border border-input bg-surface text-primary shadow-card"
              >
                <Compass className="size-5" />
              </span>
              <div className="min-w-0">
                <h2
                  id="tour-invitation-title"
                  className="text-lg font-semibold tracking-[-0.015em]"
                >
                  {t.title}
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t.body}
                </p>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {t.optional}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch">
              <Button
                onClick={() => {
                  start();
                  setPhase("leaving");
                }}
              >
                {t.start}
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => {
                  setPhase("leaving");
                  void dismissProductTour().catch(() => {});
                }}
              >
                {t.later}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
