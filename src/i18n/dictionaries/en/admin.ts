/** Administration: people, invitations, and the switch for Spanish. */
export const admin = {
  page: {
    metaTitle: "Administration",
    title: "People and access",
    description:
      "Sermon Tracker is invitation-only. Invite people here, and manage their roles and access.",
    users: "Users",
    identitiesUnavailable:
      "Names and email addresses could not be loaded from the sign-in provider.",
    invitations: "Invitations",
    invitationsDescription:
      "An invited person receives an email with a link to create their account.",
    languages: "Languages",
    languagesDescription:
      "Spanish is the Spanish interface and the Reina-Valera Gómez Bible together. English and the King James Version are always available.",
  },
  stats: {
    registered: "Registered users",
    active: "Active",
    disabled: "Disabled",
    pending: "Pending invitations",
  },
  users: {
    caption: "People with access to Sermon Tracker",
    person: "Person",
    role: "Role",
    status: "Status",
    added: "Added",
    actions: "Actions",
    admin: "Admin",
    user: "User",
    active: "Active",
    disabled: "Disabled",
    unknown: "Unknown",
    thisPerson: "This person",
    you: " (you)",
    identityRemoved: "Sign-in identity removed",
    actionsFor: (name: string) => `Actions for ${name}`,
    removeAdmin: {
      title: "Remove administrator access?",
      description: (name: string) =>
        `${name} will no longer be able to invite people or manage accounts.`,
      confirm: "Make standard user",
    },
    makeAdmin: {
      title: "Make this person an administrator?",
      description: (name: string) =>
        `${name} will be able to invite people, change roles, and disable accounts.`,
      confirm: "Make administrator",
    },
    disable: {
      title: "Disable this account?",
      description: (name: string) =>
        `${name} will be locked out of Sermon Tracker straight away. Nothing is deleted, and you can re-enable the account later.`,
      confirm: "Disable account",
    },
    enable: {
      title: "Re-enable this account?",
      description: (name: string) => `${name} will be able to use Sermon Tracker again.`,
      confirm: "Re-enable account",
    },
  },
  invitations: {
    email: "Email address",
    sending: "Sending…",
    send: "Send invitation",
    unavailable:
      "Pending invitations could not be loaded from the sign-in provider. Reload to try again.",
    none: "No invitations are waiting. Enter an email address above to send one.",
    pending: "Pending",
    sent: "Sent",
    resend: "Resend",
    resendTo: (email: string) => `Resend invitation to ${email}`,
    revoke: "Revoke",
    revokeTo: (email: string) => `Revoke invitation to ${email}`,
    revokeTitle: "Revoke this invitation?",
    revokeDescription: (email: string) =>
      `The link sent to ${email} will stop working. You can invite them again later.`,
    revokeConfirm: "Revoke invitation",
  },
  language: {
    label: "Spanish",
    on: "On",
    off: "Off",
    onDetail:
      "People can choose Spanish for the interface, and read, search, and mark the Reina-Valera Gómez.",
    offDetail:
      "Everyone sees Sermon Tracker in English and reads the King James Version. Nobody's saved choices, favorites, or highlights are deleted; they return when Spanish is turned back on.",
    turnOffTitle: "Turn Spanish off for everyone?",
    turnOffDescription:
      "The Spanish interface and the Reina-Valera Gómez Bible become unavailable to every account at once, yours included. Nothing is deleted: preferences, favorites, and highlights are kept and come back when you turn it on again.",
    turnOffConfirm: "Turn Spanish off",
    turnedOn: "Spanish is on.",
    turnedOff: "Spanish is off. Everyone now has English and the King James Version.",
    notSaved: "The change could not be saved. Try again.",
    offline: "That did not reach the server. Check your connection and try again.",
  },
  actions: {
    invalid: "That request was not valid.",
    ownAccount: "You cannot change your own account. Ask another administrator.",
    lastAdmin: "There must always be at least one active administrator.",
    userMissing: "That user no longer exists.",
    notSaved: "The change could not be saved. Try again.",
    nowAdmin: "User is now an administrator.",
    nowUser: "User is now a standard user.",
    enabled: "Account re-enabled.",
    disabled: "Account disabled.",
    invalidEmail: "Enter a valid email address.",
    invited: (email: string) => `Invitation sent to ${email}.`,
    notInvited: "The invitation could not be sent. Try again.",
    revoked: "Invitation revoked.",
    notRevoked: "The invitation could not be revoked. Try again.",
    resent: "Invitation sent again.",
    notResent: "The invitation could not be sent again. Try again.",
  },
};
