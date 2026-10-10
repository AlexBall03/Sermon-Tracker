import { z } from "zod";

import {
  normaliseReference,
  referenceKey,
  referenceShape,
  refineReference,
  type ScriptureReference,
} from "@/features/scripture/reference";
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

/** A passage attached to an idea. A sermon may mark one as its main text. */
export type IdeaReference = ScriptureReference & { isPrimary: boolean };

const ideaReferenceSchema = z
  .object({ ...referenceShape, isPrimary: z.boolean().default(false) })
  .superRefine(refineReference)
  .transform(({ isPrimary, ...reference }) => ({ ...normaliseReference(reference), isPrimary }));

/** Optional text: trimmed, and stored as null when nothing was written. */
const optionalText = (limit: number) =>
  z
    .string()
    .trim()
    .max(limit, `Use ${limit.toLocaleString("en")} characters or fewer.`)
    .nullish()
    .transform((value) => value || null);

export const ideaIdSchema = z.uuid();
export const ideaKindSchema = z.enum(ideaKinds);

export const tagIdSchema = z.uuid();

/** A tag's name: trimmed, with runs of whitespace inside it reduced to one space. */
export const tagNameSchema = z
  .string("Give the tag a name.")
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Give the tag a name.")
      .max(tagLimits.name, `Keep a tag to ${tagLimits.name} characters or fewer.`),
  );

/** The tags chosen for an idea. The same tag twice is one tag. */
export const tagIdsSchema = z
  .array(tagIdSchema)
  .max(tagLimits.perIdea, `An idea can hold up to ${tagLimits.perIdea} tags.`)
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

/**
 * Everything a person may set on an idea. There is no owner here and no
 * timestamps: the owner is the signed-in account, and any other key in the
 * input is dropped.
 */
export const ideaInputSchema = z.object({
  kind: ideaKindSchema.default("undecided"),
  title: z
    .string()
    .trim()
    .min(1, "Write the idea first. A few words are enough.")
    .max(
      ideaLimits.title,
      `Keep the idea to ${ideaLimits.title} characters; the rest can go in notes.`,
    ),
  notes: optionalText(ideaLimits.notes),
  status: z.enum(ideaStatuses).default("captured"),
  sermonType: z
    .enum(sermonTypes)
    .nullish()
    .transform((value) => value ?? null),
  subject: optionalText(ideaLimits.subject),
  references: z
    .array(ideaReferenceSchema)
    .max(ideaLimits.references, `An idea can hold up to ${ideaLimits.references} references.`)
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
      message: "Only one reference can be the main text.",
    }),
  /** Left out, the idea's tags stay as they are; given, they replace what was there. */
  tagIds: tagIdsSchema.optional(),
});
export type IdeaInput = z.infer<typeof ideaInputSchema>;

/** What the forms hold while someone is writing. */
export type IdeaDraft = {
  kind: IdeaKind;
  title: string;
  notes: string;
  status: IdeaStatus;
  sermonType: SermonType | null;
  subject: string;
  references: IdeaReference[];
};

export const emptyDraft: IdeaDraft = {
  kind: "undecided",
  title: "",
  notes: "",
  status: "captured",
  sermonType: null,
  subject: "",
  references: [],
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
