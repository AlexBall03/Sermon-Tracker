"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/i18n/client";
import { restoreIdea } from "../../actions";

/**
 * Takes an archived idea out of the archive from where it is listed. It sits
 * above the card's link, so pressing it restores and does not open the idea.
 * Nothing is said to have happened until the server says so.
 */
export function RestoreButton({ id, title }: { id: string; title: string }) {
  const t = useT("library").results;
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function restore() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const outcome = await restoreIdea(id).catch(() => ({ ok: false, message: t.offline }));
    setBusy(false);
    if (!outcome.ok) return setProblem(outcome.message);
    toast({ message: outcome.message });
    // The list is the server's: ask for it again, now without this idea in the archive.
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        aria-busy={busy}
        aria-label={t.restoreNamed(title)}
        onClick={() => void restore()}
        className="relative z-10 px-3"
      >
        {busy ? (
          <LoaderCircle className="animate-spin" aria-hidden />
        ) : (
          <ArchiveRestore aria-hidden />
        )}
        {busy ? t.restoring : t.restore}
      </Button>
      {problem && (
        <p role="alert" className="basis-full text-[0.8125rem] font-medium text-destructive">
          {problem}
        </p>
      )}
    </>
  );
}
