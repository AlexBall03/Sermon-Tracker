import type { Stat } from "@/components/ui/stat-strip";
import type { WorkspaceCounts } from "@/features/ideas/ideas";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";

/**
 * The dashboard's four figures. The first three describe the ideas the account
 * is keeping now (archived ones left out); the last is every occasion it has
 * ever recorded. Each is counted by the database when the page is asked for:
 * nothing is stored. A figure that could not be read is null and is shown as
 * unavailable, never as zero; a real zero is shown as zero.
 */
export function summaryStats(
  counts: WorkspaceCounts | null,
  timesPreached: number | null,
  locale: Locale = defaultLocale,
): Stat[] {
  const t = dictionary(locale, "dashboard").summary;
  return [
    { label: t.sermons, value: counts?.sermons ?? null },
    { label: t.points, value: counts?.points ?? null },
    { label: t.developing, value: counts?.developing ?? null },
    { label: t.preached, value: timesPreached },
  ];
}
