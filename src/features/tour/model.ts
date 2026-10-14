import type { OnboardingStatus, TourState } from "@/features/onboarding/model";

/*
 * The product tour, as it is kept on an account and as it is walked. No
 * server code: the dashboard, the actions, and the overlay read these.
 *
 * `users.tour_state` (features/onboarding/model.ts) says where the tour stands:
 * - `not_offered`: nothing has happened. Every account starts here.
 * - `offered`: the invitation has been shown on the dashboard.
 * - `dismissed`: the person said "Maybe Later" or skipped the tour.
 * - `completed`: the person went through to the end. It stays so: running the
 *   tour again from Settings and skipping it never takes that back.
 *
 * Running the tour again is a replay, not a state: starting it writes nothing,
 * and the step it is on is the browser's alone.
 */

/**
 * Whether the dashboard invites the account to take the tour: an account that
 * has just been through setup itself, until it answers. An account from
 * before setup existed (`grandfathered`) is not interrupted with it; it can
 * run the tour from Settings like anyone else.
 */
export function shouldOfferTour(user: {
  onboardingStatus: OnboardingStatus;
  tourState: TourState;
}): boolean {
  return (
    user.onboardingStatus === "completed" &&
    (user.tourState === "not_offered" || user.tourState === "offered")
  );
}

/** The tour's stops, in order. Their words are in the `tour` dictionary under `steps`. */
export const tourStepIds = [
  "dashboard",
  "capture",
  "library",
  "bible",
  "outlines",
  "preaching",
  "ready",
] as const;
export type TourStepId = (typeof tourStepIds)[number];

export type TourStep = {
  id: TourStepId;
  /** The page the step is shown on. The tour goes there with the application's own router. */
  href: string;
  /**
   * What is pointed out, as `data-tour` names in order of preference: the
   * first one on the page and visible is used. From `md` up the bar's names,
   * below it the tab bar's. None found, or none given, and the step is shown
   * on its own in the middle of the screen.
   */
  wide: readonly string[];
  narrow: readonly string[];
};

/** The dashboard's sections a person can be told about, as their `data-tour` names. */
export const dashboardSections = [
  "continue-working",
  "revisit-ideas",
  "recent-ideas",
  "recent-preaching",
  "at-a-glance",
] as const;
export type DashboardSection = (typeof dashboardSections)[number];
