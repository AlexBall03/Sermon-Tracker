/** Static site configuration shared by metadata, navigation, and copy. */
export const siteConfig = {
  name: "Sermon Tracker",
  tagline: "Capture. Develop. Preach.",
  description:
    "Sermon Tracker is where preachers capture sermon and point ideas, develop them, outline them, and keep a record of what they have preached.",
  /** Canonical production origin. Previews and local builds still point here. */
  url: "https://sermontracker.com",
  /** Credited in the public footer. */
  developer: { name: "Alexander D. Ball", url: "https://alexball.dev" },
} as const;

/**
 * Route map, the one source for links and robots rules. `/library` is the
 * library's overview and the main navigation's destination; its three
 * sections are each at an address of their own beneath it, and the addresses
 * two of them used to have redirect (next.config.ts). An idea is at `/library/<id>`; a place in the Bible is
 * `/bible?book=&chapter=&verse=` (features/scripture/reader-location.ts). An
 * outline's editor is at `/outlines/<id>`, `/outlines/new?sermon=<id>` is
 * where a sermon is given one, and `/outlines` is the overview of them all
 * (features/outlines/outlines-query.ts).
 */
export const routes = {
  home: "/",
  signIn: "/sign-in",
  acceptInvitation: "/accept-invitation",
  accessDenied: "/access-denied",
  /** First-time setup, and the same steps again from Settings. Outside the application shell. */
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  library: "/library",
  /** The library's sections. Reached from the overview and from each other: the navigation names only the library. */
  sermonIdeas: "/library/sermon-ideas",
  savedScripture: "/library/saved-scripture",
  preachingRecord: "/library/preaching-record",
  bible: "/bible",
  outlines: "/outlines",
  settings: "/settings",
  admin: "/admin",
  /** What the service worker shows for a page the network could not reach (features/pwa). */
  offline: "/offline",
} as const;

/** Paths that must never be indexed, now or once they exist. */
export const privateRoutes = [
  routes.signIn,
  routes.acceptInvitation,
  routes.accessDenied,
  routes.onboarding,
  routes.dashboard,
  routes.library,
  routes.sermonIdeas,
  routes.savedScripture,
  routes.preachingRecord,
  routes.bible,
  routes.outlines,
  routes.settings,
  routes.admin,
  routes.offline,
] as const;

/**
 * Paths for signed-in accounts: the authenticated shell, and first-time
 * setup beside it. The proxy sends guests to sign-in.
 */
export const appRoutes = [
  routes.onboarding,
  routes.dashboard,
  routes.library,
  routes.sermonIdeas,
  routes.savedScripture,
  routes.preachingRecord,
  routes.bible,
  routes.outlines,
  routes.settings,
  routes.admin,
] as const;
