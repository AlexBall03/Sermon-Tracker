"use client";

import { useReverification } from "@clerk/nextjs";

import type { AccountUser } from "./use-account-action";

export type EmailEntry = { id: string; address: string; verified: boolean; primary: boolean };

/**
 * Email addresses on the account. Ownership is proved with the provider's
 * emailed code; nothing here marks an address verified by itself.
 */
export function useEmailAddresses(user: AccountUser) {
  function find(id: string) {
    const resource = user.emailAddresses.find((entry) => entry.id === id);
    if (!resource) throw new Error("Email address not found.");
    return resource;
  }

  const create = useReverification((email: string) => user.createEmailAddress({ email }));
  const setPrimary = useReverification((id: string) => user.update({ primaryEmailAddressId: id }));
  const destroy = useReverification((id: string) => find(id).destroy());

  const emails: EmailEntry[] = user.emailAddresses.map((entry) => ({
    id: entry.id,
    address: entry.emailAddress,
    verified: entry.verification.status === "verified",
    primary: entry.id === user.primaryEmailAddressId,
  }));

  return {
    emails,
    /** Adds the address and emails its code. Returns the new address's ID. */
    async add(address: string) {
      const created = await create(address);
      try {
        await created.prepareVerification({ strategy: "email_code" });
      } finally {
        // The address exists either way, so it must show up in the list.
        await user.reload();
      }
      return created.id;
    },
    async sendCode(id: string) {
      await find(id).prepareVerification({ strategy: "email_code" });
    },
    async verify(id: string, code: string) {
      await find(id).attemptVerification({ code });
      await user.reload();
    },
    async makePrimary(id: string) {
      await setPrimary(id);
      await user.reload();
    },
    async remove(id: string) {
      await destroy(id);
      await user.reload();
    },
  };
}
