"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { labFontVariables } from "../fonts";
import "../lab.css";

/** The page's body never changes: nothing to listen to. */
const noSubscription = () => () => undefined;

/**
 * The editor workspace's frame: it fills the window over the application's
 * shell, and the page behind it does not scroll.
 *
 * It is drawn on the page's body, so it fills the window whatever the shell
 * around it does. It shares the top layer (z-50) with the application bar
 * and the menus: added after the bar, it covers it, and a menu opened from
 * it is added after it, so the menu shows above it. The application's bar is
 * hidden while it is open (`lab.css`): covering it by coming later in the
 * page is not enough, since a bar mounted again comes later still.
 *
 * Nothing is drawn on the server (there is no body to draw on), so whatever
 * is inside may read browser state as it first renders.
 */
export function WorkspaceFrame({
  testId,
  ready,
  children,
}: {
  testId: string;
  ready: boolean;
  children: React.ReactNode;
}) {
  const host = useSyncExternalStore(
    noSubscription,
    () => document.body,
    () => null,
  );
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.dataset.labWorkspace = "open";
    return () => {
      document.body.style.overflow = previous;
      delete document.documentElement.dataset.labWorkspace;
    };
  }, []);

  if (!host) return null;
  return createPortal(
    <div
      className={`lab-workspace ${labFontVariables} fixed inset-0 z-50 flex flex-col overflow-hidden bg-background`}
      data-testid={testId}
      data-ready={ready ? "true" : "false"}
    >
      {children}
    </div>,
    host,
  );
}
