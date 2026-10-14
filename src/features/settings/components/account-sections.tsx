"use client";

import { useT } from "@/i18n/client";
import { AccountGate } from "./account-gate";
import { AvatarField } from "./avatar-field";
import { ConnectedAccounts } from "./connected-accounts";
import { EmailAddresses } from "./email-addresses";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { SessionsList } from "./sessions-list";
import { SettingsBlock } from "./settings-section";

/** Profile controls, once the identity has loaded in the browser. */
export function ProfileSettings() {
  const t = useT("settings").blocks;
  return (
    <AccountGate>
      {(user) => (
        // Keyed by person so a different sign-in never inherits half-typed values.
        <div key={user.id} className="space-y-5">
          <SettingsBlock title={t.picture}>
            <AvatarField user={user} />
          </SettingsBlock>
          <SettingsBlock title={t.name}>
            <ProfileForm user={user} />
          </SettingsBlock>
          <SettingsBlock title={t.emails} description={t.emailsDescription}>
            <EmailAddresses user={user} />
          </SettingsBlock>
        </div>
      )}
    </AccountGate>
  );
}

/** Password, connected sign-in providers, and signed-in devices. */
export function SecuritySettings() {
  const t = useT("settings").blocks;
  return (
    <AccountGate>
      {(user) => (
        <div key={user.id} className="space-y-5">
          <SettingsBlock title={t.password}>
            <PasswordForm user={user} />
          </SettingsBlock>
          <SettingsBlock title={t.connected} description={t.connectedDescription}>
            <ConnectedAccounts user={user} />
          </SettingsBlock>
          <SettingsBlock title={t.devices} description={t.devicesDescription}>
            <SessionsList user={user} />
          </SettingsBlock>
        </div>
      )}
    </AccountGate>
  );
}
