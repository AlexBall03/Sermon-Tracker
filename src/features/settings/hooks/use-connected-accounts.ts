"use client";

import { useReverification } from "@clerk/nextjs";

import { routes } from "@/lib/site";
import type { AccountUser } from "./use-account-action";

/**
 * Sign-in providers this application offers. The browser SDK has no public
 * list of the providers enabled on the instance, so this mirrors the setup in
 * docs/ENVIRONMENTS.md; connecting one that is switched off fails with a message.
 */
export const providers = [
  { strategy: "oauth_google", provider: "google", title: "Google" },
] as const;
export type ProviderStrategy = (typeof providers)[number]["strategy"];

export type ConnectedAccount = {
  id: string;
  provider: string;
  title: string;
  email: string;
  /** False when a connection was started but never completed. */
  verified: boolean;
  /** False when removing it would leave no way to sign in. */
  canDisconnect: boolean;
};

export function useConnectedAccounts(user: AccountUser) {
  const create = useReverification((strategy: ProviderStrategy) =>
    user.createExternalAccount({
      strategy,
      redirectUrl: new URL(routes.settings, window.location.origin).toString(),
    }),
  );
  const destroy = useReverification(async (id: string) => {
    const account = user.externalAccounts.find((entry) => entry.id === id);
    if (!account) throw new Error("Connected account not found.");
    await account.destroy();
  });

  const linked = user.externalAccounts.map((account) => ({
    id: account.id,
    provider: account.provider as string,
    title: account.providerTitle(),
    email: account.emailAddress,
    verified: account.verification?.status === "verified",
  }));

  const accounts: ConnectedAccount[] = linked.map((account) => ({
    ...account,
    canDisconnect:
      !account.verified ||
      user.passwordEnabled ||
      linked.some((other) => other.verified && other.id !== account.id),
  }));

  return {
    accounts,
    /** Providers the person has not connected yet. */
    available: providers.filter(
      (option) =>
        !linked.some((account) => account.verified && account.provider === option.provider),
    ),
    /** Starts the provider's own consent screen; the browser leaves this page. */
    async connect(strategy: ProviderStrategy) {
      const account = await create(strategy);
      const url = account.verification?.externalVerificationRedirectURL;
      if (!url) throw new Error("The provider did not return a redirect.");
      window.location.assign(url.href);
    },
    async disconnect(id: string) {
      await destroy(id);
      await user.reload();
    },
  };
}
