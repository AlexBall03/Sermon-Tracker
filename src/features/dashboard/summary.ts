import type { Stat } from "@/components/ui/stat-strip";

/**
 * The four figures the dashboard will summarise. They are shown together once
 * preaching history (Phase 3) exists and the summary is built (Phase 5), so
 * for now each says what it will measure instead of showing a number. Give an entry a
 * `value` in place of `pending` once its data is real.
 */
export const summaryStats: Stat[] = [
  { label: "Sermon ideas", pending: "Every sermon you are working towards." },
  { label: "Point ideas", pending: "Reusable points, counted once each." },
  { label: "In development", pending: "Ideas you have started building out." },
  { label: "Times preached", pending: "Each occasion a sermon was preached." },
];
