import type { Stat } from "@/components/ui/stat-strip";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";

/**
 * The four figures the dashboard will summarise. They are shown together once
 * preaching history (Phase 3) exists and the summary is built (Phase 5), so
 * for now each says what it will measure instead of showing a number. Give an entry a
 * `value` in place of `pending` once its data is real.
 */
export function summaryStats(locale: Locale = defaultLocale): Stat[] {
  return dictionary(locale, "dashboard").summary.stats;
}
