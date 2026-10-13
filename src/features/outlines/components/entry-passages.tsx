"use client";

import { memo, useCallback, useMemo } from "react";

import {
  ScriptureField,
  type FieldReference,
} from "@/features/scripture/components/scripture-field";
import type { ScriptureReference } from "@/features/scripture/reference";
import { useT } from "@/i18n/client";
import { outlineLimits } from "../model";

/** What changes an entry's passages: given the list as it stands, the list as it is to be. */
export type SetReferences = (
  id: string,
  update: (current: ScriptureReference[]) => ScriptureReference[],
) => void;

const plain = ({ book, chapterStart, verseStart, chapterEnd, verseEnd }: ScriptureReference) => ({
  book,
  chapterStart,
  verseStart,
  chapterEnd,
  verseEnd,
});

/**
 * The passages on one entry of an outline, beneath its heading and notes. It
 * is the application's own Scripture field, as on an idea's page: each passage
 * a row that opens its text in place, a bounded number of verses with the way
 * to the rest, and from there to the Scripture Panel or the Bible. Nothing of
 * the Bible is kept on the entry but the numbers of the passage.
 *
 * It holds no list of its own. Every change goes to the editor's store, which
 * shows it at once and saves it in turn.
 */
export const EntryPassages = memo(function EntryPassages({
  entryId,
  outlineId,
  references,
  suggested,
  setReferences,
  className,
}: {
  entryId: string;
  /** The outline, so a passage opened in the Bible can lead back to it. */
  outlineId: string;
  references: ScriptureReference[];
  /** The sermon's own passages, offered so they need not be looked up again. */
  suggested?: readonly ScriptureReference[];
  setReferences: SetReferences;
  className?: string;
}) {
  const t = useT("outlines");
  // An entry has no main text: that is the sermon's own.
  const value = useMemo<FieldReference[]>(
    () => references.map((reference) => ({ ...reference, isPrimary: false })),
    [references],
  );
  const onChange = useCallback(
    (update: (current: FieldReference[]) => FieldReference[]) =>
      setReferences(entryId, (current) =>
        update(current.map((reference) => ({ ...reference, isPrimary: false }))).map(plain),
      ),
    [entryId, setReferences],
  );
  const origin = useMemo(() => ({ outline: outlineId }), [outlineId]);

  return (
    <ScriptureField
      value={value}
      onChange={onChange}
      layout="rows"
      max={outlineLimits.references}
      origin={origin}
      label={t.editor.passages}
      attachLabel={t.editor.addToPoint}
      fullMessage={t.validation.tooManyReferences}
      suggestions={suggested}
      suggestionsLabel={t.editor.fromSermon}
      className={className}
    />
  );
});
