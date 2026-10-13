import type { SuggestedContext, TimeOfDay } from "@/features/preaching/model";

const suggestedContexts: Record<SuggestedContext, string> = {
  regular_service: "Regular Church Service",
  preaching_class: "Preaching Class",
  conference: "Conference / Preaching Bootcamp",
  special_service: "Special Service",
  other: "Other",
};

const timesOfDay: Record<TimeOfDay, string> = { am: "AM", pm: "PM" };

/** Preaching history: its vocabulary and the answers its actions give. It has no screens yet. */
export const preaching = {
  /** The contexts offered to choose from. An account's own are whatever it named them. */
  suggestedContexts,
  timesOfDay,
  timeOfDayMeanings: { am: "Morning", pm: "Afternoon or evening" } satisfies Record<
    TimeOfDay,
    string
  >,
  timeNotSpecified: "Not specified",
  actions: {
    invalid: "That request was not valid.",
    missing: "That record no longer exists.",
    missingSermon: "That sermon no longer exists.",
    notSermon: "Only a sermon can be recorded as preached. File this idea as a sermon first.",
    unknownVenue: "That venue no longer exists.",
    unknownContext: "That context no longer exists.",
    recorded: "Added to your preaching history.",
    notRecorded: "That could not be recorded. Try again.",
    changesSaved: "Changes saved.",
    changesNotSaved: "Your changes could not be saved. Try again.",
    removed: "Removed from your preaching history.",
    notRemoved: "That could not be removed. Try again.",
    duplicateVenue: "You already have a venue with that name.",
    missingVenue: "That venue no longer exists.",
    venueInUse: (count: number) =>
      `That venue is on ${count} ${count === 1 ? "record" : "records"} in your history and cannot be deleted.`,
    venueSaved: "Venue saved.",
    venueNotSaved: "The venue could not be saved. Try again.",
    venueDeleted: "Venue deleted.",
    venueNotDeleted: "The venue could not be deleted. Try again.",
    duplicateContext: "You already have a context with that name.",
    missingContext: "That context no longer exists.",
    contextInUse: (count: number) =>
      `That context is on ${count} ${count === 1 ? "record" : "records"} in your history and cannot be deleted.`,
    contextSaved: "Context saved.",
    contextNotSaved: "The context could not be saved. Try again.",
    contextDeleted: "Context deleted.",
    contextNotDeleted: "The context could not be deleted. Try again.",
  },
  validation: {
    tooLong: (limit: string) => `Use ${limit} characters or fewer.`,
    chooseSermon: "Choose the sermon that was preached.",
    dateRequired: "Give the date it was preached.",
    dateInvalid: "That is not a date.",
    dateTooEarly: "That date is too long ago.",
    dateInFuture: "The date cannot be in the future.",
    durationInvalid: "Give the length in whole minutes.",
    durationTooLong: "That is longer than a day.",
    urlInvalid: "That is not a link.",
    urlNotHttps: "Use a link that begins with https://.",
    urlCredentials: "Use a link without a username or password in it.",
    urlTooLong: (limit: string) => `Keep the link to ${limit} characters or fewer.`,
    venueName: "Give the venue a name.",
    venueTooLong: (limit: number) => `Keep a venue's name to ${limit} characters or fewer.`,
    contextName: "Give the context a name.",
    contextTooLong: (limit: number) => `Keep a context's name to ${limit} characters or fewer.`,
    nothingToChange: "There is nothing to change.",
  },
};
