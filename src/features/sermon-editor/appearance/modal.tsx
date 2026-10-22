"use client";

import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { AppearanceSession } from "./session";

/*
 * The window both Appearance workflows open in (A1-UI.2B.2): a modal dialog
 * (focus kept inside, the page behind inert), the whole screen on a phone and
 * a large centered window from `md`. Closing it never applies anything, and
 * never loses a change silently: with a draft, Escape and × ask first.
 * Focus goes back to the outline.
 */
export function AppearanceModal({
  session,
  onClose,
  title,
  description,
  testId,
  className,
  children,
}: {
  session: AppearanceSession;
  onClose: () => void;
  title: string;
  description: React.ReactNode;
  testId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const a = useT("editorLab").appearance;
  const [confirming, setConfirming] = useState(false);
  const outline = useMemo(() => ({ current: session.editor.view.dom }), [session.editor]);
  const requestClose = () => (session.dirty ? setConfirming(true) : onClose());
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()} disablePointerDismissal>
        <DialogContent
          placement="settings"
          data-testid={testId}
          finalFocus={outline}
          className={cn("text-foreground", className)}
        >
          <div className="flex items-start gap-3 border-b px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">{title}</DialogTitle>
              <DialogDescription render={<div />} className="mt-0.5 text-xs">
                {description}
              </DialogDescription>
            </div>
            <DialogClose label={a.close} />
          </div>
          {children}
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{a.discardTitle}</AlertDialogTitle>
            <AlertDialogDescription>{a.discardDetail}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{a.keepEditing}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                session.discard();
                onClose();
              }}
            >
              {a.discard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
