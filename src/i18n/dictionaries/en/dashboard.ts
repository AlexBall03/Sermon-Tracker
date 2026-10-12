/** The dashboard: the greeting, the latest ideas, the shortcuts, and how the workspace works. */
export const dashboard = {
  metaTitle: "Dashboard",
  welcome: "Welcome back",
  welcomeNamed: (name: string) => `Welcome back, ${name}`,
  description: "Your workspace for sermon ideas, and for the points that build them.",
  empty: {
    title: "No ideas yet",
    body: "Capture the first thought worth keeping. A line is enough, and you can decide later whether it is a sermon or a point.",
  },
  recent: "Recent ideas",
  openLibrary: "Open the library",
  shortcuts: "Shortcuts",
  settings: {
    title: "Account settings",
    description: "Your name, email, password, language, and how the app looks.",
  },
  administration: {
    title: "Administration",
    description: "Invite people, and manage roles and access.",
  },
  workflow: {
    title: "How your workspace works",
    description:
      "The path an idea takes. Capture and the library are open; the preaching record is still to come.",
    stages: [
      {
        stage: "Capture",
        title: "Save the thought first",
        body: "A line is enough. You will not have to decide whether it is a sermon or a point before it is saved.",
      },
      {
        stage: "Develop",
        title: "Build it over time",
        body: "Add Scripture and notes as they come, and attach a point to every sermon it serves.",
      },
      {
        stage: "Preach",
        title: "Keep the record",
        body: "Note when and where a sermon was preached, beside the ideas that produced it.",
      },
    ],
    kinds: [
      {
        name: "Sermon idea",
        body: "A message in the making: a title, a text, and the direction it is heading.",
      },
      {
        name: "Point idea",
        body: "One thought that stands on its own, and can be used in more than one sermon.",
      },
      {
        name: "Undecided",
        body: "Something worth keeping that is not yet either. It can become a sermon or a point later.",
      },
    ],
  },
  summary: {
    title: "At a glance",
    description:
      "A short summary of your work will sit here. Its figures arrive with the preaching record, so none are shown yet.",
    stats: [
      { label: "Sermon ideas", pending: "Every sermon you are working towards." },
      { label: "Point ideas", pending: "Reusable points, counted once each." },
      { label: "In development", pending: "Ideas you have started building out." },
      { label: "Times preached", pending: "Each occasion a sermon was preached." },
    ],
  },
};
