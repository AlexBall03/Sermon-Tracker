/** Settings: the page, its sections, and the preferences kept on the account or the device. */
export const settings = {
  page: {
    title: "Settings",
    description: "Your profile, how you sign in, your language, and how Sermon Tracker looks.",
  },
  sections: {
    profile: {
      title: "Profile",
      description: "How you appear in Sermon Tracker, and the addresses on your account.",
    },
    security: {
      title: "Security",
      description:
        "Your password, connected accounts, and the devices you are signed in on. Some changes ask you to confirm it is you first.",
    },
    language: {
      title: "Language",
      description:
        "The language Sermon Tracker is written in, and the Bible you read. Both are saved to your account.",
    },
    appearance: {
      title: "Appearance",
      description: "Light or dark. This is the same control as the one in the bar.",
    },
    bible: {
      title: "Bible",
      description: "How the Bible reader behaves on this device.",
    },
    account: {
      title: "Account",
      description: "Your place in this workspace. These details are for reference.",
    },
  },
  blocks: {
    picture: "Picture",
    name: "Name",
    emails: "Email addresses",
    emailsDescription:
      "Your primary address is where sign-in and account emails are sent. A new address must be verified before it can be used.",
    password: "Password",
    connected: "Connected accounts",
    connectedDescription: "Other ways to sign in to this account.",
    devices: "Devices",
    devicesDescription: "Where your account is signed in right now.",
  },
  language: {
    interface: "Interface language",
    interfaceHelp:
      "Menus, buttons, and messages. What you have written yourself is never translated.",
    translation: "Bible translation",
    follow: (translation: string) => `Match the interface language (${translation})`,
    translationHelp:
      "The translation the Bible opens in, and the one quoted beside your ideas. You can also change it in the reader, and read two side by side.",
    saved: "Language saved.",
    translationSaved: (translation: string) => `Your Bible translation is now the ${translation}.`,
    followSaved: "Your Bible translation now follows the interface language.",
    invalid: "That choice was not valid.",
    spanishOff: "Spanish is not available right now.",
    translationOff: "That translation is not available right now.",
    notSaved: "Your choice could not be saved. Try again.",
    offline: "That did not reach the server. Check your connection and try again.",
    unavailable:
      "Spanish is switched off for now, so Sermon Tracker is in English and the Bible is the King James Version. What you chose before is kept, and comes back when Spanish does.",
  },
  appearance: {
    remembered: "Your choice is remembered on this device.",
    following: "Following your device's setting until you choose one.",
    useDevice: "Use device setting",
  },
  bible: {
    copyShortcut: "Copy shortcut",
    copyKinds: { text: "Verse text", reference: "Reference", link: "Link" },
    copyHelp:
      "What Ctrl+C (Command+C on a Mac) copies when verses are selected in the Bible. The selection is cleared once it has been copied. The buttons beside a selection copy the text, the reference, or a link whatever is chosen here.",
  },
  account: {
    role: "Role",
    administrator: "Administrator",
    standardUser: "Standard user",
    status: "Status",
    active: "Active",
    disabled: "Disabled",
    memberSince: "Member since",
    managed: "Roles and access are managed by an administrator.",
  },
};
