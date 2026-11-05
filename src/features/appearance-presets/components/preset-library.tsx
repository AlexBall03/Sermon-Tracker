"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

import {
  createAppearancePreset,
  deleteAppearancePreset,
  duplicateAppearancePreset,
  getAppearanceDefault,
  getAppearancePreset,
  listAppearancePresets,
  renameAppearancePreset,
  replaceAppearancePresetAppearance,
  setAppearanceDefault,
} from "../actions";
import type { PresetActions } from "../client";

/*
 * Whether this editor can reach the account's presets (A4.2C). Provided only
 * by the production host (`OutlineDocumentHost`), around a signed-in
 * account's outline. The labs mount none, so Outline Settings there offers
 * the built-in presets only and nothing reaches the server.
 */

export type PresetLibrary = PresetActions & { list: typeof listAppearancePresets };

export const presetActions: PresetLibrary = {
  create: createAppearancePreset,
  duplicate: duplicateAppearancePreset,
  get: getAppearancePreset,
  list: listAppearancePresets,
  rename: renameAppearancePreset,
  replace: replaceAppearancePresetAppearance,
  remove: deleteAppearancePreset,
  getDefault: getAppearanceDefault,
  setDefault: setAppearanceDefault,
};

const Context = createContext<PresetLibrary | null>(null);

export function PresetLibraryProvider({
  children,
  library = presetActions,
}: {
  children: React.ReactNode;
  library?: PresetLibrary;
}) {
  return <Context.Provider value={library}>{children}</Context.Provider>;
}

/** The account's presets, or null where there are none to reach (the labs). */
export const usePresetLibrary = () => useContext(Context);

function subscribe(changed: () => void) {
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  return () => {
    window.removeEventListener("online", changed);
    window.removeEventListener("offline", changed);
  };
}

/**
 * What the browser says of the connection. Advice only, never proof either
 * way: it decides whether a notice is shown and changes are offered, and an
 * answer that never came is still handled as uncertain.
 */
export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
