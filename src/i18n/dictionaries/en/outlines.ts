/**
 * Outlines: what the validation and the server actions say, the editor's own
 * words, and the numbering settings.
 */
export const outlines = {
  validation: {
    titleTooLong: (limit: number) => `Keep a heading to ${limit} characters or fewer.`,
    notesTooLong: (limit: string) => `Keep notes to ${limit} characters or fewer.`,
    tooManyReferences: (limit: number) => `A point can have up to ${limit} passages.`,
    numbering: "That numbering style could not be used.",
    nothingToSave: "There was nothing to save.",
  },
  actions: {
    invalid: "That request was not valid.",
    missing: "That outline no longer exists.",
    missingSermon: "That sermon no longer exists.",
    notSermon: "Only a sermon can have an outline. File this idea as a sermon first.",
    exists: "This sermon already has an outline.",
    created: "Outline created.",
    notCreated: "The outline could not be created. Try again.",
    deleted: "Outline deleted. The sermon was kept.",
    notDeleted: "The outline could not be deleted. Try again.",
    numberingSaved: "Numbering saved.",
    notSaved: "Your changes could not be saved. Try again.",
    missingEntry: "That part of the outline no longer exists.",
    stale: "This outline was changed somewhere else. Reload it to carry on.",
    staleEntry: "This part of the outline was changed somewhere else. Reload it to carry on.",
    invalidParent: "A point can only be placed under another point of the same outline.",
    introductionExists: "This outline already has an introduction.",
    conclusionExists: "This outline already has a conclusion.",
    sectionFixed: "The introduction and the conclusion cannot be moved.",
    cycle: "A point cannot be placed under itself or under one of its own subpoints.",
    full: (limit: number) => `An outline can hold up to ${limit} entries.`,
    unknownSource: "That point idea no longer exists.",
    entryAdded: "Added to the outline.",
    entrySaved: "Saved.",
    entryMoved: "Moved.",
    entryRemoved: "Removed from the outline.",
    referencesSaved: "Passages saved.",
    /** A sermon document (A2.1). */
    documentConverted: "This outline is now a sermon document.",
    documentSaved: "Saved.",
    documentLoaded: "Sermon document loaded.",
    documentNotRead: "This sermon document could not be loaded. Try again.",
    documentUnstorable:
      "This sermon document contains a character that can't be saved, so it was not saved. Nothing was removed from it.",
    documentExists: "This outline already has a sermon document.",
    documentTooLarge: (limit: string) =>
      `This sermon document is larger than ${limit}, so it was not saved. Nothing was removed from it.`,
    /** Content authority (A2.2). */
    documentAuthoritative:
      "This outline is now a sermon document, so changes here can no longer be saved. Your text is still on this page.",
    documentUnreadable:
      "This outline's sermon document can't be read right now. It was left exactly as it was.",
    conversionUnsafe:
      "This outline can't become a sermon document without changing what it says, so it stays as it is.",
    conversionTooLarge: (limit: string) =>
      `As a sermon document this outline would be larger than ${limit}, so it stays as it is. Nothing was removed from it.`,
    conversionDisabled: "This outline opens in the outline editor for now.",
  },
  page: {
    metaTitle: "Outline",
    title: "Outline",
    /** Before the sermon's title. */
    sermon: "Sermon:",
    back: "Back to sermon",
    loading: "Loading the outline",
    archived: "This sermon is archived. Its outline is kept and can still be changed.",
    refiled:
      "This idea is no longer filed as a sermon. Its outline is kept and can still be changed.",
    notFound: {
      title: "Outline not found",
      body: "It may have been deleted, or the link may be wrong.",
      back: "Go to Outlines",
    },
  },
  create: {
    metaTitle: "New outline",
    title: "New outline",
    body: "An outline holds the shape of a sermon: short headings, brief notes, and points under points. The sermon itself is written wherever you write.",
    action: "Create outline",
    creating: "Creating…",
    notSermonTitle: "Only a sermon can have an outline",
    notSermonBody: "File this idea as a sermon first, then come back to give it an outline.",
    backToIdea: "Back to the idea",
  },
  /** The overview at /outlines. */
  overview: {
    metaTitle: "Outlines",
    title: "Outlines",
    description: "The outlines of your sermons. Open one to carry on, or start one for a sermon.",
    create: "Create Outline",
    search: {
      label: "Search outlines",
      landmark: "Search outlines",
      placeholder: "Search by sermon title...",
    },
    sort: "Sort outlines",
    sorts: {
      "updated-desc": "Recently worked on",
      "updated-asc": "Least recently worked on",
      "title-asc": "Sermon title A–Z",
      "title-desc": "Sermon title Z–A",
      "created-desc": "Recently created",
    },
    label: "Outlines",
    pages: "Outline pages",
    count: (total: number, written: string, filtered: boolean) =>
      `${written} ${filtered ? "matching " : ""}${total === 1 ? "outline" : "outlines"}`,
    showing: (first: string, last: string, total: number, written: string, filtered: boolean) =>
      `Showing ${first}–${last} of ${written} ${filtered ? "matching " : ""}${total === 1 ? "outline" : "outlines"}`,
    /** How much an outline holds, sections included. */
    entries: (count: number) =>
      count === 0 ? "Nothing in it yet" : count === 1 ? "1 entry" : `${count} entries`,
    updated: "Worked on",
    status: "Sermon status:",
    open: (sermon: string) => `Open the outline of ${sermon}`,
    sermon: "Sermon",
    openSermon: (sermon: string) => `Open the sermon ${sermon}`,
    empty: {
      nothing: "No outlines yet",
      nothingBody:
        "An outline holds the shape of a sermon: short headings, brief notes, passages, and points under points. Start one for a sermon you are working on.",
      noMatch: "No outlines match your search",
      noMatchBody: (search: string) =>
        `No sermon with an outline has “${search}” in its title. A sermon that has no outline yet is not listed here.`,
      clearSearch: "Clear search",
    },
  },
  /** Choosing the sermon a new outline is for. */
  picker: {
    title: "Create an outline",
    description:
      "Choose the sermon it is for. A sermon has one outline, so choosing one that has an outline opens it.",
    find: "Find a sermon",
    placeholder: "Search your sermon ideas...",
    recent: "Recently changed sermons",
    matching: "Matching sermons",
    none: "You have no sermon ideas yet. Capture one below and its outline opens next.",
    noMatch: (search: string) => `No sermon ideas match “${search}”.`,
    hasOutline: "Has an outline",
    open: (sermon: string) => `${sermon}: open its outline`,
    create: (sermon: string) => `${sermon}: create its outline`,
    loading: "Loading your sermons",
    orNew: "Or outline a sermon you have not captured yet",
    newSermon: "New sermon idea",
    /** After a capture begun here was saved as something other than a sermon. */
    notSermon: "Saved. Only a sermon can have an outline, so none was made.",
    offline: "That did not reach the server. Check your connection and try again.",
  },
  /** The way to an outline from where its sermon is shown. */
  link: {
    open: "Open Outline",
    create: "Create Outline",
    openNamed: (sermon: string) => `Open the outline of ${sermon}`,
    createNamed: (sermon: string) => `Create an outline for ${sermon}`,
    short: "Outline",
  },
  editor: {
    status: {
      saved: "Saved",
      saving: "Saving…",
      unsaved: "Unsaved changes",
      failed: "Save failed",
      conflict: "Needs your attention",
    },
    /** In place of "Saved" while the outline's changes are kept on this device, not yet in the account. */
    savedOnDevice: "Saved on this device",
    /** Why a change could not be kept on this device (the offline page). */
    notKept: "This change could not be kept on this device. It will be tried again.",
    needsConnection: "Adding a saved point needs a connection.",
    retry: "Try again",
    offline:
      "That did not reach the server. Your changes are kept on this page and will be tried again.",
    reloadFailed: "The outline could not be loaded again. Check your connection and try again.",
    leave: "Some changes to this outline have not been saved. If you leave now, they may be lost.",
    numbering: "Numbering",
    expandAll: "Expand all",
    collapseAll: "Collapse all",
    more: "More outline actions",
    deleteOutline: "Delete outline",
    deleteOutlineTitle: "Delete this outline?",
    deleteOutlineDescription: (sermon: string) =>
      `Every part of the outline of “${sermon}” will be deleted. The sermon itself is kept. This cannot be undone.`,
    deleteOutlineConfirm: "Delete outline",
    sections: {
      introduction: "Introduction",
      points: "Points",
      conclusion: "Conclusion",
    },
    addIntroduction: "Add introduction",
    addConclusion: "Add conclusion",
    addPoint: "Add point",
    addSavedPoint: "Add from Saved Point",
    addPassage: "Add passage",
    passages: "Passages",
    /** The button in the Scripture panel that puts a passage on an entry. */
    addToPoint: "Add to outline",
    /** Before the sermon's own passages, offered on an entry. */
    fromSermon: "From the sermon",
    fromSavedPoint: "From a saved point",
    openSource: (name: string) => `${name}: open the saved point it was made from`,
    empty: "No points yet. Add the first, then press Enter in a heading to add the next.",
    full: (limit: number) => `An outline can hold up to ${limit} entries.`,
    heading: "Heading",
    notes: "Notes",
    addNotes: "Add notes",
    /** Read out for a heading: "Heading, I.A." */
    headingOf: (label: string) => `Heading, ${label}`,
    notesOf: (name: string) => `Notes for ${name}`,
    /** The passages of an entry at rest, read out as a list. */
    passagesOf: (name: string) => `Passages for ${name}`,
    placeholders: {
      point: "Heading",
      introduction: "How it opens",
      conclusion: "How it closes",
      notes: "Brief notes",
    },
    untitled: "Untitled point",
    /** How many characters of the notes are left, near the limit. */
    remaining: (count: number) => `${count} left`,
    row: {
      actions: (name: string) => `Actions for ${name}`,
      drag: "Drag to move",
      expand: (name: string) => `Expand ${name}`,
      collapse: (name: string) => `Collapse ${name}`,
      hidden: (count: number) => (count === 1 ? "1 point folded" : `${count} points folded`),
      level: (level: number) => `Level ${level}`,
      addSubpoint: "Add subpoint",
      addBelow: "Add point below",
      moveUp: "Move up",
      moveDown: "Move down",
      indent: "Indent",
      outdent: "Outdent",
      toTop: "Move to top level",
      addNotes: "Add notes",
      addPassage: "Add passage",
      addSavedPoint: "Add from saved point",
      delete: "Delete",
      /** The bar of options under the point that is selected. */
      bar: {
        label: (name: string) => `Options for ${name}`,
        notes: "Notes",
        passage: "Passage",
        subpoint: "Subpoint",
      },
    },
    /** Placing a saved point idea in the outline. */
    savedPoint: {
      title: "Add from a saved point",
      description:
        "A copy of the point's heading, notes, and passages is added to this outline. The saved point itself is not changed.",
      find: "Find a point",
      placeholder: "Search your point ideas...",
      recent: "Recently changed points",
      matching: "Matching points",
      none: "You have no point ideas yet. Capture one, and it can be placed in any outline.",
      noMatch: (search: string) => `No point ideas match “${search}”.`,
      loading: "Loading your points",
      /** Where the point goes, when the picker was opened from a point of the outline. */
      place: (name: string) => `Where it goes, beside ${name}`,
      below: "Below it",
      under: "As a subpoint",
      atEnd: "It is added after the last main point.",
      add: (title: string) => `Add ${title}`,
      added: (title: string) => `Added “${title}”.`,
      done: "Done",
    },
    shortcuts: {
      addBelow: "Enter",
      addSubpoint: "Ctrl Enter",
      moveUp: "Alt Shift ↑",
      moveDown: "Alt Shift ↓",
      indent: "Alt Shift →",
      outdent: "Alt Shift ←",
    },
    /** Read out after a move: where the point now is. */
    moved: (name: string, label: string) =>
      label ? `${name} moved. Now ${label}` : `${name} moved.`,
    remove: {
      title: "Delete this point?",
      description: (name: string, nested: number) =>
        nested === 0
          ? `“${name}” will be deleted from the outline.`
          : nested === 1
            ? `“${name}” and the 1 point under it will be deleted from the outline.`
            : `“${name}” and the ${nested} points under it will be deleted from the outline.`,
      sectionTitle: (section: string) => `Delete the ${section.toLowerCase()}?`,
      sectionDescription: "Its heading, notes, and passages will be deleted from the outline.",
      confirm: "Delete",
    },
    reloaded:
      "This outline was changed somewhere else, so it was loaded again. A change you had just made to its structure may not have been kept. What you typed is still here.",
    dismiss: "Dismiss",
    conflict: {
      title: "This part was also changed somewhere else",
      theirTitle: "The heading saved elsewhere:",
      theirNotes: "The notes saved elsewhere:",
      theirPassages: "The passages saved elsewhere:",
      empty: "(nothing)",
      keepMine: "Keep mine",
      useTheirs: "Use the other",
    },
    lost: {
      title: "Not saved: these points are no longer in the outline",
      body: "They were removed somewhere else before what you typed could be saved.",
      restore: "Add again as a point",
      discard: "Discard",
    },
  },
  numbering: {
    title: "Numbering",
    description:
      "How the points are labelled. Numbers are worked out from where a point is, so moving one renumbers the outline.",
    style: "Style",
    presets: {
      traditional: "Traditional",
      decimal: "Decimal",
      numeric: "Numeric",
      alphabetic: "Alphabetic",
      roman: "Roman",
      bullets: "Bullets",
      none: "None",
      custom: "Custom",
    },
    noNumbers: "No numbers",
    customHint: "Your own style, level by level",
    preview: "Preview",
    /** The headings of the preview's sample outline, by level. */
    sample: ["Main point", "Subpoint", "Detail", "Further detail"],
    apply: "Apply",
    close: "Close",
    custom: {
      levels: "Levels",
      level: (level: number) => `Level ${level}`,
      counter: "Counts with",
      counterOf: (level: number) => `Level ${level} counts with`,
      counters: {
        decimal: "1, 2, 3",
        alpha: "A, B, C",
        roman: "I, II, III",
        bullet: "A bullet",
        none: "Nothing",
      },
      letterCase: "Letters",
      cases: { upper: "Capitals", lower: "Small" },
      bullet: "Bullet",
      bulletOf: (level: number) => `Level ${level} bullet`,
      prefix: "Before",
      suffix: "After",
      composite: "Include the levels above",
      compositeHint: "Writes 1.2.3 instead of 3.",
      separator: "Between levels",
      addLevel: "Add a level",
      removeLevel: (level: number) => `Remove level ${level}`,
      overflow: "Deeper levels",
      overflowHint: "What a point uses when it is deeper than the last level above.",
      overflows: {
        repeat: "Repeat the levels",
        last: "Keep the last level",
        none: "No number",
      },
      repeatFrom: "Repeat from",
      invalid: "This style cannot be used as it is.",
      invalidText: "Text around a number must be one short line, without the characters < and >.",
    },
  },
};
