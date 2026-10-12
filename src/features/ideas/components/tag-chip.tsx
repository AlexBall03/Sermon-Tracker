import { Tag } from "lucide-react";

import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * One tag, wherever a tag is shown. Neutral on purpose: tags are the person's
 * own labels, and a card may carry several beside its kind and its Scripture.
 */
export function TagChip({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-secondary px-2 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Tag className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** A row of an idea's tags: the first few, then how many more there are. */
export function TagList({
  tags,
  limit = 4,
  locale = defaultLocale,
  className,
}: {
  tags: { id: string; name: string }[];
  limit?: number;
  /** The interface language. English when omitted. */
  locale?: Locale;
  className?: string;
}) {
  const t = dictionary(locale, "library").tags;
  if (tags.length === 0) return null;
  const more = tags.length - limit;
  return (
    <ul
      aria-label={t.label}
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
    >
      {tags.slice(0, limit).map((tag) => (
        <li key={tag.id} className="max-w-full min-w-0">
          <TagChip>{tag.name}</TagChip>
        </li>
      ))}
      {more > 0 && (
        <li className="text-xs text-muted-foreground">
          +{more}
          <span className="sr-only">{t.more}</span>
        </li>
      )}
    </ul>
  );
}
