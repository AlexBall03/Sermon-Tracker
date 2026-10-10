"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaQuery, wideEnough } from "@/lib/use-media-query";
import type { ScriptureReference } from "../reference";
import { ScriptureBrowser, type PanelAttach } from "./scripture-browser";

/** What to open the Scripture Panel on, and what choosing a passage there does. */
export type PanelRequest = {
  reference?: ScriptureReference;
  /** Omit to open the panel for reading only. */
  attach?: PanelAttach;
};

type ScriptureContextValue = {
  openPanel: (request: PanelRequest) => void;
  /**
   * True where the panel opens inside the surface that asked for it instead
   * of over it (quick capture). A narrow-screen preview then goes straight to
   * the panel, so one overlay never sits on another.
   */
  inline: boolean;
};

const ScriptureContext = createContext<ScriptureContextValue>({
  openPanel: () => {},
  inline: false,
});

/** How any component opens the Scripture Panel, wherever it is rendered. */
export function useScripture() {
  return useContext(ScriptureContext);
}

/**
 * The application's one Scripture Panel. It is a side panel where the window
 * has room beside the page and a full-height sheet where it does not; the
 * choice follows the space available, and its content is the same either way.
 */
export function ScriptureProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<PanelRequest | null>(null);
  const [open, setOpen] = useState(false);
  // Counts openings, so each one starts the browser afresh on its passage.
  const [opening, setOpening] = useState(0);
  const wide = useMediaQuery(wideEnough);

  const openPanel = useCallback((next: PanelRequest) => {
    setRequest(next);
    setOpening((count) => count + 1);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ openPanel, inline: false }), [openPanel]);
  const close = () => setOpen(false);

  return (
    <ScriptureContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent placement={wide ? "side" : "full"}>
          {request && (
            <ScriptureBrowser
              key={opening}
              initial={request.reference}
              attach={request.attach}
              // As a side panel the page is still in view beside it; as a full sheet it is not.
              besideIdea={wide}
              onDone={close}
              header={
                <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5">
                  <div className="min-w-0">
                    <DialogTitle>Scripture</DialogTitle>
                    <DialogDescription>King James Version</DialogDescription>
                  </div>
                  <DialogClose label="Close Scripture" />
                </div>
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </ScriptureContext.Provider>
  );
}

/**
 * For a surface that shows the panel within itself. Everything inside it that
 * asks for the panel is handed to `onOpenPanel` instead of the shared one.
 */
export function ScriptureHost({
  onOpenPanel,
  children,
}: {
  onOpenPanel: (request: PanelRequest) => void;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ openPanel: onOpenPanel, inline: true }), [onOpenPanel]);
  return <ScriptureContext.Provider value={value}>{children}</ScriptureContext.Provider>;
}
