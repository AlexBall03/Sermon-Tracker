import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { isAuthConfigured } from "@/lib/env";

export type Identity = { name: string | null; email: string | null };

/**
 * Names and addresses of accounts, for the administrator's inbox. Asked of
 * Clerk in one call per hundred; null when Clerk cannot be reached, and the
 * inbox then shows what it has without them.
 */
export async function identitiesFor(clerkUserIds: string[]): Promise<Map<string, Identity> | null> {
  const ids = [...new Set(clerkUserIds)];
  const found = new Map<string, Identity>();
  if (ids.length === 0) return found;
  if (!isAuthConfigured()) return null;
  try {
    const client = await clerkClient();
    for (let start = 0; start < ids.length; start += 100) {
      const page = await client.users.getUserList({
        userId: ids.slice(start, start + 100),
        limit: 100,
      });
      for (const identity of page.data) {
        found.set(identity.id, {
          name: identity.fullName,
          email: identity.primaryEmailAddress?.emailAddress ?? null,
        });
      }
    }
    return found;
  } catch {
    return null;
  }
}

/**
 * Where to write to an account about its ticket, and what to call them. The
 * address is Clerk's and is asked for when it is needed, never copied into a
 * ticket. Null when Clerk cannot say.
 */
export async function requesterContact(
  clerkUserId: string,
): Promise<{ email: string; name: string | null } | null> {
  if (!isAuthConfigured()) return null;
  try {
    const client = await clerkClient();
    const identity = await client.users.getUser(clerkUserId);
    const email = identity.primaryEmailAddress?.emailAddress;
    return email ? { email, name: identity.firstName ?? null } : null;
  } catch {
    return null;
  }
}
