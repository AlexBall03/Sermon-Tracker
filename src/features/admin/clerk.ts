import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

import type { AppUser } from "@/db/schema";
import { appAccessMetadataKey } from "@/features/auth/provisioning";
import { routes } from "@/lib/site";

/** Clerk is the source of truth for identities and invitations; nothing here is stored locally. */

export type DirectoryEntry = AppUser & {
  name: string | null;
  email: string | null;
  /** The Clerk identity no longer exists. The application record is kept. */
  identityMissing: boolean;
};

const pageSize = 100;

/** Adds names and email addresses from Clerk to application user rows. */
export async function withIdentities(rows: AppUser[]): Promise<DirectoryEntry[]> {
  const client = await clerkClient();
  const identities = new Map<string, { name: string | null; email: string | null }>();

  for (let start = 0; start < rows.length; start += pageSize) {
    const ids = rows.slice(start, start + pageSize).map((row) => row.clerkUserId);
    const page = await client.users.getUserList({ userId: ids, limit: pageSize });
    for (const identity of page.data) {
      identities.set(identity.id, {
        name: identity.fullName,
        email: identity.primaryEmailAddress?.emailAddress ?? null,
      });
    }
  }

  return rows.map((row) => {
    const identity = identities.get(row.clerkUserId);
    return {
      ...row,
      name: identity?.name ?? null,
      email: identity?.email ?? null,
      identityMissing: !identity,
    };
  });
}

export type PendingInvitation = { id: string; email: string; createdAt: Date };

export async function listPendingInvitations(): Promise<PendingInvitation[]> {
  const client = await clerkClient();
  const result = await client.invitations.getInvitationList({ status: "pending", limit: pageSize });
  return result.data.map((invitation) => ({
    id: invitation.id,
    email: invitation.emailAddress,
    createdAt: new Date(invitation.createdAt),
  }));
}

/**
 * Sends an invitation. The metadata is copied by Clerk onto the account that
 * accepts it, which is how provisioning recognises an invited identity.
 */
export async function createInvitation(email: string, origin: string, replaceExisting = false) {
  const client = await clerkClient();
  await client.invitations.createInvitation({
    emailAddress: email,
    redirectUrl: new URL(routes.acceptInvitation, origin).toString(),
    publicMetadata: { [appAccessMetadataKey]: true },
    ignoreExisting: replaceExisting,
  });
}

export async function revokeInvitation(invitationId: string) {
  const client = await clerkClient();
  await client.invitations.revokeInvitation(invitationId);
}

/**
 * Clerk has no resend call, so a fresh invitation is sent and the old one is
 * then revoked. In that order a failure never leaves the person uninvited.
 */
export async function resendInvitation(invitationId: string, origin: string) {
  const pending = await listPendingInvitations();
  const invitation = pending.find((entry) => entry.id === invitationId);
  if (!invitation) throw new InvitationNotFoundError();
  await createInvitation(invitation.email, origin, true);
  await revokeInvitation(invitationId);
}

export class InvitationNotFoundError extends Error {}

const messages: Record<string, string> = {
  duplicate_record: "That email address has already been invited.",
  form_identifier_exists: "That email address already has an account.",
  form_param_format_invalid: "Enter a valid email address.",
  resource_not_found: "That invitation no longer exists.",
  invitation_already_revoked: "That invitation has already been revoked.",
  invitation_already_accepted: "That invitation has already been accepted.",
};

/** A message safe to show an administrator, without provider internals. */
export function describeClerkError(error: unknown, fallback: string) {
  if (error instanceof InvitationNotFoundError) return messages.resource_not_found;
  if (!isClerkAPIResponseError(error)) return fallback;
  const code = error.errors[0]?.code ?? "";
  return messages[code] ?? fallback;
}
