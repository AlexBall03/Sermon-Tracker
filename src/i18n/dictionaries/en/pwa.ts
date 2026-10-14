/** The installed application: the offline page, installing it, and taking an update. */
export const pwa = {
  offline: {
    title: "You're offline",
    body: "Sermon Tracker needs a connection to open this page. Nothing was lost and you have not been signed out: everything you saved is kept on the server.",
    retry: "Try again",
    waiting: "This page will try again by itself when the connection returns.",
    pageTitle: "Offline",
  },
  install: {
    title: "Install the app",
    description:
      "Open Sermon Tracker from your home screen, dock, or app list, in its own window, straight into your workspace. It still needs a connection; working offline is not built yet.",
    installed: "You're using the installed app.",
    justInstalled:
      "Sermon Tracker is installed. Open it from your home screen or app list; it opens on your dashboard.",
    button: "Install Sermon Tracker",
    installing: "Installing…",
    dismissed: "Not installed. You can install it whenever you like.",
    signIn:
      "The first time it opens it may ask you to sign in, because some devices keep the installed app's sign-in apart from the browser's.",
    stepsLabel: "How to install it",
    guides: {
      ios: [
        "Tap the Share button: at the foot of the screen in Safari, or beside the address in other browsers.",
        "Scroll down and tap Add to Home Screen.",
        "Tap Add. Sermon Tracker appears on your home screen.",
      ],
      macSafari: [
        "In Safari's menu bar, choose File, then Add to Dock.",
        "Click Add. Sermon Tracker opens from the Dock in its own window.",
      ],
      android: [
        "Open your browser's menu (⋮).",
        "Choose Install app, or Add to Home screen.",
        "Confirm. Sermon Tracker appears with your other apps.",
      ],
      desktop: [
        "Click the install icon at the right of the address bar, or open the browser's menu and choose Install Sermon Tracker.",
        "If neither is there, it may already be installed: look for Sermon Tracker in your apps.",
      ],
      unknown: [
        "Open your browser's menu or Share button.",
        "Look for Install app, Add to Home Screen, or Add to Dock.",
      ],
    },
    unsupported:
      "This browser cannot install apps. Open Sermon Tracker in Chrome, Edge, or Safari to install it.",
  },
  update: {
    title: "A new version of Sermon Tracker is ready.",
    body: "Update to start using it. The page reloads once.",
    update: "Update",
    updating: "Updating…",
    later: "Later",
    unsaved: "Some of your work is not saved yet. Save it or let it finish saving, then update.",
  },
};
