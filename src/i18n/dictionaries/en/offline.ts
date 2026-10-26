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
      "Thoughts captured, and ideas and outlines changed, while the server could not be reached. They are only on this device until they are saved to your account.",
    empty: "Nothing is waiting. Everything you captured or changed is in your account.",
    badge: "On this device only",
    untitled: "Untitled",
    captured: (when: string) => `Captured ${when}`,
    changed: (when: string) => `Changed ${when}`,
    kinds: {
      "idea.create": "New idea",
      "idea.update": "Edited",
      "idea.archive": "Archived",
      "idea.restore": "Restored",
      "idea.delete": "Deleted",
      "outline.entry.add": "Point added",
      "outline.entry.update": "Edited",
      "outline.entry.references": "Passages changed",
      "outline.entry.move": "Moved",
      "outline.entry.remove": "Removed",
      "outline.numbering": "Numbering changed",
    },
    /** One row for all of an outline's changes. */
    outline: "Outline",
    outlineChanges: (count: number) =>
      count === 1 ? "1 change to this outline" : `${count} changes to this outline`,
    behind: "Waits for the earlier change to this idea.",
    conflicts: {
      stale: "This idea was changed in your account after you changed it here.",
      staleDelete: "This idea was changed in your account after you deleted it here.",
      differs: (fields: string) => `Different there: ${fields}.`,
      missing: "This idea was deleted from your account.",
      preached: "It has been preached, so it cannot be deleted. Its preaching record is kept.",
      outline: "It now has an outline, which deleting it would delete too.",
      outlineStale:
        "The points of this outline were changed in your account after you changed them here.",
      entryStale: "This part of the outline was changed in your account too, differently.",
      entryMissing: "This part of the outline was removed in your account.",
      placement: "Where it was to go is no longer in the outline.",
      missingOutline: "This outline was deleted from your account.",
      documentAuthoritative:
        "This outline became a sermon document in your account, so this change can't be added to it here. It's kept until you discard it.",
    },
    fields: {
      title: "title",
      notes: "notes",
      subject: "subject",
      passages: "passages",
      tags: "tags",
      classification: "classification",
    },
    choices: {
      keepMine: "Keep my version",
      deleteAnyway: "Delete anyway",
      useAccount: "Use my account's version",
      discard: "Discard my changes",
      keepIdea: "Keep the idea",
      saveAsNew: "Save as a new idea",
      archiveInstead: "Archive it instead",
      deleteWithOutline: "Delete it and its outline",
      applyMine: "Apply my changes to it",
      addAsPoint: "Add it as a new point",
      addAtEnd: "Add it as a point at the end",
    },
    discard: "Discard",
    discardTitle: "Discard this change?",
    discardBody:
      "It has not been saved to your account. Discarding it puts this idea back as your account has it, with any other change made to it here.",
    discardConfirm: "Discard",
    discardOutlineTitle: "Discard the changes to this outline?",
    discardOutlineBody:
      "None of them has been saved to your account. Discarding them puts this outline back as this device last downloaded it.",
    save: "Save now",
    saving: "Saving…",
    retry: "Try again",
    status: {
      waiting: "Waiting to sync",
      sending: "Syncing…",
      failed: "Not saved",
      conflict: "Needs your choice",
    },
    nextTry: (when: string) => `Trying again ${when}`,
    stopped: "Stopped trying by itself. Check your connection and try again.",
    rejected: "The server would not accept it as it is. Try again, or delete it.",
    missingTags: (count: number) =>
      count === 1
        ? "A tag on it was deleted since it was captured."
        : `${count} tags on it were deleted since it was captured.`,
    saveWithoutTags: "Save without the deleted tags",
    delete: "Delete",
    deleteTitle: "Delete this thought?",
    deleteBody: "It has not been saved to your account, so deleting it here deletes it for good.",
    keep: "Keep it",
    deleteConfirm: "Delete for good",
    count: (count: number) =>
      count === 1
        ? "1 change is waiting on this device"
        : `${count} changes are waiting on this device`,
    review: "Review",
    unavailable: "This browser is not letting Sermon Tracker keep anything on this device.",
  },
  sync: {
    statusTitle: "Sync Status",
    statusDescription:
      "What you keep on this device while offline is saved to your account by itself whenever the server can be reached. Nothing is lost if saving fails.",
    running: "Syncing…",
    paused: "Paused until you sign in again.",
    clear: "Everything on this device is in your account.",
    waiting: (count: number) => `${count} waiting to sync`,
    failed: (count: number) => `${count} not saved`,
    conflict: (count: number) => `${count} need your choice`,
    lastSync: (when: string) => `Last saved to your account ${when}`,
    never: "Nothing has been saved from this device yet.",
    now: "Sync now",
    queueTitle: "Waiting on this device",
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
    ideas: "Sermon ideas and points",
    ideasDescription:
      "A copy of your ideas on this device, to read, search, and change them with no connection. Changes are saved to your account when the connection returns.",
    ideasSwitch: "Keep my ideas on this device",
    ideasOff: "Your ideas are not kept on this device.",
    ideasKept: (count: number, when: string) =>
      `${count === 1 ? "1 idea" : `${count} ideas`} kept, brought up to date ${when}.`,
    ideasNever: "Not downloaded yet. They are downloaded by themselves while you are online.",
    ideasDownloading: (have: number, total: number) => `Downloading… ${have} of ${total} ideas.`,
    ideasPartial: (have: number, total: number) =>
      `Only ${have} of ${total} ideas are on this device so far.`,
    ideasFailed: "The last update could not finish. It will try again by itself.",
    ideasAuth: "The last update was refused. Sign in again to keep your ideas current.",
    ideasSize: (size: string) => `About ${size}.`,
    ideasRefresh: "Update now",
    ideasRemove: "Remove from this device",
    ideasRemoveTitle: "Remove your ideas from this device?",
    ideasRemoveBody:
      "The copy on this device is removed; your ideas stay in your account. Any idea with changes still waiting to sync is kept here until they are saved.",
    ideasRemoveConfirm: "Remove",
    outlines: "Sermon outlines",
    outlinesDescription:
      "A copy of your outlines on this device, to read and change them with no connection. Changes are saved to your account when the connection returns.",
    outlinesSwitch: "Keep my outlines on this device",
    outlinesOff: "Your outlines are not kept on this device.",
    outlinesKept: (count: number, when: string) =>
      `${count === 1 ? "1 outline" : `${count} outlines`} kept, brought up to date ${when}.`,
    outlinesNever: "Not downloaded yet. They are downloaded by themselves while you are online.",
    outlinesDownloading: (have: number, total: number) =>
      `Downloading… ${have} of ${total} outlines.`,
    outlinesPartial: (have: number, total: number) =>
      `Only ${have} of ${total} outlines are on this device so far.`,
    outlinesAuth: "The last update was refused. Sign in again to keep your outlines current.",
    outlinesRemoveTitle: "Remove your outlines from this device?",
    outlinesRemoveBody:
      "The copy on this device is removed; your outlines stay in your account. Any outline with changes still waiting to sync is kept here until they are saved.",
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
    ideasTitle: "Your ideas",
    ideasBody: (count: number) =>
      count === 1
        ? "1 idea is kept on this device. Read, search, and change it here."
        : `${count} ideas are kept on this device. Read, search, and change them here.`,
    openIdeas: "Open your ideas",
    outlinesTitle: "Your outlines",
    outlinesBody: (count: number) =>
      count === 1
        ? "1 outline is kept on this device. Read and change it here."
        : `${count} outlines are kept on this device. Read and change them here.`,
    openOutlines: "Open your outlines",
  },
  ideas: {
    copy: (when: string) =>
      `This is the copy kept on this device, last brought up to date ${when}. What you change here is saved to your account when the connection returns.`,
    copyNever:
      "This is the copy kept on this device. What you change here is saved to your account when the connection returns.",
    partial: (have: number, total: number) =>
      `Only ${have} of ${total} ideas had been downloaded to this device, so some are missing here. They are still in your account.`,
    notYet: "Your ideas are not on this device yet",
    notYetBody:
      "They are downloaded by themselves while you are signed in and online. Open Sermon Tracker once you are connected, and they will be here next time.",
    off: "Ideas are not kept on this device",
    offBody:
      "Keeping your ideas here is turned off in Settings, under Offline Storage. Turn it on while you are online to use them without a connection.",
    signedOut: "Sign in while online to keep your ideas on this device.",
    empty: "There are no ideas on this device yet.",
    missing: "This idea is not on this device",
    missingBody:
      "It may have been captured or changed after this device last downloaded your ideas. It is still in your account.",
    back: "Back to your ideas",
    connection: "Related ideas and the preaching record need a connection.",
    waiting: (count: number) =>
      count === 1 ? "1 change is waiting to sync." : `${count} changes are waiting to sync.`,
  },
  outlines: {
    copy: (when: string) =>
      `This is the copy kept on this device, last brought up to date ${when}. What you change here is saved to your account when the connection returns.`,
    copyNever:
      "This is the copy kept on this device. What you change here is saved to your account when the connection returns.",
    partial: (have: number, total: number) =>
      `Only ${have} of ${total} outlines had been downloaded to this device, so some are missing here. They are still in your account.`,
    notYet: "Your outlines are not on this device yet",
    notYetBody:
      "They are downloaded by themselves while you are signed in and online. Open Sermon Tracker once you are connected, and they will be here next time.",
    off: "Outlines are not kept on this device",
    offBody:
      "Keeping your outlines here is turned off in Settings, under Offline Storage. Turn it on while you are online to use them without a connection.",
    signedOut: "Sign in while online to keep your outlines on this device.",
    missing: "This outline is not on this device",
    missingBody:
      "It may have been made after this device last downloaded your outlines, or outlines may not be kept here. It is still in your account.",
    back: "Back to your outlines",
    waiting: (count: number) =>
      count === 1 ? "1 change is waiting to sync." : `${count} changes are waiting to sync.`,
  },
  notice: {
    title: "Sermon Tracker works offline now",
    body: "Your Bible translation is downloaded to this device so you can read it with no connection, and anything you capture while offline is kept here until it can be saved.",
    manage: "Manage offline storage",
    dismiss: "Dismiss",
  },
};
