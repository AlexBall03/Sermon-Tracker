// First-time setup, and the same steps run again from Settings. The fields of
// the church and ministry step, and of the language step, are worded in the
// settings dictionary, where the same controls already are.
export const onboarding = {
  metaTitle: "Account setup",
  progress: {
    label: "Setup progress",
    position: (step: number, total: number) => `Step ${step} of ${total}`,
    done: "Done",
    current: "Current step",
  },
  steps: {
    welcome: "Welcome",
    ministry: "Church & Ministry",
    preferences: "Preferences",
    finish: "All set",
  },
  exit: "Exit setup",
  back: "Back",
  continue: "Continue",
  saving: "Saving…",
  welcome: {
    eyebrow: "Welcome to Sermon Tracker",
    title: "One place for every sermon you are working toward",
    body: "Sermon Tracker keeps an idea from the moment it comes to you until the day it is preached, and remembers it afterwards.",
    features: [
      {
        title: "Capture",
        body: "Save a sermon idea or a single point in seconds, before it is forgotten.",
      },
      {
        title: "Organize and revisit",
        body: "Sort ideas by status, tag them, and come back to the ones left waiting.",
      },
      {
        title: "Study Scripture",
        body: "Read the Bible, save and highlight passages, and attach them to an idea.",
      },
      {
        title: "Outline",
        body: "Give a sermon its structure: points, subpoints, notes, and passages.",
      },
      {
        title: "Record preaching",
        body: "Keep track of when and where each sermon was preached.",
      },
    ],
    outlineNote:
      "The outline holds a sermon's structure. It does not replace the place where you write your manuscript.",
    start: "Get Started",
    lead: "Setup takes about a minute. Every detail is optional.",
  },
  ministry: {
    title: "Your church and ministry",
    body: "Tell Sermon Tracker a little about where you serve. All of it is optional and private to your account, and you can leave any of it blank.",
  },
  preferences: {
    title: "Your preferences",
    body: "Choose how Sermon Tracker reads and looks. The defaults are fine to keep.",
    language: "Language and translation",
    appearance: "Appearance",
    appearanceHelp: "Kept on this device, not on your account.",
    theme: { system: "System", light: "Light", dark: "Dark" },
  },
  finish: {
    title: "You are all set",
    body: "Your details and preferences are saved. You can change any of them later in Settings.",
    reviewBody: "Anything you changed is saved. You can change it again at any time in Settings.",
    open: "Open Dashboard",
    opening: "Opening…",
    settings: "Back to Settings",
  },
  actions: {
    invalid: "That step is not part of setup.",
    notSaved: "Your progress could not be saved. Try again.",
    notReady: "Finish the earlier steps first.",
    progressSaved: "Progress saved.",
    completed: "Setup is complete.",
    offline: "That did not reach the server. Check your connection and try again.",
  },
};
