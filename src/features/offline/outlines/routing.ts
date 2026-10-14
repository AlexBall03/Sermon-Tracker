"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import type { OutlineActionResult } from "@/features/outlines/actions";
import type { OutlineApi, OutlineSnapshot, OutlineStore } from "@/features/outlines/editor/store";
import type { OfflineOutline, OfflineOutlineSermon } from "@/features/sync/outlines";
import type { ScriptureReference } from "@/features/scripture/reference";
import { useLocale } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { useOfflineAccount } from "../components/offline-account";
import { listMutations, onQueueChange } from "../queue";
import { useOfflineSettings } from "../settings";
import { createDeviceOutlineApi } from "./operations";
import { getKeptOutline, shownOutline } from "./store";

/*
 * Where the outline editor's saves go on the application's own page (Phase
 * 5D.2). The editor's store has one queue and sends each change in turn; this
 * decides, change by change, whether it goes to the server or is kept on the
 * device for the sync engine. Never both for one outline at once:
 *
 * - To the server, as always, while nothing about this outline is queued on
 *   the device.
 * - To the device when the server gives no answer and this device keeps
 *   outlines: the change is kept there, made on the outline as the store last
 *   heard it from the server (`confirmedSnapshot`), and every change after it
 *   follows it there, in order.
 * - To the device, too, while changes made earlier (on the offline page, or
 *   before a reload) are still queued: the editor shows the device's copy and
 *   its changes wait behind them.
 * - Back to the server once the engine has sent everything queued about the
 *   outline: the page is read again (`reload`), and the store takes what it
 *   should from it as it does after any change made elsewhere.
 *
 * A change the device cannot keep (storage refused) fails as the server's
 * silence did, so the store keeps it, says so, and tries again.
 */

export type OutlineSaving = {
  api: OutlineApi;
  /** The store the API saves for; its last acknowledged outline is what a kept change starts from. */
  attach: (store: OutlineStore) => void;
  subscribe: (listener: () => void) => () => void;
  /** True while this outline's changes are kept on the device. */
  onDevice: () => boolean;
  /** The device's setting and the page's way to read itself again, as they are now. */
  configure: (latest: Pick<Options, "keep" | "reload">) => void;
  /**
   * Follows the queue, to go back to the server once it is empty; returns the
   * way to stop. Changes already asked for still go where they were going.
   */
  watch: () => () => void;
};

type Options = {
  owner: string | null;
  outlineId: string;
  server: OutlineApi;
  locale: Locale;
  /** Whether this device keeps outlines, asked when the server gives no answer. */
  keep: boolean;
  sermon: { sermon: OfflineOutlineSermon; sermonReferences: ScriptureReference[] };
  /** Reads the page again, once everything kept on the device has reached the server. */
  reload: () => void;
};

type Call = (...args: unknown[]) => Promise<OutlineActionResult>;

/** The outline as the editor's page sends it. */
export const outlineSnapshot = (outline: OfflineOutline): OutlineSnapshot => ({
  id: outline.id,
  revision: outline.revision,
  numbering: outline.numbering,
  entries: outline.entries,
});

export function createOutlineSaving(options: Options): OutlineSaving {
  const { owner, outlineId, server } = options;
  const live = { keep: options.keep, reload: options.reload };
  let store: OutlineStore | null = null;
  let device = false;
  const listeners = new Set<() => void>();
  const set = (value: boolean) => {
    if (device === value) return;
    device = value;
    listeners.forEach((listener) => listener());
  };

  const kept = owner
    ? createDeviceOutlineApi(owner, outlineId, {
        locale: options.locale,
        seed: () => store?.confirmedSnapshot() ?? null,
        sermon: options.sermon,
      })
    : null;

  const queued = async () =>
    owner
      ? (await listMutations(owner, { entityId: outlineId }).catch(() => [])).length > 0
      : false;

  // Changes made earlier and still queued: the device's copy is shown, and these wait behind them.
  const ready = (async () => {
    if (!(await queued())) return;
    set(true);
    const copy = shownOutline(await getKeptOutline(owner!, outlineId).catch(() => null));
    // Attached by then: the store is made in the same render as this.
    const attached = store as OutlineStore | null;
    if (copy) attached?.adopt(outlineSnapshot(copy));
  })();

  function route(name: keyof OutlineApi): Call {
    return async (...args) => {
      await ready;
      const call = (api: OutlineApi) => (api[name] as Call)(...args);
      if (device && kept) return call(kept);
      try {
        return await call(server);
      } catch (error) {
        if (!kept || !live.keep) throw error;
        try {
          const result = await call(kept);
          set(true);
          return result;
        } catch {
          throw error;
        }
      }
    };
  }

  return {
    api: {
      addEntry: route("addEntry"),
      updateEntry: route("updateEntry"),
      moveEntry: route("moveEntry"),
      removeEntry: route("removeEntry"),
      setEntryReferences: route("setEntryReferences"),
      setOutlineNumbering: route("setOutlineNumbering"),
    },
    attach(next) {
      store = next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    onDevice: () => device,
    configure(latest) {
      live.keep = latest.keep;
      live.reload = latest.reload;
    },
    watch() {
      let watching = true;
      const unwatch = onQueueChange(() => {
        if (!device) return;
        void queued().then((left) => {
          if (left || !device || !watching) return;
          set(false);
          live.reload();
        });
      });
      return () => {
        watching = false;
        unwatch();
      };
    },
  };
}

/**
 * `createOutlineSaving` for the editor on the application's page. Not
 * `active` (the offline page, where everything is kept on the device), it
 * sends every change to the server and never looks at the device.
 */
export function useOutlineSaving(
  outlineId: string,
  server: OutlineApi,
  sermon: Options["sermon"],
  reload: () => void,
  active = true,
) {
  const account = useOfflineAccount();
  const owner = active ? account : null;
  const locale = useLocale();
  const { outlinesOffline } = useOfflineSettings();
  const [saving] = useState(() =>
    createOutlineSaving({ owner, outlineId, server, locale, sermon, keep: false, reload }),
  );
  useEffect(() => {
    saving.configure({ keep: outlinesOffline, reload });
  });
  useEffect(() => saving.watch(), [saving]);
  const onDevice = useSyncExternalStore(saving.subscribe, saving.onDevice, () => false);
  return { saving, onDevice };
}
