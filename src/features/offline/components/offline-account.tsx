"use client";

import { createContext, useCallback, useContext, useEffect } from "react";

import { useReading } from "@/features/preferences/client";
import { clearActiveAccount, setActiveAccount, setPermittedTranslations } from "../account";
import { autoDownload } from "../bible/auto";
import { refreshDue, refreshIdeas } from "../ideas/refresh";
import { refreshOutlines, refreshOutlinesDue } from "../outlines/refresh";
import { useOfflineSettings } from "../settings";
import { SyncAgent } from "../sync/agent";

const OfflineAccountContext = createContext<string | null>(null);

/**
 * The account whose work this device keeps: its application user ID, or null
 * where there is none (signed out, or not known offline). Only that account's
 * queued work is read or written under it.
 */
export function useOfflineAccount() {
  return useContext(OfflineAccountContext);
}

export function OfflineAccountProvider({
  account,
  children,
}: {
  account: string | null;
  children: React.ReactNode;
}) {
  return <OfflineAccountContext value={account}>{children}</OfflineAccountContext>;
}

/** How long a kept copy of the ideas goes before it is checked again by itself. */
const ideasRefreshEvery = 5 * 60 * 1000;

/** Runs `task` when the browser is idle, so it never competes with the page arriving. */
function whenIdle(task: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(task, { timeout: 10_000 });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(task, 3_000);
  return () => window.clearTimeout(timer);
}

/**
 * Mounted once in the signed-in shell, for the account signed in. It tells
 * this device who is signed in and which translations they may read, for the
 * offline page; then, once the page is idle, it keeps the reading translation
 * downloaded (bible/auto.ts) and, unless this device was told not to, a copy
 * of the account's ideas current (ideas/refresh.ts), and of its outlines where
 * this device was asked to keep them (outlines/refresh.ts): on opening, on coming
 * back online or to the front once a while has passed, and after the server
 * acknowledged changes sent from here. It draws nothing and never holds the page up:
 * anything it cannot do is shown in Settings, not here.
 */
export function OfflineAgent({
  account,
  children,
}: {
  account: string;
  children: React.ReactNode;
}) {
  const { translation, translations } = useReading();
  const offered = translations.join(",");

  useEffect(() => {
    void setActiveAccount(account).catch(() => {});
  }, [account]);

  useEffect(() => {
    void setPermittedTranslations(offered ? (offered.split(",") as typeof translations) : []).catch(
      () => {},
    );
  }, [offered]);

  useEffect(() => whenIdle(() => void autoDownload(translation).catch(() => {})), [translation]);

  const { ideasOffline, outlinesOffline } = useOfflineSettings();
  const refresh = useCallback(
    (force: boolean) => {
      if (ideasOffline) {
        void (async () => {
          if (force || (await refreshDue(account, ideasRefreshEvery))) await refreshIdeas(account);
        })().catch(() => {});
      }
      if (outlinesOffline) {
        void (async () => {
          if (force || (await refreshOutlinesDue(account, ideasRefreshEvery))) {
            await refreshOutlines(account);
          }
        })().catch(() => {});
      }
    },
    [account, ideasOffline, outlinesOffline],
  );
  useEffect(() => {
    const cancel = whenIdle(() => refresh(false));
    const online = () => refresh(false);
    const visible = () => document.visibilityState === "visible" && refresh(false);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancel();
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh]);
  const synced = useCallback(() => refresh(true), [refresh]);

  return (
    <OfflineAccountProvider account={account}>
      <SyncAgent account={account} onSynced={synced}>
        {children}
      </SyncAgent>
    </OfflineAccountProvider>
  );
}

/**
 * Mounted on the sign-in pages: whoever was signed in is not now, so the
 * offline page stops offering their work. Their queued work stays on the
 * device, under them, for when they sign in again.
 */
export function ForgetOfflineAccount() {
  useEffect(() => {
    void clearActiveAccount().catch(() => {});
  }, []);
  return null;
}
