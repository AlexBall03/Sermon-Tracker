/**
 * The dashboard: the greeting and its actions, the sermons being worked on, the
 * ones to revisit, the latest ideas and occasions, and four figures. Statuses,
 * kinds, dates, and an outline's size are read from the dictionaries that own them.
 */
export const dashboard = {
  metaTitle: "Dashboard",
  welcome: "Welcome back",
  welcomeNamed: (name: string) => `Welcome back, ${name}`,
  description: "Pick up what you are developing, or capture what just came to mind.",
  /** An account with no active idea and nothing preached. */
  empty: {
    title: "Start with an idea",
    body: "Capture the thought first. You can develop it, outline it, and record it when you preach it.",
  },
  /** The header's action that opens the sermon picker: an outline is opened, or made for a sermon chosen there. */
  outline: {
    title: "Start or open outline",
  },
  record: {
    title: "Record preaching",
  },
  /** Sermons at Idea or Developing whose content has been worked on, most recently first. */
  continue: {
    title: "Continue Working",
    description: "The sermons you have developed most recently.",
    resume: "Resume Outline",
    resumeNamed: (sermon: string) => `Resume the outline of ${sermon}`,
    openSermon: "Open Sermon",
    openSermonNamed: (sermon: string) => `Open the sermon ${sermon}`,
    outline: "Outline",
    noOutline: "No outline yet",
    none: "Nothing in development yet. Add notes, Scripture, or an outline to a sermon idea, and it will be here to pick up.",
    openLibrary: "Open Sermon Ideas",
  },
  /** Unfinished sermon ideas left alone for a while. The dates on each come from the library's results. */
  revisit: {
    title: "Revisit an Idea",
    description: "Unfinished sermon ideas you have not worked on in a while.",
    all: "See all that need attention",
    none: (days: number) =>
      `Nothing is waiting on you. Every unfinished sermon idea has had your attention in the last ${days} days.`,
    openLibrary: "Open Sermon Ideas",
  },
  /** The latest ideas of every kind. */
  recent: {
    title: "Recent Ideas",
    all: "Open Sermon Ideas",
    updated: "Updated",
  },
  /** The latest occasions on the Preaching Record, each one its own row. */
  preaching: {
    title: "Recent Preaching",
    all: "Open Preaching Record",
    none: "Nothing recorded yet. When you preach a sermon, record it here.",
    view: (sermon: string, date: string) => `${sermon}, preached ${date}: view its record`,
  },
  summary: {
    title: "At a Glance",
    sermons: "Sermon Ideas",
    points: "Point Ideas",
    developing: "In Development",
    preached: "Times Preached",
    unavailable: "Unavailable",
  },
};
