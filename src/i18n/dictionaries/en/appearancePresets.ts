/**
 * Personal appearance presets: what their actions answer (A4.2B), and the
 * words of My presets and of presets in Outline Settings (A4.2C). A preset's
 * name is the person's and is shown as written, never translated.
 */
export const appearancePresets = {
  /** A4.2C: what is said of an answer that never came, read back or not. */
  outcomes: {
    uncertain:
      "We couldn't confirm that change. Check your connection and try again; trying again is safe.",
    expired:
      "That request is too old to send again safely. Check your presets to see whether it was saved.",
    applied: "Done. The change was saved, though its answer was lost on the way.",
    notApplied: "That change wasn't saved. Try again.",
    superseded:
      "That preset was changed somewhere else before we could confirm. Review it as it is now.",
    tryAgain: "Try again",
    reload: "Show the latest",
  },
  /** Settings → Appearance → My presets (A4.2C). */
  library: {
    title: "My presets",
    description:
      "Appearances you saved from an outline. Applying one copies it into the outline: changing or deleting a preset later never restyles an outline already made.",
    defaultTitle: "Default for new outlines",
    defaultHint:
      "New outlines start with this appearance. Outlines you already have keep their own.",
    builtIn: "Built-in",
    mine: "My presets",
    defaultBadge: "Default",
    basedOn: (preset: string) => `Based on ${preset}`,
    updated: (date: string) => `Updated ${date}`,
    empty: "No presets yet",
    emptyBody:
      "Open an outline, set it up in Outline Settings → Appearance, and choose Save as preset. It will appear here.",
    loading: "Loading presets…",
    loadFailed: "Your presets couldn't be loaded.",
    retry: "Try again",
    offline: "You're offline. Presets need a connection to change.",
    previous: "Previous",
    next: "Next",
    page: (page: string, pages: string) => `Page ${page} of ${pages}`,
    actions: (name: string) => `Actions for ${name}`,
    preview: "Preview",
    hidePreview: "Hide preview",
    previewOf: (name: string) => `Preview of ${name}`,
    previewLoading: "Loading preview…",
    previewFailed: "This preview couldn't be loaded.",
    previewUnreadable: "This preset can't be read, so it can't be shown or applied.",
    choosePreview: "Choose Preview on a preset to see it here.",
    rename: "Rename",
    duplicate: "Duplicate",
    makeDefault: "Use for new outlines",
    delete: "Delete",
    name: "Name",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    copyOf: (name: string) => `Copy of ${name}`,
    deleteTitle: (name: string) => `Delete “${name}”?`,
    deleteBody: "Outlines you already made with this preset keep their appearance.",
    deleteDefaultBody:
      "Outlines you already made with this preset keep their appearance. It is your default for new outlines, so new outlines will start with Balanced instead.",
    deleteConfirm: "Delete preset",
    updateHint:
      "To give a preset a new appearance, open an outline, adjust it in Outline Settings → Appearance, and choose Update a preset.",
  },
  /** Outline Settings → Appearance (A4.2C). */
  editor: {
    mine: "My presets",
    mineHint: "Previewing one changes nothing until you apply.",
    previewIn: (name: string) => `Preview ${name}`,
    previewing: (name: string) => `Previewing “${name}”. Apply to keep it, or Cancel.`,
    loading: "Loading your presets…",
    loadFailed: "Your presets couldn't be loaded.",
    none: "You have no presets yet. Save this appearance as your first.",
    more: "Show more",
    retry: "Try again",
    offline: "You're offline. Presets need a connection.",
    replaceTitle: "Replace your unapplied changes?",
    replaceBody: (name: string) =>
      `Previewing “${name}” replaces the outline-wide changes you haven't applied. Changes to single components are kept. Nothing is saved until you apply.`,
    replaceConfirm: "Preview preset",
    keepEditing: "Keep my changes",
    unreadable: "That preset can't be read, so it can't be applied.",
    invalid: "That preset can't be applied to this outline.",
    saveTitle: "Save as preset",
    saveHint:
      "Saves the appearance shown in the preview, including changes you haven't applied, for use on other outlines. This outline isn't changed.",
    name: "Preset name",
    save: "Save preset",
    saving: "Saving…",
    updateTitle: "Update a preset",
    updateHint:
      "Replaces a preset's appearance with the one shown in the preview. This outline isn't changed.",
    updateChoose: "Preset to update",
    update: "Update preset…",
    updateConfirmTitle: (name: string) => `Replace the appearance of “${name}”?`,
    updateConfirmBody:
      "Its saved appearance is replaced with the one in the preview. Outlines already made with it keep theirs, and this outline isn't changed.",
    updateConfirm: "Replace appearance",
    updateConflict: (name: string) =>
      `“${name}” was changed somewhere else since you chose it. Your appearance is still here: review and replace again if you still want to.`,
    replaceAgain: "Replace again",
    cancel: "Cancel",
    refusals: {
      conflict:
        "Some of your changes were made over something changed elsewhere. Resolve them first.",
      orphan: "Some changes are for components that are gone. Discard them first.",
      invalid: "This appearance has values that can't be saved.",
      layout_unreadable:
        "This outline's numbering can't be read, so its appearance can't be saved.",
      no_preset: "This appearance isn't based on a preset, so it can't be saved.",
      too_large: "This appearance is too large to save as a preset.",
    },
  },
  actions: {
    invalid: "That request was not valid.",
    invalidAppearance: "That appearance can't be saved as a preset.",
    tooLarge: (limit: string) => `That appearance is larger than the ${limit} a preset may hold.`,
    notFound: "That preset no longer exists.",
    unreadable: "That preset can't be read.",
    conflict: "That preset was changed somewhere else. Review it and try again.",
    defaultConflict: "Your default appearance was changed somewhere else. Review it and try again.",
    duplicateName: "You already have a preset with that name.",
    limitReached: (limit: string) =>
      `You can keep up to ${limit} presets. Delete one to save another.`,
    operationReused: "That request was already used for something else. Try again.",
    accountUnavailable: "Your account can't change presets right now.",
    failed: "That preset change could not be saved. Try again.",
    created: "Preset saved.",
    renamed: "Preset renamed.",
    replaced: "Preset updated.",
    deleted: "Preset deleted.",
    deletedDefault: "Preset deleted. Your default appearance is now Balanced.",
    unchanged: "Nothing changed.",
    defaultSaved: "Default appearance saved.",
    loaded: "Presets loaded.",
  },
};
