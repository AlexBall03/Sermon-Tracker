"use client";

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
  return (
    <AccountGate>
      {(user) => (
        // Keyed by person so a different sign-in never inherits half-typed values.
        <div key={user.id} className="space-y-9">
          <SettingsBlock title="Picture">
            <AvatarField user={user} />
          </SettingsBlock>
          <SettingsBlock title="Name">
            <ProfileForm user={user} />
          </SettingsBlock>
          <SettingsBlock
            title="Email addresses"
            description="Your primary address is where sign-in and account emails are sent. A new address must be verified before it can be used."
          >
            <EmailAddresses user={user} />
          </SettingsBlock>
        </div>
      )}
    </AccountGate>
  );
}

/** Password, connected sign-in providers, and signed-in devices. */
export function SecuritySettings() {
  return (
    <AccountGate>
      {(user) => (
        <div key={user.id} className="space-y-9">
          <SettingsBlock title="Password">
            <PasswordForm user={user} />
          </SettingsBlock>
          <SettingsBlock
            title="Connected accounts"
            description="Other ways to sign in to this account."
          >
            <ConnectedAccounts user={user} />
          </SettingsBlock>
          <SettingsBlock title="Devices" description="Where your account is signed in right now.">
            <SessionsList user={user} />
          </SettingsBlock>
        </div>
      )}
    </AccountGate>
  );
}
