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

/** How many sessions are signed out at once when signing out all the others. */
const revokeBatch = 5;

/** This device first, then the others from the most recently active. */
export function orderSessions(sessions: SessionEntry[]) {
  return [...sessions].sort(
    (a, b) =>
      Number(b.current) - Number(a.current) || b.lastActiveAt.getTime() - a.lastActiveAt.getTime(),
  );
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

  // One confirmation that it is the person covers them all.
  const revokeOtherSessions = useReverification(async () => {
    const others = list.filter((entry) => entry.id !== session?.id);
    if (others.length === 0) return [];
    // The first is not caught: if the provider wants the person confirmed first, that
    // has to reach `useReverification`, which asks and then runs all of this again.
    await others[0].revoke();
    const revoked = [others[0].id];
    // The rest a few at a time, so a long list is not refused for arriving all at once.
    for (let start = 1; start < others.length; start += revokeBatch) {
      const batch = others.slice(start, start + revokeBatch);
      const outcomes = await Promise.allSettled(batch.map((entry) => entry.revoke()));
      revoked.push(
        ...batch.filter((_, index) => outcomes[index].status === "fulfilled").map((e) => e.id),
      );
    }
    return revoked;
  });

  const sessions = orderSessions(
    list.map((entry) => ({
      id: entry.id,
      current: entry.id === session?.id,
      device: describeDevice(entry.latestActivity),
      location: describeLocation(entry.latestActivity),
      ipAddress: entry.latestActivity?.ipAddress ?? null,
      lastActiveAt: entry.lastActiveAt,
    })),
  );

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
    /** Signs out every device but this one. Those that could not be are left in the list. */
    async revokeOthers() {
      // Without a current session there is no telling which one to keep.
      if (!session) throw new Error("The current session is unknown.");
      const others = list.filter((entry) => entry.id !== session.id);
      const revoked = await revokeOtherSessions().catch((error: unknown) => {
        // The list may be out of date (a session that has since ended); read it again.
        setAttemptNumber((value) => value + 1);
        throw error;
      });
      setState((previous) =>
        previous.status === "ready"
          ? { status: "ready", list: previous.list.filter((entry) => !revoked.includes(entry.id)) }
          : previous,
      );
      if (revoked.length < others.length) throw new Error("Some sessions were not revoked.");
    },
  };
}
