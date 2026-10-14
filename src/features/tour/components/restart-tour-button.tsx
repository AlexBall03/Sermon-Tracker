"use client";

import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { useTour } from "./tour-provider";

/**
 * Settings' way to run the tour again. It is a replay: it takes the person to
 * the dashboard and begins, and resets nothing (setup, the profile, the
 * preferences, and the account's ideas are untouched, and so is how the tour
 * stood: only finishing or skipping it says anything).
 */
export function RestartTourButton() {
  const t = useT("settings").blocks;
  const { start } = useTour();
  return (
    <Button variant="outline" onClick={start}>
      <Compass aria-hidden />
      {t.restartTour}
    </Button>
  );
}
