"use client";

import { createContext, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";

/**
 * Where an idea's page is working from. On the application's pages (the
 * default) changes go to the server, and are kept on the device only when it
 * gives no answer; on the offline page (Phase 5D.1) every change is kept on
 * the device for the sync engine. Showing the idea again after a change, and
 * leaving it, go through the router there and through the offline page's own
 * addresses here.
 */
export type IdeaOperations = {
  /** True where every change is kept on the device and nothing asks the server. */
  local: boolean;
  /** Shows the idea again as it now stands. */
  refresh: () => void;
  /** Leaves the idea for `href` (after deleting it). */
  leave: (href: string) => void;
};

const IdeaOperationsContext = createContext<IdeaOperations | null>(null);

export function IdeaOperationsProvider({
  value,
  children,
}: {
  value: IdeaOperations;
  children: React.ReactNode;
}) {
  return <IdeaOperationsContext value={value}>{children}</IdeaOperationsContext>;
}

export function useIdeaOperations(): IdeaOperations {
  const provided = useContext(IdeaOperationsContext);
  const router = useRouter();
  return useMemo(
    () =>
      provided ?? {
        local: false,
        refresh: () => router.refresh(),
        leave: (href: string) => router.push(href),
      },
    [provided, router],
  );
}
