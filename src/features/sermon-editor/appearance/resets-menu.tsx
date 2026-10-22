"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { useState } from "react";

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
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  resetAllComponents,
  restoreOriginal,
  restorePreset,
} from "@/features/editor-lab/styles/draft";
import type { UserPresetId } from "@/features/editor-lab/styles/model";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import type { AppearanceSession } from "./session";

/*
 * The resets that reach the whole outline (A1-UI.2B.2), kept apart from the
 * contextual ones (a field, a text style, a component type, one component):
 *
 *   - all components to outline defaults: every single component's own
 *     appearance taken away; everything outline-wide kept;
 *   - restore current preset: the outline as its chosen preset draws it;
 *   - original Preacher Studio defaults: Balanced, with nothing customized.
 *
 * Each says what it removes and what it keeps, and asks first. Confirmed, it
 * becomes part of the draft, so it is previewed and can still be cancelled;
 * applied, it is one change that one Undo reverses. None of them touches the
 * sermon's words, its components, their identities, depth, or roles, or a
 * mark the person put on their text.
 */

export type OutlineReset = "allComponents" | "preset" | "original";

const resets = {
  allComponents: resetAllComponents,
  preset: restorePreset,
  original: restoreOriginal,
} as const;

export function OutlineResets({
  session,
  offer,
}: {
  session: AppearanceSession;
  offer: readonly OutlineReset[];
}) {
  const a = useT("editorLab").appearance;
  const [asking, setAsking] = useState<OutlineReset | null>(null);
  const presetName = a.presets[session.presetId as UserPresetId] ?? a.presets.balanced;
  const words = asking ? a.resets[asking] : null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "pointer-coarse:h-11")}
          data-testid="outline-resets"
        >
          <RotateCcw aria-hidden />
          {a.resetsMenu}
          <ChevronDown className="size-3.5" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-80">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{a.resetsScope}</DropdownMenuLabel>
            {offer.map((kind) => (
              <DropdownMenuItem key={kind} onClick={() => setAsking(kind)}>
                {a.resets[kind].label(presetName)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{words?.title(presetName)}</AlertDialogTitle>
            <AlertDialogDescription render={<div />} className="flex flex-col gap-2">
              <span>{words?.removes}</span>
              <span>{words?.keeps}</span>
              <span>{a.resetsReview}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{a.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (asking) {
                  const { editor, draft, stored } = session;
                  session.change(resets[asking](draft, stored, editor.state.doc));
                }
                setAsking(null);
              }}
            >
              {a.resetsConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
