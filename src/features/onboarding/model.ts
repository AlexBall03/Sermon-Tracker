/*
 * First-time setup, as it is kept on an account. No server code: the table,
 * the access helpers, the actions, and the wizard all read these lists.
 *
 * Whether an account must go through setup is its status and nothing else. It
 * is never worked out from what the account has filled in, when it was made,
 * or what it has saved.
 */

/**
 * - `pending`: a new account that has not finished setup, and must.
 * - `completed`: it finished the wizard.
 * - `grandfathered`: it existed before there was a setup, and never owed one.
 */
export const onboardingStatuses = ["pending", "completed", "grandfathered"] as const;
export type OnboardingStatus = (typeof onboardingStatuses)[number];

/** The wizard's steps, in order. An account keeps the furthest one it reached. */
export const onboardingSteps = ["welcome", "ministry", "preferences", "finish"] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

export const firstOnboardingStep: OnboardingStep = onboardingSteps[0];
export const lastOnboardingStep: OnboardingStep = onboardingSteps[onboardingSteps.length - 1];

/**
 * Where the product tour stands for an account. Phase 4A only keeps the
 * column: offering, dismissing, and finishing the tour are Phase 4B.
 */
export const tourStates = ["not_offered", "offered", "dismissed", "completed"] as const;
export type TourState = (typeof tourStates)[number];

/** Whether the account has to finish setup before it may use the application. */
export function needsOnboarding(user: { onboardingStatus: OnboardingStatus }): boolean {
  return user.onboardingStatus === "pending";
}

/** The steps that come before one, which are the ones it may be advanced from. */
export function stepsBefore(step: OnboardingStep): OnboardingStep[] {
  return onboardingSteps.slice(0, onboardingSteps.indexOf(step));
}

/** The step after one, or itself at the end. */
export function stepAfter(step: OnboardingStep): OnboardingStep {
  return onboardingSteps[Math.min(onboardingSteps.indexOf(step) + 1, onboardingSteps.length - 1)];
}

/** The step before one, or itself at the start. */
export function stepBefore(step: OnboardingStep): OnboardingStep {
  return onboardingSteps[Math.max(onboardingSteps.indexOf(step) - 1, 0)];
}
