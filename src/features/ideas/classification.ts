import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import {
  ideaStatuses,
  intendedFormats,
  sermonTypes,
  type IdeaStatus,
  type IntendedFormat,
  type SermonType,
} from "./model";

/**
 * The classifications as something to choose from, in one language: every
 * value in the model's order, with its name and what it means. The values are
 * the model's and the words are the dictionaries'; nothing is written twice.
 * There is no server code here, so a form in the browser reads the same list.
 */
export type ClassificationOptions = {
  statuses: { value: IdeaStatus; label: string; meaning: string }[];
  formats: { value: IntendedFormat; label: string; meaning: string }[];
  sermonTypes: { value: SermonType; label: string; definition: string; example: string }[];
};

export function classificationOptions(locale: Locale = defaultLocale): ClassificationOptions {
  const t = dictionary(locale, "ideas");
  return {
    statuses: ideaStatuses.map((value) => ({
      value,
      label: t.statuses[value],
      meaning: t.statusMeanings[value],
    })),
    formats: intendedFormats.map((value) => ({
      value,
      label: t.formats[value],
      meaning: t.formatMeanings[value],
    })),
    sermonTypes: sermonTypes.map((value) => ({
      value,
      label: t.sermonTypes[value],
      ...t.sermonTypeGuide[value],
    })),
  };
}
