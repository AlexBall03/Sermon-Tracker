/** Working offline: Bible downloads, captures kept on the device, and the offline page. */
export const offline = {
  capture: {
    keptTitle: "Kept on this device",
    kept: "Your thought is kept on this device. It is not in your account yet.",
    notKept:
      "The server could not be reached, and this device could not keep your thought either. It is still here; copy it somewhere safe or try again.",
  },
  pending: {
    title: "Waiting on this device",
    description:
      "Thoughts captured while the server could not be reached. They are only on this device until they are saved to your account.",
    empty: "Nothing is waiting. Everything you captured is in your account.",
    badge: "On this device only",
    untitled: "Untitled",
    captured: (when: string) => `Captured ${when}`,
    save: "Save to account",
    saving: "Saving…",
    saved: "Saved to your account.",
    notSaved: "Still not saved. Check your connection and try again.",
    delete: "Delete",
    deleteTitle: "Delete this thought?",
    deleteBody: "It has not been saved to your account, so deleting it here deletes it for good.",
    keep: "Keep it",
    deleteConfirm: "Delete for good",
    count: (count: number) =>
      count === 1
        ? "1 thought is waiting on this device"
        : `${count} thoughts are waiting on this device`,
    review: "Review",
    unavailable: "This browser is not letting Sermon Tracker keep anything on this device.",
  },
  settings: {
    title: "Offline Storage",
    description:
      "What this device keeps so you can work without a connection. These choices are this device's and this browser's only.",
    captureTitle: "Quick Capture",
    captureDescription:
      "When the server cannot be reached, keep what you capture on this device instead of losing it.",
    captureSwitch: "Keep captures on this device when offline",
    captureOff:
      "Turned off, a capture that cannot reach the server stays in the form for you to try again. Anything already waiting is kept.",
    bibleTitle: "Bible translations",
    bibleDescription:
      "A downloaded translation can be read with no connection, in this browser and in the installed app.",
    autoSwitch: "Keep my reading translation downloaded",
    autoDescription: "Downloads by itself in the background, once, and again only when it changes.",
    automatic: "Kept automatically",
    status: {
      none: "Not downloaded",
      downloading: (percent: number) => `Downloading… ${percent}%`,
      paused: "Download interrupted",
      ready: (size: string) => `Downloaded · about ${size}`,
      outdated: "An updated text is available",
      busy: "Downloading in another window",
    },
    errors: {
      network: "The download stopped because the connection was lost.",
      quota: "There is not enough room on this device. Free some space, then try again.",
      integrity: "The download did not match the published text, so it was not kept. Try again.",
      unavailable: "This translation is not available to your account right now.",
      storage: "This browser would not let the translation be kept on this device.",
    },
    download: "Download",
    retry: "Try again",
    resume: "Resume",
    remove: "Remove",
    removeTitle: (name: string) => `Remove ${name} from this device?`,
    removeBody:
      "It will no longer be readable offline. Your favorites, highlights, and ideas are not affected, and you can download it again at any time.",
    removeConfirm: "Remove",
    cancel: "Cancel",
    moreTitle: "More offline content",
    moreDescription: "Coming in a later update. Nothing here is kept on this device yet.",
    ideas: "Sermon ideas and points",
    outlines: "Sermon outlines",
    later: "Coming later",
    storageTitle: "Storage on this device",
    storageUsage: (used: string, total: string) => `About ${used} used of about ${total} available`,
    storageUnknown: "This browser does not say how much space it has.",
    storageLow:
      "This device is nearly out of space for Sermon Tracker. Downloads may fail until some is freed.",
    storageUnavailable:
      "This browser is not letting Sermon Tracker keep anything on this device (a private window can do this). Reading and capturing still work online.",
    storageNote: "Removing a translation never removes thoughts waiting to be saved.",
  },
  shell: {
    title: "You're offline",
    body: "Sermon Tracker can't reach the server right now. You haven't been signed out.",
    readTitle: "Read the Bible",
    readBody: (names: string) => `${names} is on this device and can be read now.`,
    read: "Open the Bible",
    noBible:
      "No translation is downloaded on this device yet. Next time you're online, download one in Settings, under Offline Storage.",
    captureTitle: "Capture a thought",
    captureBody: "It is kept on this device and saved to your account once you are back online.",
    capture: "Capture",
    signedOut: "Sign in while online to capture thoughts on this device.",
    back: "Back",
    readerBadge: "Offline",
  },
  notice: {
    title: "Sermon Tracker works offline now",
    body: "Your Bible translation is downloaded to this device so you can read it with no connection, and anything you capture while offline is kept here until it can be saved.",
    manage: "Manage offline storage",
    dismiss: "Dismiss",
  },
};
