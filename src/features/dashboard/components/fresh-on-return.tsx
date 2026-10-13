"use client";

import { useFreshOnReturn } from "@/lib/use-fresh-on-return";

/**
 * Has the dashboard read again when it is come back to. What it summarizes is
 * edited elsewhere, and an outline's words are saved without revalidating any
 * page, so a copy of the dashboard the browser kept would show a sermon as it
 * was before the work. It draws nothing.
 */
export function FreshOnReturn() {
  useFreshOnReturn();
  return null;
}
