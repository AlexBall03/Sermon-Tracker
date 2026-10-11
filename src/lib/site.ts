/** Static site configuration shared by metadata, navigation, and copy. */
export const siteConfig = {
  name: "Sermon Tracker",
  tagline: "Capture. Develop. Preach.",
  description:
    "Sermon Tracker gives preachers one place to capture sermon and point ideas before they are forgotten, develop them over time, and keep a record of what has been preached.",
  /** One plain sentence for the public footer. */
  blurb: "A private place to keep sermon ideas until they are ready to preach.",
  /** Canonical production origin. Previews and local builds still point here. */
  url: "https://sermontracker.com",
  /** Credited in the public footer. */
  developer: { name: "Alexander D. Ball", url: "https://alexball.dev" },
} as const;

/**
 * Route map. `history` is the agreed path for a later phase and is listed so
 * links and robots rules have one source. An idea is at `/library/<id>`; a
 * place in the Bible is `/bible?book=&chapter=&verse=` (features/scripture/reader-location.ts).
 */
export const routes = {
  home: "/",
  signIn: "/sign-in",
  acceptInvitation: "/accept-invitation",
  accessDenied: "/access-denied",
  dashboard: "/dashboard",
  library: "/library",
  bible: "/bible",
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
  routes.bible,
  routes.history,
  routes.settings,
  routes.admin,
] as const;

/** Paths inside the authenticated shell. The proxy sends guests to sign-in. */
export const appRoutes = [
  routes.dashboard,
  routes.library,
  routes.bible,
  routes.history,
  routes.settings,
  routes.admin,
] as const;
