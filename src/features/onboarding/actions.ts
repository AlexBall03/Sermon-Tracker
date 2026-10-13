"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { storedPreferences } from "@/features/preferences/preferences";
import { resolvePreferences } from "@/features/preferences/resolve";
import { getAppSettings } from "@/features/preferences/settings";
import { dictionary } from "@/i18n";
import type { ActionResult } from "@/lib/action-result";
import { onboardingSteps, type OnboardingStep } from "./model";
import { advanceStep, completeOnboarding } from "./onboarding";

const stepSchema = z.enum(onboardingSteps);

/** What a setup action answers: the usual result, and the step now stored. */
export type OnboardingResult = ActionResult & { step?: OnboardingStep };

/*
 * The two writes of first-time setup. Each authorises itself, as an account
 * that may still be in setup (`"account"`), and takes the account from the
 * session: neither accepts one. They record progress and nothing else. The
 * profile, the language, and the translation are saved by their own actions
 * in features/preferences, which setup calls first.
 */

async function messages(user: Parameters<typeof storedPreferences>[0]) {
  const { spanishEnabled } = await getAppSettings();
  const { locale } = resolvePreferences(storedPreferences(user), spanishEnabled);
  return dictionary(locale, "onboarding").actions;
}

/**
 * Records that the account has reached a step of setup. Progress only moves
 * forward, so a stale or repeated request is answered with what is stored and
 * changes nothing; so is one from an account that is not in setup.
 */
export async function advanceOnboarding(step: unknown): Promise<OnboardingResult> {
  const actor = await authorize("account");
  if (!actor.ok) return actor;
  const t = await messages(actor.user);

  const parsed = stepSchema.safeParse(step);
  if (!parsed.success) return { ok: false, message: t.invalid };

  try {
    const state = await advanceStep(getDb(), actor.user.id, parsed.data);
    if (!state) return { ok: false, message: t.notSaved };
    return { ok: true, message: t.progressSaved, step: state.step };
  } catch (error) {
    console.error("Onboarding progress save failed:", describeDatabaseError(error));
    return { ok: false, message: t.notSaved };
  }
}

/**
 * Finishes setup for the account, once it has reached the last step. Asked
 * again, or by an account that never owed setup, it answers that it is done
 * and writes nothing.
 */
export async function finishOnboarding(): Promise<OnboardingResult> {
  const actor = await authorize("account");
  if (!actor.ok) return actor;
  const t = await messages(actor.user);

  try {
    const result = await completeOnboarding(getDb(), actor.user.id);
    if (result.code === "not_found") return { ok: false, message: t.notSaved };
    if (result.code === "not_ready") return { ok: false, message: t.notReady, step: result.step };
    // Every page was closed to the account until now.
    if (result.code === "completed") revalidatePath("/", "layout");
    return { ok: true, message: t.completed };
  } catch (error) {
    console.error("Onboarding completion failed:", describeDatabaseError(error));
    return { ok: false, message: t.notSaved };
  }
}
