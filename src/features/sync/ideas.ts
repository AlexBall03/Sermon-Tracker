import type { IdeaKind, IdeaStatus, IntendedFormat, SermonType } from "@/features/ideas/model";
import type { IdeaReference } from "@/features/ideas/schemas";

/*
 * An idea as a device keeps it (Phase 5D.1), and as the server sends it: to
 * download it, and as its copy in a conflict. Plain values only, so it goes
 * through JSON and IndexedDB unchanged; dates are ISO strings. Shared by the
 * browser and the server, with no code of either.
 */

export type OfflineIdea = {
  id: string;
  kind: IdeaKind;
  title: string;
  notes: string | null;
  status: IdeaStatus;
  intendedFormat: IntendedFormat;
  sermonType: SermonType;
  subject: string | null;
  references: IdeaReference[];
  /** The tags it carries; their names are the account's tag list. */
  tagIds: string[];
  /** `ideas.revision`: the version of what the idea itself says. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  lastDevelopedAt: string | null;
  archivedAt: string | null;
  /** It has an outline, which deleting it would take too. */
  hasOutline: boolean;
  /** It has preaching history, so it cannot be deleted. */
  preached: boolean;
};

/** What can change about an idea without its revision moving, for every idea of the account. */
export type IdeaManifestItem = Pick<
  OfflineIdea,
  "id" | "revision" | "updatedAt" | "lastDevelopedAt" | "archivedAt" | "hasOutline" | "preached"
>;

/** `GET /api/offline/ideas`: the manifest and the account's tags. */
export type IdeaManifestResponse = {
  owner?: string;
  ideas: IdeaManifestItem[];
  tags: { id: string; name: string }[];
};

/** `GET /api/offline/ideas?ids=…`: those ideas, whole. */
export type IdeaRowsResponse = { owner?: string; ideas: OfflineIdea[] };

type IdeaLike = {
  id: string;
  kind: IdeaKind;
  title: string;
  notes: string | null;
  status: IdeaStatus;
  intendedFormat: IntendedFormat;
  sermonType: SermonType;
  subject: string | null;
  references: IdeaReference[];
  tags: { id: string }[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  lastDevelopedAt: Date | null;
  archivedAt: Date | null;
};

const iso = (date: Date | null) => (date ? date.toISOString() : null);

export function toOfflineIdea(
  idea: IdeaLike,
  flags: { hasOutline: boolean; preached: boolean },
): OfflineIdea {
  return {
    id: idea.id,
    kind: idea.kind,
    title: idea.title,
    notes: idea.notes,
    status: idea.status,
    intendedFormat: idea.intendedFormat,
    sermonType: idea.sermonType,
    subject: idea.subject,
    references: idea.references.map((reference) => ({ ...reference })),
    tagIds: idea.tags.map((tag) => tag.id),
    revision: idea.revision,
    createdAt: idea.createdAt.toISOString(),
    updatedAt: idea.updatedAt.toISOString(),
    lastDevelopedAt: iso(idea.lastDevelopedAt),
    archivedAt: iso(idea.archivedAt),
    hasOutline: flags.hasOutline,
    preached: flags.preached,
  };
}
