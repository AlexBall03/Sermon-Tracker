"use client";

import { useState } from "react";
import { List } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CreateOutlineDialog } from "@/features/outlines/components/create-outline-dialog";
import { useT } from "@/i18n/client";

/**
 * The dashboard's way to an outline without going to the overview first. It
 * opens the overview's own sermon picker: a sermon that has an outline opens
 * it, and one that has none is given one. Opening the picker, or leaving it,
 * makes nothing.
 */
export function DashboardOutlineButton() {
  const [open, setOpen] = useState(false);
  const t = useT("dashboard").outline;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-haspopup="dialog"
        data-tour="start-outline"
        onClick={() => setOpen(true)}
      >
        <List aria-hidden />
        {t.title}
      </Button>
      <CreateOutlineDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
