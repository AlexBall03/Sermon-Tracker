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
 * Route map. Only `home` and `signIn` exist in Phase 1A; the rest are the
 * agreed paths for later phases and are listed so links and robots rules
 * have one source.
 */
export const routes = {
  home: "/",
  signIn: "/sign-in",
  dashboard: "/dashboard",
  library: "/library",
  history: "/history",
  settings: "/settings",
  admin: "/admin",
} as const;

/** Paths that must never be indexed, now or once they exist. */
export const privateRoutes = [
  routes.signIn,
  routes.dashboard,
  routes.library,
  routes.history,
  routes.settings,
  routes.admin,
] as const;
