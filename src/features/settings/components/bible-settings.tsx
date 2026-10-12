"use client";

import { useSyncExternalStore } from "react";

import { Segmented } from "@/components/ui/segmented";
import {
  copyKinds,
  defaultCopyKind,
  readCopyKind,
  storeCopyKind,
  subscribeCopyKind,
} from "@/features/scripture/copy-preference";
import { useT } from "@/i18n/client";

/**
 * How the Bible reader behaves on this device. Like the theme, nothing here
 * is saved to the account: it is kept in this browser.
 */
export function BibleSettings() {
  const t = useT("settings").bible;
  const options = copyKinds.map((kind) => ({ value: kind, label: t.copyKinds[kind] }));
  // The default on the server and until hydration; the stored choice after it.
  const kind = useSyncExternalStore(subscribeCopyKind, readCopyKind, () => defaultCopyKind);

  return (
    <div>
      <Segmented
        label={t.copyShortcut}
        name="bible-copy"
        options={options}
        value={kind}
        onChange={storeCopyKind}
        className="max-w-md"
      />
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t.copyHelp}</p>
    </div>
  );
}
