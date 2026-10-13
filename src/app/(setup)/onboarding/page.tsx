import type { Metadata } from "next";

import { requireAccount } from "@/features/auth/access";
import { OnboardingWizard } from "@/features/onboarding/components/onboarding-wizard";
import { SetupSignOut } from "@/features/onboarding/components/setup-sign-out";
import { needsOnboarding } from "@/features/onboarding/model";
import { getPreferences } from "@/features/preferences/current";
import { storedProfile } from "@/features/preferences/preferences";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("onboarding")).metaTitle };
}

/**
 * Account setup. A new account is sent here from every other page until it
 * has finished, and resumes at the furthest step it reached, on any device.
 * An account that owes no setup may open it too, from Settings: it sees the
 * same steps with what it has saved, may leave at any point, and nothing
 * about its setup is written by opening or finishing them.
 *
 * It asks for an account, not for one that has finished setup, which is what
 * every other page asks for.
 */
export default async function OnboardingPage() {
  const user = await requireAccount();
  const preferences = await getPreferences();
  const required = needsOnboarding(user);

  return (
    // The page says its language itself, so it reads right the moment it is changed here.
    <I18nProvider locale={preferences.locale}>
      <OnboardingWizard
        // Keyed by person so a different sign-in never inherits half-typed values.
        key={user.id}
        mode={required ? "required" : "review"}
        initialStep={required ? user.onboardingStep : undefined}
        profile={storedProfile(user)}
        preferences={preferences}
        signOut={<SetupSignOut />}
      />
    </I18nProvider>
  );
}
