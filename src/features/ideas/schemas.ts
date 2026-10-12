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
  ideaKinds,
  ideaLimits,
  ideaStatuses,
  sermonTypes,
  tagLimits,
  type IdeaKind,
  type IdeaStatus,
  type SermonType,
} from "./model";
import type { IdeaTag } from "./tags";

/** A passage attached to an idea. A sermon may mark one as its main text. */
export type IdeaReference = ScriptureReference & { isPrimary: boolean };

export const ideaIdSchema = z.uuid();
export const ideaKindSchema = z.enum(ideaKinds);

export const tagIdSchema = z.uuid();

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
    status: z.enum(ideaStatuses).default("captured"),
    sermonType: z
      .enum(sermonTypes)
      .nullish()
      .transform((value) => value ?? null),
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
    attachInput: attachInputSchema,
  };
}

const inEnglish = ideaSchemas();

// The schemas in English, for callers that only need the shapes and the types.
export const tagNameSchema = inEnglish.tagName;
export const tagIdsSchema = inEnglish.tagIds;
export const ideaInputSchema = inEnglish.ideaInput;
export type IdeaInput = z.infer<typeof ideaInputSchema>;
export const attachInputSchema = inEnglish.attachInput;
export type AttachInput = z.infer<typeof attachInputSchema>;

/** What the forms hold while someone is writing. */
export type IdeaDraft = {
  kind: IdeaKind;
  title: string;
  notes: string;
  status: IdeaStatus;
  sermonType: SermonType | null;
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
  status: "captured",
  sermonType: null,
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
