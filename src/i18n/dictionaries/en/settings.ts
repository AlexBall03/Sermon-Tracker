/** Settings: the overview, its categories, and the preferences kept on the account or the device. */
export const settings = {
  page: {
    title: "Settings",
    description:
      "Your profile, your language and Bible, how Sermon Tracker looks and works on this device, and how you sign in.",
  },
  nav: {
    label: "Settings categories",
    back: "Settings",
    soon: "Soon",
  },
  /** The categories, in the order they are shown (features/settings/categories.ts). */
  categories: {
    profile: {
      title: "Profile",
      description: "Your name, picture, and email addresses, and your church and ministry.",
    },
    bible: {
      title: "Bible & Language",
      description:
        "The language Sermon Tracker is written in, the Bible you read, and how the Bible reader behaves.",
    },
    appearance: {
      title: "Appearance",
      description: "Light or dark, or following your device.",
    },
    app: {
      title: "App & Experience",
      description: "Install Sermon Tracker, take the product tour again, or run account setup.",
    },
    offline: {
      title: "Offline Storage",
      description:
        "What this device keeps for working without a connection: captures, Bible downloads, and the space they use.",
    },
    sync: {
      title: "Synchronization",
      description: "Keeping your work in step across devices.",
    },
    account: {
      title: "Account & Security",
      description:
        "Your access, your password, connected accounts, and the devices you are signed in on. Some changes ask you to confirm it is you first.",
    },
  },
  sync: {
    title: "Coming in a later update",
    body: "Synchronization will keep the work you do on this device in step with your account on every other one. There is nothing to set up yet.",
  },
  unsaved: "Your changes on this page have not been saved.",
  blocks: {
    ministry: "Church & Ministry",
    ministryDescription:
      "Where you serve and what you do there. All of it is optional, private to your account, and changes nothing about your access.",
    language: "Language and translation",
    languageDescription: "Saved to your account, so they follow you to every device.",
    reader: "Bible reader",
    readerDescription: "Kept on this device.",
    theme: "Theme",
    setup: "Account setup",
    setupDescription:
      "Go through the setup steps again at any time: your church and ministry, your language and Bible, and the theme. Nothing changes unless you change it.",
    runSetup: "Run Account Setup",
    tour: "Product tour",
    tourDescription:
      "A short walk through the application's main pages: the dashboard, capture, the library, the Bible, outlines, and the Preaching Record. It changes nothing.",
    restartTour: "Restart Product Tour",
    access: "Your access",
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
  devices: {
    showMore: (count: number) => `Show ${count} more`,
    showFewer: "Show fewer",
    signOutOthers: "Sign out all other devices",
    signOutOthersTitle: "Sign out all other devices?",
    signOutOthersDescription: (count: number) =>
      count === 1
        ? "The other device will be signed out of Sermon Tracker and will need to sign in again. This device stays signed in."
        : `The ${count} other devices will be signed out of Sermon Tracker and will need to sign in again. This device stays signed in.`,
    signOutOthersConfirm: "Sign out the others",
    signedOutOthers: "Every other device was signed out.",
    signOutOthersFailed: "Some devices could not be signed out. Try again.",
  },
  ministry: {
    churchName: "Church name",
    churchNamePlaceholder: "Grace Baptist Church",
    ministryRole: "Ministry role",
    ministryRolePlaceholder: "Pastor, evangelist, preaching student…",
    ministryRoleHint:
      "In your own words. It describes you and does not change what you can do in Sermon Tracker.",
    optional: "(optional)",
    save: "Save",
    saving: "Saving…",
    saved: "Your church and ministry details have been saved.",
    preachingClass: "I attend preaching class",
    preachingClassHelp:
      "Offers what is meant for preaching class, such as suggesting Preaching Class as a context when you record a sermon. Turning it off removes nothing you have recorded.",
    preachingClassOn: "Saved. Preaching class is on.",
    preachingClassOff: "Saved. Preaching class is off.",
    churchTooLong: (limit: number) => `Use ${limit} characters or fewer for the church name.`,
    roleTooLong: (limit: number) => `Use ${limit} characters or fewer for the ministry role.`,
    invalid: "Those details were not valid.",
    notSaved: "Your details could not be saved. Try again.",
    offline: "That did not reach the server. Check your connection and try again.",
  },
  language: {
    interface: "Interface language",
    interfaceHelp:
      "Menus, buttons, and messages. What you have written yourself is never translated. Changing it changes the Bible translation to match, and you can choose another below.",
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
