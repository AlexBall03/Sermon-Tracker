/** Static site configuration shared by metadata, navigation, and copy. */
export const siteConfig = {
  name: "Sermon Tracker",
  tagline: "Capture. Develop. Preach.",
  description:
    "Sermon Tracker gives preachers one place to capture sermon and point ideas before they are forgotten, develop them over time, and keep a record of what has been preached.",
  /** Canonical production origin. Previews and local builds still point here. */
  url: "https://sermontracker.com",
} as const;

/**
 * Route map. `library`, `history`, and `settings` are the agreed paths for
 * later phases and are listed so links and robots rules have one source.
 */
export const routes = {
  home: "/",
  signIn: "/sign-in",
  acceptInvitation: "/accept-invitation",
  accessDenied: "/access-denied",
  dashboard: "/dashboard",
  library: "/library",
  history: "/history",
  settings: "/settings",
  admin: "/admin",
} as const;

/** Paths that must never be indexed, now or once they exist. */
export const privateRoutes = [
  routes.signIn,
  routes.acceptInvitation,
  routes.accessDenied,
  routes.dashboard,
  routes.library,
  routes.history,
  routes.settings,
  routes.admin,
] as const;

/** Paths inside the authenticated shell. The proxy sends guests to sign-in. */
export const appRoutes = [
  routes.dashboard,
  routes.library,
  routes.history,
  routes.settings,
  routes.admin,
] as const;
