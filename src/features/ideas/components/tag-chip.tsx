import { Tag } from "lucide-react";

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
  className,
}: {
  tags: { id: string; name: string }[];
  limit?: number;
  className?: string;
}) {
  if (tags.length === 0) return null;
  const more = tags.length - limit;
  return (
    <ul aria-label="Tags" className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      {tags.slice(0, limit).map((tag) => (
        <li key={tag.id} className="max-w-full min-w-0">
          <TagChip>{tag.name}</TagChip>
        </li>
      ))}
      {more > 0 && (
        <li className="text-xs text-muted-foreground">
          +{more}
          <span className="sr-only"> more</span>
        </li>
      )}
    </ul>
  );
}
