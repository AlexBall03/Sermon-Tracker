"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Reads a page again when it is come back to. Next keeps a page it has left,
 * hidden, and shows that copy again on Back; what was changed in the meantime
 * would be shown as it was before. A link to the page already asks the server
 * afresh, so this only matters for the kept copy. An effect runs again when a
 * kept page is shown, which is the moment to ask.
 *
 * For a page that summarizes what is edited elsewhere: the outlines overview,
 * and the dashboard.
 */
export function useFreshOnReturn() {
  const router = useRouter();
  const latest = useRef(router);
  const shown = useRef(false);
  useEffect(() => {
    latest.current = router;
  });
  // No dependencies: it is to run when the page is shown, and for no other reason.
  useEffect(() => {
    if (shown.current) latest.current.refresh();
    shown.current = true;
  }, []);
}
