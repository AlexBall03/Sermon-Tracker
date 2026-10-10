"use client";

import { useEffect, useState } from "react";
import { useReverification, useSession } from "@clerk/nextjs";

import type { AccountUser } from "./use-account-action";

type SessionResource = Awaited<ReturnType<AccountUser["getSessions"]>>[number];
type Activity = SessionResource["latestActivity"];

export type SessionEntry = {
  id: string;
  /** The session this browser is using. It cannot be signed out from here. */
  current: boolean;
  device: string;
  location: string | null;
  ipAddress: string | null;
  lastActiveAt: Date;
};

type State =
  { status: "loading" } | { status: "error" } | { status: "ready"; list: SessionResource[] };

/** "Chrome on Windows", or as much of that as the provider recorded. */
export function describeDevice(activity: Activity | null | undefined) {
  const browser = activity?.browserName;
  const device = activity?.deviceType ?? (activity?.isMobile ? "Mobile device" : undefined);
  if (browser && device) return `${browser} on ${device}`;
  return browser ?? device ?? "Unknown device";
}

export function describeLocation(activity: Activity | null | undefined) {
  return [activity?.city, activity?.country].filter(Boolean).join(", ") || null;
}

/** Active sessions for the account, and signing out of the ones on other devices. */
export function useSessions(user: AccountUser) {
  const { session } = useSession();
  const [state, setState] = useState<State>({ status: "loading" });
  const [attemptNumber, setAttemptNumber] = useState(0);

  useEffect(() => {
    let active = true;
    user.getSessions().then(
      (list) => {
        if (!active) return;
        setState({ status: "ready", list: list.filter((entry) => entry.status === "active") });
      },
      () => active && setState({ status: "error" }),
    );
    return () => {
      active = false;
    };
    // Sessions belong to the person, not to a particular copy of the user object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, attemptNumber]);

  const list = state.status === "ready" ? state.list : [];

  const revokeSession = useReverification(async (id: string) => {
    const resource = list.find((entry) => entry.id === id);
    if (!resource) throw new Error("Session not found.");
    await resource.revoke();
  });

  const sessions: SessionEntry[] = list
    .map((entry) => ({
      id: entry.id,
      current: entry.id === session?.id,
      device: describeDevice(entry.latestActivity),
      location: describeLocation(entry.latestActivity),
      ipAddress: entry.latestActivity?.ipAddress ?? null,
      lastActiveAt: entry.lastActiveAt,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));

  return {
    status: state.status,
    sessions,
    retry() {
      setState({ status: "loading" });
      setAttemptNumber((value) => value + 1);
    },
    async revoke(id: string) {
      if (id === session?.id) throw new Error("The current session is not revoked here.");
      await revokeSession(id);
      setState((previous) =>
        previous.status === "ready"
          ? { status: "ready", list: previous.list.filter((entry) => entry.id !== id) }
          : previous,
      );
    },
  };
}
