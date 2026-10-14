"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { legacySettingsHashes } from "../categories";

/**
 * Sends an address from when settings were one page (`/settings#install`,
 * `/settings#offline-capture`) to the category page that now holds what it
 * pointed at, replacing it in history so Back does not return to it. On the
 * overview only; an empty or unknown hash leaves the overview where it is.
 */
export function LegacySettingsHash() {
  const router = useRouter();
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (Object.hasOwn(legacySettingsHashes, hash)) router.replace(legacySettingsHashes[hash]);
  }, [router]);
  return null;
}
