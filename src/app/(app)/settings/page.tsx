import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { requireActiveUser } from "@/features/auth/access";
import { AccountInformation } from "@/features/settings/components/account-information";
import { ProfileSettings, SecuritySettings } from "@/features/settings/components/account-sections";
import { AppearanceSettings } from "@/features/settings/components/appearance-settings";
import { BibleSettings } from "@/features/settings/components/bible-settings";
import { SettingsSection } from "@/features/settings/components/settings-section";

export const metadata: Metadata = { title: "Settings" };

/**
 * Account management in the application's own interface. The sign-in provider
 * still owns identity, credentials, verification, and sessions: the profile
 * and security controls call it, and nothing here stores any of that.
 */
export default async function SettingsPage() {
  const user = await requireActiveUser();

  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader
        title="Settings"
        description="Your profile, how you sign in, and how Sermon Tracker looks on this device."
      />

      <SettingsSection
        id="profile"
        title="Profile"
        description="How you appear in Sermon Tracker, and the addresses on your account."
      >
        <ProfileSettings />
      </SettingsSection>

      <SettingsSection
        id="security"
        title="Security"
        description="Your password, connected accounts, and the devices you are signed in on. Some changes ask you to confirm it is you first."
      >
        <SecuritySettings />
      </SettingsSection>

      <SettingsSection
        id="appearance"
        title="Appearance"
        description="Light or dark. This is the same control as the one in the bar."
      >
        <AppearanceSettings />
      </SettingsSection>

      <SettingsSection
        id="bible"
        title="Bible"
        description="How the Bible reader behaves on this device."
      >
        <BibleSettings />
      </SettingsSection>

      <SettingsSection
        id="account"
        title="Account"
        description="Your place in this workspace. These details are for reference."
      >
        <AccountInformation user={user} />
      </SettingsSection>
    </div>
  );
}
