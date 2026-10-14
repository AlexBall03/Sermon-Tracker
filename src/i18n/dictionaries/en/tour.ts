/** The product tour: its invitation on the dashboard, its seven stops, and its controls. */
export const tour = {
  invitation: {
    label: "Product tour",
    title: "Take a quick tour",
    body: "Seven short stops through the real application: your dashboard, capturing an idea, the library, the Bible, outlines, and your preaching record. It takes about two minutes and changes nothing.",
    optional:
      "It is optional. Choose Maybe Later and it will not ask again; you can start it any time from Settings.",
    start: "Take the Tour",
    later: "Maybe Later",
  },
  overlay: {
    label: "Product tour",
    progress: (step: number, total: number) => `Step ${step} of ${total}`,
    announce: (step: number, total: number, title: string) => `Step ${step} of ${total}: ${title}`,
    back: "Back",
    next: "Next",
    skip: "Skip Tour",
    finish: "Finish Tour",
    opening: "Opening the page…",
  },
  steps: {
    dashboard: {
      title: "Your Dashboard",
      body: "This is your workspace: the place to pick up what you are developing and to see what you have captured and preached.",
      present: "On your dashboard now:",
      sections: {
        "continue-working": "Continue Working, the sermons you are developing",
        "revisit-ideas": "Revisit an Idea, unfinished sermons left alone for a while",
        "recent-ideas": "Recent Ideas, what you captured last",
        "recent-preaching": "Recent Preaching, the latest times you preached",
        "at-a-glance": "At a Glance, your ideas and preaching in four figures",
      },
      growing: "More sections appear here as you capture, develop, and preach.",
    },
    capture: {
      title: "Capture an Idea",
      body: "When a thought comes, capture it here, from any page. Save it as a sermon idea, a point idea, or leave it undecided and choose later. Only the idea itself is required.",
    },
    library: {
      title: "Your Library",
      body: "Every idea you keep is here. Search by words, filter by kind, status, format, and tags, and order the results as you need. Saved Scripture and your Preaching Record are sections of the library too.",
    },
    bible: {
      title: "The Bible",
      body: (translations: string) =>
        `Read the ${translations} here. Go to any book, chapter, and verse, save favorites, highlight verses, and add a passage to a sermon or point idea.`,
      and: "and the",
    },
    outlines: {
      title: "Outlines",
      body: "Give a sermon its shape: main points and points under them, an introduction and a conclusion, Scripture on each, saved point ideas brought in, and numbering in the style you like.",
      note: "An outline organizes a sermon. It is not a place to write the manuscript.",
    },
    preaching: {
      title: "Preaching Record",
      body: "Each time you preach a sermon, record the date, where, and what kind of occasion it was. A sermon stays one idea however often you preach it, and its whole history stays with it.",
    },
    ready: {
      title: "You're ready to begin.",
      body: "Capture an idea whenever inspiration strikes, and come back to develop it when you have time.",
      again: "You can take this tour again from Settings.",
    },
  },
  actions: {
    saved: "Saved.",
    notSaved: "Your answer could not be saved. The tour may ask again.",
  },
};
