"use server";

import { revalidatePath } from "next/cache";
import { clerkClient } from "@clerk/nextjs/server";

import { authorize } from "@/features/auth/access";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { nameSchema } from "./schemas";

/**
 * Saves the caller's own name. The account comes from the session and nothing
 * else: there is no user ID parameter, and any extra field in the input is
 * dropped by the schema. Credentials are not changed here; those go through
 * the sign-in provider's own verified flows in the browser.
 */
export async function updateProfileName(input: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;

  const parsed = nameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That name is not valid." };
  }

  try {
    const client = await clerkClient();
    await client.users.updateUser(actor.user.clerkUserId, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    });
  } catch {
    console.error("Profile name update failed.");
    return { ok: false, message: "Your name could not be saved. Try again." };
  }

  revalidatePath(routes.dashboard);
  return { ok: true, message: "Your name has been saved." };
}
