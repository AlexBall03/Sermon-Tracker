"use client";

import type { Editor } from "@tiptap/react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { findComponent } from "@/features/editor-lab/styles/component-node";
import { ComponentAppearance } from "./component-appearance";
import { OutlineSettings, type OutlineSettingsOptions } from "./outline-settings";
import { componentAtSelection, type Target } from "./target";
import type { PrintColorMode } from "../presentation/preferences";
import { printWith } from "../presentation/print-job";

/*
 * How the outline editor opens its settings (A1-UI.2B.2). Outline Settings
 * and Component Appearance are the editor's own windows: never the Workspace
 * Panel's (B1), and never open together. Anything inside the workspace opens
 * them through `useAppearanceDialogs()`: today the header, the toolbar's
 * "Edit styles", and the structure tools; in UI.3 the component's context
 * menu and its touch action menu, through the same two calls.
 */

export type AppearanceDialogs = {
  /** Opens Outline Settings on Appearance (optionally on a tab, a text style, or a component type). */
  openOutlineSettings: (options?: OutlineSettingsOptions) => void;
  /**
   * Opens Component Appearance on the component with this ID, or the one the
   * selection is in. Opens nothing, and returns false, when there is none.
   */
  openComponentAppearance: (id?: string) => boolean;
  /** Which is open, if either. */
  open: "outline" | "component" | null;
};

type Open =
  | { kind: "outline"; options: OutlineSettingsOptions }
  | { kind: "component"; target: Target }
  | null;

const Context = createContext<AppearanceDialogs | null>(null);

export function useAppearanceDialogs(): AppearanceDialogs {
  const value = useContext(Context);
  if (!value) throw new Error("useAppearanceDialogs is used outside AppearanceDialogsProvider");
  return value;
}

/** The target an ID names now, or the selection's: by identity, never by position. */
export function resolveTarget(editor: Editor, id?: string): Target | null {
  if (id === undefined) return componentAtSelection(editor.state);
  const found = findComponent(editor.state.doc, id);
  return found ? { id, kind: found.kind } : null;
}

export function AppearanceDialogsProvider({
  editor,
  children,
}: {
  editor: Editor | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<Open>(null);
  /*
   * A print asked for in Outline Settings → Printing (A4.4). The window closes
   * first; the print starts only once it is gone from the page (this effect
   * runs after React has removed it) and a frame has been drawn, so nothing
   * of the window or its preview is in the page being printed. The mode is
   * given to the print job only when the print starts (`printWith`), so a
   * print that never starts (the page left, the workspace unmounted, another
   * window opened first) leaves no request behind.
   */
  const [printRequest, setPrintRequest] = useState<{ mode: PrintColorMode } | null>(null);
  useEffect(() => {
    if (!printRequest || open !== null) return;
    const frame = requestAnimationFrame(() => {
      setPrintRequest(null);
      if (!editor || editor.isDestroyed) return;
      printWith(printRequest.mode);
    });
    return () => cancelAnimationFrame(frame);
  }, [printRequest, open, editor]);
  const value = useMemo<AppearanceDialogs>(
    () => ({
      // Opening a window drops a print not yet started: it would print with the window open.
      openOutlineSettings: (options = {}) => {
        setPrintRequest(null);
        setOpen({ kind: "outline", options });
      },
      openComponentAppearance: (id) => {
        const target = editor ? resolveTarget(editor, id) : null;
        if (!target) return false;
        setPrintRequest(null);
        setOpen({ kind: "component", target });
        return true;
      },
      open: open?.kind ?? null,
    }),
    [editor, open],
  );
  const close = () => setOpen(null);
  return (
    <Context.Provider value={value}>
      {children}
      {editor && open?.kind === "outline" && (
        <OutlineSettings
          editor={editor}
          initial={open.options}
          onClose={close}
          onPrint={(mode) => {
            setOpen(null);
            setPrintRequest({ mode });
          }}
        />
      )}
      {editor && open?.kind === "component" && (
        <ComponentAppearance
          key={open.target.id}
          editor={editor}
          target={open.target}
          onClose={close}
        />
      )}
    </Context.Provider>
  );
}
