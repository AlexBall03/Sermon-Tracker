"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { OccurrenceDialog, type OccurrenceDialogState } from "./occurrence-dialog";
import type { ReferenceOption } from "./reference-field";

type Sermon = { id: string; title: string };

const RecordContext = createContext<((sermon?: Sermon) => void) | null>(null);

/**
 * Opens the page's recording form: for the sermon given, or with the sermon
 * still to be chosen in it. Null where no `RecordPreachingProvider` is above.
 */
export function useRecordPreaching() {
  return useContext(RecordContext);
}

/**
 * Lets anything beneath it record that a sermon was preached, from where the
 * sermon is listed or shown: one dialog for the page, opened for whichever
 * sermon was asked about, or with the sermon to be chosen in it. It is the
 * same dialog, and the same action, as the preaching record's own.
 */
export function RecordPreachingProvider({
  venues,
  contexts,
  children,
}: {
  /** The account's venues and contexts, to choose from. */
  venues: readonly ReferenceOption[];
  contexts: readonly ReferenceOption[];
  children: React.ReactNode;
}) {
  const [dialog, setDialog] = useState<OccurrenceDialogState>(null);
  const record = useMemo(
    () => (sermon?: Sermon) => setDialog({ mode: "record", ...(sermon ? { sermon } : {}) }),
    [],
  );
  return (
    <RecordContext.Provider value={record}>
      {children}
      <OccurrenceDialog
        state={dialog}
        onClose={() => setDialog(null)}
        venues={venues}
        contexts={contexts}
      />
    </RecordContext.Provider>
  );
}

/**
 * Records that this sermon was preached. Offer it only for an idea filed as a
 * sermon: the server refuses anything else. Where no `RecordPreachingProvider`
 * is above it, there is no dialog to open and it shows nothing.
 *
 * On a library card it sits above the card's link, so pressing it records and
 * does not open the idea. In the list view there is room for the icon only;
 * the button is still named in full, with the sermon it is for.
 */
export function RecordPreachingButton({
  sermon,
  onCard = false,
  className,
}: {
  sermon: Sermon;
  /** One of many in a list of ideas: quieter, and named for its sermon. */
  onCard?: boolean;
  className?: string;
}) {
  const record = useContext(RecordContext);
  const t = useT("preaching").sermon;
  if (!record) return null;
  return (
    <Button
      type="button"
      variant={onCard ? "ghost" : "outline"}
      size={onCard ? "sm" : "default"}
      aria-haspopup="dialog"
      aria-label={onCard ? t.recordNamed(sermon.title) : undefined}
      title={onCard ? t.record : undefined}
      onClick={() => record(sermon)}
      className={cn(
        onCard && "relative z-10 -mr-2 px-2.5 text-muted-foreground hover:text-primary",
        className,
      )}
    >
      <CalendarPlus aria-hidden />
      <span className={onCard ? "list-view:sr-only" : undefined}>{t.record}</span>
    </Button>
  );
}
