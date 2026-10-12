import { z } from "zod";

import {
  normaliseReference,
  referenceKey,
  referenceShape,
  refineReference,
  type ScriptureReference,
} from "@/features/scripture/reference";
import { dictionary, formatNumber } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import {
  classificationDefaults,
  ideaKinds,
  ideaLimits,
  ideaStatuses,
  intendedFormats,
  sermonTypes,
  tagLimits,
  type IdeaKind,
  type IdeaStatus,
  type IntendedFormat,
  type SermonType,
} from "./model";
import type { IdeaTag } from "./tags";

/** A passage attached to an idea. A sermon may mark one as its main text. */
export type IdeaReference = ScriptureReference & { isPrimary: boolean };

export const ideaIdSchema = z.uuid();
export const ideaKindSchema = z.enum(ideaKinds);

export const tagIdSchema = z.uuid();

/**
 * The three classifications, each one of its fixed values or left out. They
 * say nothing in words, so they need no language. Left out means "as it is":
 * there is no default here, and a value that is not on the list is refused.
 */
const classificationShape = {
  status: z.enum(ideaStatuses).optional(),
  intendedFormat: z.enum(intendedFormats).optional(),
  sermonType: z.enum(sermonTypes).optional(),
};

/**
 * A change to an idea's classification and nothing else: any of the three,
 * and at least one. What is not named is left alone.
 */
export const classificationInputSchema = z
  .object(classificationShape)
  .refine((change) => Object.values(change).some((value) => value !== undefined));
export type ClassificationInput = z.infer<typeof classificationInputSchema>;

/**
 * The schemas of ideas and tags, saying what they refuse in one language. The
 * rules are the same whatever the language; only the words differ. The
 * browser checks with these before it asks, and the server checks again.
 */
export function ideaSchemas(locale: Locale = defaultLocale) {
  const t = dictionary(locale, "ideas").validation;
  const inBible = (reference: ScriptureReference, context: z.RefinementCtx) =>
    refineReference(reference, context, locale);

  const ideaReferenceSchema = z
    .object({ ...referenceShape, isPrimary: z.boolean().default(false) })
    .superRefine(inBible)
    .transform(({ isPrimary, ...reference }) => ({ ...normaliseReference(reference), isPrimary }));

  /** Optional text: trimmed, and stored as null when nothing was written. */
  const optionalText = (limit: number) =>
    z
      .string()
      .trim()
      .max(limit, t.tooLong(formatNumber(locale, limit)))
      .nullish()
      .transform((value) => value || null);

  /** A tag's name: trimmed, with runs of whitespace inside it reduced to one space. */
  const tagNameSchema = z
    .string(t.tagName)
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, t.tagName).max(tagLimits.name, t.tagTooLong(tagLimits.name)));

  /** The tags chosen for an idea. The same tag twice is one tag. */
  const tagIdsSchema = z
    .array(tagIdSchema)
    .max(tagLimits.perIdea, t.tooManyTags(tagLimits.perIdea))
    .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

  /**
   * Everything a person may set on an idea. There is no owner here and no
   * timestamps: the owner is the signed-in account, and any other key in the
   * input is dropped.
   */
  const ideaInputSchema = z.object({
    kind: ideaKindSchema.default("undecided"),
    title: z
      .string()
      .trim()
      .min(1, t.titleRequired)
      .max(ideaLimits.title, t.titleTooLong(ideaLimits.title)),
    notes: optionalText(ideaLimits.notes),
    // A new idea that does not say is given the defaults.
    status: z.enum(ideaStatuses).default(classificationDefaults.status),
    intendedFormat: z.enum(intendedFormats).default(classificationDefaults.intendedFormat),
    sermonType: z.enum(sermonTypes).default(classificationDefaults.sermonType),
    subject: optionalText(ideaLimits.subject),
    references: z
      .array(ideaReferenceSchema)
      .max(ideaLimits.references, t.tooManyReferences(ideaLimits.references))
      .default([])
      // The same passage twice is one reference.
      .transform((references) => {
        const seen = new Set<string>();
        return references.filter((reference) => {
          const key = referenceKey(reference);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      })
      .refine((references) => references.filter((reference) => reference.isPrimary).length <= 1, {
        message: t.onePrimary,
      }),
    /** Left out, the idea's tags stay as they are; given, they replace what was there. */
    tagIds: tagIdsSchema.optional(),
  });

  /**
   * A save of an idea that already exists. It is the same as a new idea's
   * input but for the classifications, which have no default here: one that
   * is left out stays as it is, so a save that names only the title cannot
   * put the status back to `idea`.
   */
  const ideaUpdateSchema = ideaInputSchema.extend(classificationShape);

  /**
   * Passages to add to an idea that already exists, from the Bible reader or
   * from saved Scripture. Each is checked against the Bible; the same passage
   * twice is one. There is no owner here: the idea is found among the signed-in
   * account's own, or not at all.
   */
  const attachInputSchema = z.object({
    ideaId: ideaIdSchema,
    references: z
      .array(
        z
          .object(referenceShape)
          .superRefine(inBible)
          .transform((reference) => normaliseReference(reference)),
      )
      .min(1, t.choosePassage)
      .max(ideaLimits.references, t.tooManyReferences(ideaLimits.references))
      .transform((references) => {
        const seen = new Set<string>();
        return references.filter((reference) => {
          const key = referenceKey(reference);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }),
  });

  return {
    tagName: tagNameSchema,
    tagIds: tagIdsSchema,
    ideaInput: ideaInputSchema,
    ideaUpdate: ideaUpdateSchema,
    attachInput: attachInputSchema,
  };
}

const inEnglish = ideaSchemas();

// The schemas in English, for callers that only need the shapes and the types.
export const tagNameSchema = inEnglish.tagName;
export const tagIdsSchema = inEnglish.tagIds;
export const ideaInputSchema = inEnglish.ideaInput;
export type IdeaInput = z.infer<typeof ideaInputSchema>;
export const ideaUpdateSchema = inEnglish.ideaUpdate;
export type IdeaUpdate = z.infer<typeof ideaUpdateSchema>;
export const attachInputSchema = inEnglish.attachInput;
export type AttachInput = z.infer<typeof attachInputSchema>;

/** What the forms hold while someone is writing. */
export type IdeaDraft = {
  kind: IdeaKind;
  title: string;
  notes: string;
  status: IdeaStatus;
  intendedFormat: IntendedFormat;
  sermonType: SermonType;
  subject: string;
  references: IdeaReference[];
  /**
   * The idea's tags, with their names for showing. A form that saves them
   * sends their IDs as `tagIds`; one that does not (quick capture) leaves
   * the idea's tags as they are.
   */
  tags: IdeaTag[];
};

/** The draft's tags as the input schema takes them. */
export const draftTagIds = (draft: IdeaDraft) => draft.tags.map((tag) => tag.id);

export const emptyDraft: IdeaDraft = {
  kind: "undecided",
  title: "",
  notes: "",
  ...classificationDefaults,
  subject: "",
  references: [],
  tags: [],
};

/** True when the person has written anything worth keeping. */
export function hasContent(draft: IdeaDraft) {
  return Boolean(
    draft.title.trim() || draft.notes.trim() || draft.subject.trim() || draft.references.length,
  );
}

/** The first message for each field, keyed by field name. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
