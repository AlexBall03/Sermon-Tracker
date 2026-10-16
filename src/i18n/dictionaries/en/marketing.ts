/**
 * The public landing page: its navigation, its sections, what each
 * reconstruction of the application is described as, and the fictional
 * workspace those reconstructions show (`demo`, read through
 * components/marketing/demo.ts). Statuses, kinds, and the application's own
 * labels come from the dictionaries that own them.
 */
export const marketing = {
  meta: {
    title: "Sermon Tracker — Capture. Develop. Preach.",
    description:
      "Sermon Tracker is where preachers capture sermon and point ideas, develop them, outline them, and keep a record of what they have preached.",
  },
  nav: {
    primary: "Primary",
    footer: "Footer",
    home: "Sermon Tracker home",
    features: "Features",
    how: "How It Works",
    mobile: "Mobile App",
    signIn: "Sign In",
    getStarted: "Get Started",
    contact: "Contact",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    language: "Language",
  },
  hero: {
    eyebrow: "For preachers, from the first note to the pulpit",
    title: "From First Thought to Finished Sermon.",
    body: "Sermon Tracker keeps every sermon idea, reusable point, outline, and preaching record in one place, so nothing worth preaching is lost between the moment it comes to you and the day you preach it.",
    getStarted: "Get Started",
    signIn: "Sign In",
    desktopAlt:
      "The Sermon Tracker dashboard on a computer: a greeting with actions to capture an idea, start or open an outline, and record preaching, then the sermons being worked on, ideas to revisit, recent ideas, recent preaching, and four figures at a glance.",
    mobileAlt:
      "The Sermon Tracker dashboard on a phone: a greeting, the sermons being worked on, and a tab bar with Dashboard, Library, capture, Outlines, and Bible.",
  },
  how: {
    title: "One place for the whole life of a sermon",
    body: "A sermon rarely arrives finished. Sermon Tracker follows it from the passing thought to the day it is preached, and keeps it where you can find it again.",
    note: "Nothing here is a required order. Start an outline for a sermon you captured a minute ago, or record one you preached years ago.",
    stages: {
      capture: {
        name: "Capture",
        title: "Capture ideas",
        body: "Save a thought in seconds, from any page. Decide later whether it is a sermon, a point, or still undecided.",
      },
      develop: {
        name: "Develop",
        title: "Develop sermons",
        body: "Add notes and Scripture, give it a status, a type, and tags, and relate it to the sermons and points it belongs with.",
      },
      outline: {
        name: "Outline",
        title: "Build outlines",
        body: "Lay out the introduction, the points and their subpoints, and the conclusion, each with its passages.",
      },
      preach: {
        name: "Preach",
        title: "Record preaching",
        body: "Note when and where a sermon was preached, as often as it is preached. The sermon stays one sermon.",
      },
      revisit: {
        name: "Revisit",
        title: "Revisit previous work",
        body: "Unfinished ideas come back to you after a while, and everything you have preached stays searchable.",
      },
    },
    /** Words inside the five small examples. */
    examples: {
      captured: "Captured just now",
      related: "Related point",
      preachedTwice: "Preached 2 times",
    },
  },
  features: {
    title: "Everything a sermon needs, and nothing it does not",
    body: "Sermon Tracker is not a word processor, and it does not try to replace the one you write in. It keeps the ideas, the structure, the Scripture, and the record.",
    library: {
      name: "Library",
      title: "Every idea, findable",
      body: "Sermon ideas, reusable point ideas, and thoughts you have not sorted yet live in one library.",
      points: [
        "Search titles, subjects, and notes",
        "Filter by kind, status, sermon type, format, and tags",
        "Relate a point to every sermon it serves",
      ],
      alt: "The library's Sermon Ideas section on a computer: a search box, filters, and cards for sermon and point ideas, each with its kind, status, passages, and date.",
    },
    bible: {
      name: "Bible",
      title: "Scripture beside the work",
      body: "Read the King James Bible or the RVG in Spanish, or the two side by side on a wide screen.",
      points: [
        "Highlight verses in four colors",
        "Save a verse or a passage as a favorite, with your notes",
        "Add a selection straight to a sermon or point idea",
      ],
      alt: "The Bible reader on a phone, open at 2 Corinthians 12, with verse 9 highlighted and saved as a favorite.",
    },
    outlines: {
      name: "Outlines",
      title: "The shape of the sermon",
      body: "An outline holds short headings, brief notes, and passages, with points nested as deep as you need. It is an outline organizer, not a manuscript editor.",
      points: [
        "Seven numbering styles, or one of your own",
        "Move points by dragging, from a menu, or from the keyboard",
        "Bring in a saved point idea as a copy",
      ],
      alt: "The outline editor on a computer: an introduction, three numbered points with subpoints and passages, and a conclusion, with the save status shown as Saved.",
    },
    preaching: {
      name: "Preaching Record",
      title: "When and where it was preached",
      body: "Record each occasion: the date, the venue, the kind of service, how long you preached, and a link to a recording.",
      points: [
        "A sermon preached five times is still one sermon",
        "Search and filter your whole preaching record",
        "Your own venues and contexts",
      ],
      alt: "The Preaching Record on a phone: three occasions, each with its date, sermon, venue, and context.",
    },
    dashboard: {
      name: "Dashboard",
      title: "Pick up where you left off",
      body: "The dashboard opens on the sermons you developed most recently, the unfinished ideas you have not touched in a while, your latest preaching, and four figures for the whole workspace.",
      points: [
        "Continue Working follows real work on a sermon",
        "Revisit an Idea brings back what has gone quiet",
        "The same workspace on a computer and on a phone",
      ],
      alt: "The dashboard on a computer with the same dashboard on a phone in front of it.",
    },
  },
  mobile: {
    title: "On your phone, like an app",
    body: "Install Sermon Tracker from your browser and it opens from your home screen, full screen, straight into your workspace. It installs on a computer too, in its own window. Capture is one tap away at the foot of every page.",
    stepsTitle: "Install it from your browser",
    steps: [
      "Sign in to Sermon Tracker in your phone's browser.",
      "On an iPhone or iPad, tap Share, then Add to Home Screen. Elsewhere, open the browser's menu (or the install icon in the address bar) and choose Install app.",
      "Open Sermon Tracker from its icon and sign in if it asks. It opens on your dashboard.",
    ],
    signedIn:
      "The installed app is your own workspace: it needs an account and a connection, and it opens on your dashboard. Once you are signed in, Settings shows the steps for your device.",
    alt: "A phone showing the Sermon Tracker dashboard scrolled to Revisit an Idea, Recent Preaching, and At a Glance, beside the Sermon Tracker icon as it appears on a home screen.",
    iconLabel: "Sermon Tracker",
  },
  closing: {
    title: "Ready when the next idea comes",
    body: "Create your account and your workspace is ready: capture the first idea today and find it again on the day you preach it.",
    getStarted: "Get Started",
    signIn: "Sign In",
  },
  footer: {
    blurb: "One place for sermon ideas, outlines, Scripture, and your preaching record.",
    developedBy: "Developed by:",
    status: "Open for new accounts",
  },
  /** The reconstructions' own chrome, where the application has no string for it. */
  preview: {
    translation: { en: "KJV", es: "RVG" },
  },
  /**
   * The fictional workspace every reconstruction shows. One account, so the
   * screens agree with each other. None of it is anyone's real data.
   */
  demo: {
    firstName: "Alex",
    initials: "AB",
    sermons: {
      grace: {
        title: "His Grace Is Sufficient",
        subject: "Grace in weakness",
        notes:
          "Paul asked three times for the thorn to be taken away. The answer was not relief, but grace enough to bear it.",
      },
      story: {
        title: "The Story Isn't Over",
        subject: "Providence",
        notes: "Joseph's brothers expected revenge. He saw the hand of God in the pit.",
      },
      alone: {
        title: "You're Not Alone",
        subject: "The presence of God",
        notes: "Three reasons not to fear, all of them in one verse.",
      },
      voice: { title: "A Still Small Voice", subject: "Hearing God", notes: "" },
      anchor: { title: "An Anchor of the Soul", subject: "Hope", notes: "" },
      well: {
        title: "It Is Well",
        subject: "Faith in loss",
        notes: "The Shunammite said it before she saw it.",
      },
    },
    points: {
      strength: {
        title: "Strength is made perfect in weakness",
        notes: "The weakness is not removed. It becomes the place where His power rests.",
      },
      faith: { title: "Faith speaks before it sees", notes: "" },
    },
    undecided: { waiting: { title: "What God does while we wait" } },
    tags: { suffering: "Suffering", faith: "Faith", comfort: "Comfort" },
    venues: {
      church: { name: "Grace Baptist Church", locality: "Springfield" },
      camp: { name: "Pine Ridge Camp", locality: "" },
    },
    /** The outline of "His Grace Is Sufficient". */
    outline: {
      introduction: { title: "A thorn that would not leave", notes: "" },
      given: {
        title: "The thorn was given",
        notes: "Paul does not call it an accident.",
      },
      exalted: { title: "Lest I should be exalted above measure", notes: "" },
      messenger: { title: "A messenger of Satan, permitted by God", notes: "" },
      answered: { title: "The prayer was answered", notes: "" },
      grace: { title: "Not with removal, but with grace", notes: "" },
      power: {
        title: "Strength is made perfect in weakness",
        notes: "The weakness is not removed. It becomes the place where His power rests.",
      },
      conclusion: { title: "When I am weak, then am I strong", notes: "" },
    },
    /** 2 Corinthians 12:7–10, King James Version. */
    verses: [
      "And lest I should be exalted above measure through the abundance of the revelations, there was given to me a thorn in the flesh, the messenger of Satan to buffet me, lest I should be exalted above measure.",
      "For this thing I besought the Lord thrice, that it might depart from me.",
      "And he said unto me, My grace is sufficient for thee: for my strength is made perfect in weakness. Most gladly therefore will I rather glory in my infirmities, that the power of Christ may rest upon me.",
      "Therefore I take pleasure in infirmities, in reproaches, in necessities, in persecutions, in distresses for Christ’s sake: for when I am weak, then am I strong.",
    ],
  },
};
