"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { DialogViewport } from "./dialog-viewport";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

/**
 * Where a dialog sits. One component covers every modal layer so they share
 * focus handling, the scrim, and the glass:
 * - `top`: a form near the top of the screen, clear of the on-screen keyboard
 * - `bottom`: a short sheet rising from the foot of a narrow screen
 * - `side`: a panel down the right edge, beside the page
 * - `full`: a sheet that takes the whole of a narrow screen
 *
 * `top` and `full` keep to the part of the screen that can be seen while a
 * phone's keyboard is up, and a drag never scrolls the page behind any of
 * them (`DialogViewport`).
 */
const placements = {
  top: "top-[calc(var(--vv-top,0px)+max(0.75rem,env(safe-area-inset-top)))] left-1/2 max-h-[calc(var(--vv-h,100dvh)-1.5rem)] w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-xl data-closed:zoom-out-95 data-open:zoom-in-95 sm:top-[9vh] sm:max-h-[82vh]",
  bottom:
    "inset-x-0 bottom-0 max-h-[78dvh] rounded-t-2xl border-x-0 border-b-0 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] data-closed:slide-out-to-bottom-8 data-open:slide-in-from-bottom-8",
  side: "inset-y-0 right-0 w-[30rem] max-w-full rounded-none border-y-0 border-r-0 pr-[env(safe-area-inset-right)] data-closed:slide-out-to-right-8 data-open:slide-in-from-right-8",
  full: "inset-x-0 top-[var(--vv-top,0px)] h-[var(--vv-h,100dvh)] rounded-none border-0 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] data-closed:slide-out-to-bottom-4 data-open:slide-in-from-bottom-4",
} as const;

function DialogContent({
  className,
  placement = "top",
  children,
  ...props
}: DialogPrimitive.Popup.Props & { placement?: keyof typeof placements }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-overlay"
        className="fixed inset-0 isolate z-50 bg-black/45 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        data-placement={placement}
        className={cn(
          // Denser than a menu, as the alert dialog is: text must stay readable over anything.
          "fixed z-50 flex flex-col overflow-hidden glass-float text-popover-foreground duration-200 outline-none [--float:color-mix(in_oklab,var(--surface-raised)_94%,transparent)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          placements[placement],
          className,
        )}
        {...props}
      >
        {children}
        <DialogViewport />
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-display text-xl leading-snug font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

/** The round close control in a dialog's corner. */
function DialogClose({
  className,
  label = "Close",
  ...props
}: DialogPrimitive.Close.Props & {
  label?: string;
}) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      aria-label={label}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 pointer-coarse:size-11",
        className,
      )}
      {...props}
    >
      <X className="size-4" aria-hidden />
    </DialogPrimitive.Close>
  );
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle };
