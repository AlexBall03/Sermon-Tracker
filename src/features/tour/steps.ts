import { routes } from "@/lib/site";
import type { TourStep } from "./model";

/**
 * The tour, in the order a person works: the workspace, capturing, the
 * library, the Bible, outlines, the Preaching Record, and a last word. Each
 * stop is a real page of the application with the real control pointed out;
 * nothing is drawn for the tour, opened, or saved.
 */
export const tourSteps: readonly TourStep[] = [
  {
    id: "dashboard",
    href: routes.dashboard,
    wide: ["dashboard-workspace"],
    narrow: ["dashboard-workspace"],
  },
  { id: "capture", href: routes.dashboard, wide: ["quick-capture"], narrow: ["tab-quick-capture"] },
  { id: "library", href: routes.library, wide: ["nav-library"], narrow: ["tab-library"] },
  { id: "bible", href: routes.bible, wide: ["nav-bible"], narrow: ["tab-bible"] },
  { id: "outlines", href: routes.outlines, wide: ["nav-outlines"], narrow: ["tab-outlines"] },
  {
    id: "preaching",
    href: routes.preachingRecord,
    // The section's own heading; the library's destination if it is not there.
    wide: ["section-preaching-record", "nav-library"],
    narrow: ["section-preaching-record", "tab-library"],
  },
  { id: "ready", href: routes.dashboard, wide: [], narrow: [] },
];
