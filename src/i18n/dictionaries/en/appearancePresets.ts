/**
 * Personal appearance presets (A4.2B): what their actions answer. The
 * presets' own screens are A4.2C's and add their words then.
 */
export const appearancePresets = {
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
