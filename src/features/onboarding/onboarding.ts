import { and, eq, inArray } from "drizzle-orm";

import { users, type AppUser } from "@/db/schema";
import type { Database } from "@/db/types";
import {
  lastOnboardingStep,
  stepsBefore,
  type OnboardingStatus,
  type OnboardingStep,
} from "./model";

/*
 * Writing an account's first-time setup. Each write is one statement on the
 * caller's own row, with everything it depends on in its WHERE clause, so two
 * tabs, two devices, or the same request sent twice cannot disagree: the
 * second one changes nothing and is told what is stored.
 *
 * Nothing here writes the profile or a preference. Those are saved by
 * features/preferences, and setup calls them like any other form.
 */

/** Where an account's setup stands. */
export type OnboardingState = {
  status: OnboardingStatus;
  /** The furthest step reached. */
  step: OnboardingStep;
};

export function onboardingState(
  user: Pick<AppUser, "onboardingStatus" | "onboardingStep">,
): OnboardingState {
  return { status: user.onboardingStatus, step: user.onboardingStep };
}

async function readState(db: Pick<Database, "select">, userId: string) {
  const [row] = await db
    .select({ status: users.onboardingStatus, step: users.onboardingStep })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row as OnboardingState | undefined;
}

/**
 * Records that an account in setup has reached a step. It only ever moves
 * forward: a step at or behind the one stored (a second tab left on an earlier
 * step, a request sent twice) changes nothing. An account that is not in
 * setup is left alone. Answers what is stored afterwards, or undefined for an
 * account that does not exist.
 */
export async function advanceStep(
  db: Pick<Database, "select" | "update">,
  userId: string,
  step: OnboardingStep,
): Promise<OnboardingState | undefined> {
  const earlier = stepsBefore(step);
  if (earlier.length > 0) {
    await db
      .update(users)
      .set({ onboardingStep: step })
      .where(
        and(
          eq(users.id, userId),
          eq(users.onboardingStatus, "pending"),
          inArray(users.onboardingStep, earlier),
        ),
      );
  }
  return readState(db, userId);
}

export type CompleteResult =
  /** Setup was finished by this call. */
  | { code: "completed" }
  /** There was nothing to finish: it was already, or was never owed. Nothing was written. */
  | { code: "already" }
  /** The account has not reached the last step. Nothing was written. */
  | { code: "not_ready"; step: OnboardingStep }
  | { code: "not_found" };

/**
 * Finishes an account's setup. Only an account in setup that has reached the
 * last step is changed, so it cannot be finished by accident or ahead of
 * time, and finishing twice writes once. What the account filled in on the
 * way has no say: every detail is optional.
 */
export async function completeOnboarding(
  db: Pick<Database, "select" | "update">,
  userId: string,
): Promise<CompleteResult> {
  const finished = await db
    .update(users)
    .set({ onboardingStatus: "completed", onboardingCompletedAt: new Date() })
    .where(
      and(
        eq(users.id, userId),
        eq(users.onboardingStatus, "pending"),
        eq(users.onboardingStep, lastOnboardingStep),
      ),
    )
    .returning({ id: users.id });
  if (finished.length > 0) return { code: "completed" };

  const state = await readState(db, userId);
  if (!state) return { code: "not_found" };
  if (state.status !== "pending") return { code: "already" };
  return { code: "not_ready", step: state.step };
}
