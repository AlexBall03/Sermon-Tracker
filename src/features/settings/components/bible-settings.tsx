"use client";

import { useSyncExternalStore } from "react";

import { Segmented } from "@/components/ui/segmented";
import {
  copyKindLabels,
  copyKinds,
  defaultCopyKind,
  readCopyKind,
  storeCopyKind,
  subscribeCopyKind,
} from "@/features/scripture/copy-preference";

const options = copyKinds.map((kind) => ({ value: kind, label: copyKindLabels[kind] }));

/**
 * How the Bible reader behaves on this device. Like the theme, nothing here
 * is saved to the account: it is kept in this browser.
 */
export function BibleSettings() {
  // The default on the server and until hydration; the stored choice after it.
  const kind = useSyncExternalStore(subscribeCopyKind, readCopyKind, () => defaultCopyKind);

  return (
    <div>
      <Segmented
        label="Copy shortcut"
        name="bible-copy"
        options={options}
        value={kind}
        onChange={storeCopyKind}
        className="max-w-md"
      />
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        What Ctrl+C (Command+C on a Mac) copies when verses are selected in the Bible. The selection
        is cleared once it has been copied. The buttons beside a selection copy the text, the
        reference, or a link whatever is chosen here.
      </p>
    </div>
  );
}
