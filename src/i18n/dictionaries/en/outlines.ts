/**
 * Outlines. Phase 3A has no screen of its own, so these are only what the
 * validation and the server actions say; the editor's words come with it.
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
  },
};
