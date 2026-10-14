"use client";

import { useEffect, useSyncExternalStore } from "react";

import { openOfflineDb } from "./db";
import { defaultOfflineSettings, type OfflineSettings } from "./model";

/*
 * This device's offline choices, kept in the offline database and never on
 * the account: another device, or another browser, has its own.
 */

const key = "settings";
let current: OfflineSettings = defaultOfflineSettings;
let loaded: Promise<OfflineSettings> | null = null;
const listeners = new Set<() => void>();

function settle(value: unknown): OfflineSettings {
  const stored = value && typeof value === "object" ? (value as Partial<OfflineSettings>) : {};
  return {
    captureOffline:
      typeof stored.captureOffline === "boolean"
        ? stored.captureOffline
        : defaultOfflineSettings.captureOffline,
    autoBible:
      typeof stored.autoBible === "boolean" ? stored.autoBible : defaultOfflineSettings.autoBible,
  };
}

/** The device's settings; the defaults when nothing is stored or storage is refused. */
export function readOfflineSettings(): Promise<OfflineSettings> {
  loaded ??= openOfflineDb()
    .then((db) => db.get("meta", key))
    .then(settle, () => defaultOfflineSettings)
    .then((value) => {
      current = value;
      listeners.forEach((listener) => listener());
      return value;
    });
  return loaded;
}

export async function saveOfflineSettings(change: Partial<OfflineSettings>) {
  const next = { ...(await readOfflineSettings()), ...change };
  const db = await openOfflineDb();
  await db.put("meta", next, key);
  current = next;
  loaded = Promise.resolve(next);
  listeners.forEach((listener) => listener());
  return next;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The device's settings, starting from the defaults until they have been read. */
export function useOfflineSettings(): OfflineSettings {
  useEffect(() => void readOfflineSettings(), []);
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => defaultOfflineSettings,
  );
}

/** For tests. */
export function resetOfflineSettingsMemory() {
  current = defaultOfflineSettings;
  loaded = null;
}
