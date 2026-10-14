"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
import { dictionary } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";
import { completeTour, dismissTour, offerTour } from "./tour";

/*
 * The tour's three writes. Each authorises itself as an active account that
 * has finished setup (the tour runs in the application, after it), takes the
 * account from the session, and accepts nothing: there is no account, state,
 * or step in its input to tamper with. Asked again, each answers as before
 * and writes nothing. Only the dashboard shows anything that depends on them,
 * so only it is revalidated, and only when a row changed.
 */

type TourWrite = typeof offerTour;

async function record(write: TourWrite, label: string): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const t = dictionary((await getPreferences()).locale, "tour").actions;
  try {
    if (await write(getDb(), actor.user.id)) revalidatePath(routes.dashboard);
    return { ok: true, message: t.saved };
  } catch (error) {
    console.error(`Tour ${label} failed:`, describeDatabaseError(error));
    return { ok: false, message: t.notSaved };
  }
}

/** The dashboard has shown the invitation. */
export async function markTourOffered(): Promise<ActionResult> {
  return record(offerTour, "offer");
}

/** "Maybe Later", or the tour skipped before its end. */
export async function dismissProductTour(): Promise<ActionResult> {
  return record(dismissTour, "dismissal");
}

/** The tour was followed to its end. */
export async function completeProductTour(): Promise<ActionResult> {
  return record(completeTour, "completion");
}
