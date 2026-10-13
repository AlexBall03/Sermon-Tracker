import Link from "next/link";
import { ListTree } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { newOutlineHref, outlineHref } from "../outlines-query";

/**
 * The way from a sermon to its outline, wherever the sermon is shown. With an
 * outline it opens the editor; without one it leads to where the sermon is
 * given one, a page that makes nothing by being opened. Offer it only for an
 * idea filed as a sermon.
 *
 * It is a link, never a button that creates: where the sermon is being edited
 * the leave guard catches it like any other link, and a slip of the finger on
 * a card makes no outline.
 *
 * On a library card it sits above the card's own link. In the list view there
 * is room for the icon only; it is still named in full, with its sermon.
 */
export function OutlineLink({
  sermon,
  outlineId,
  onCard = false,
  locale = defaultLocale,
  className,
}: {
  sermon: { id: string; title: string };
  /** The sermon's outline, or null when it has none yet. */
  outlineId: string | null;
  /** One of many in a list of ideas: quieter, and named for its sermon. */
  onCard?: boolean;
  /** The interface language. English when omitted. */
  locale?: Locale;
  className?: string;
}) {
  const t = dictionary(locale, "outlines").link;
  const label = outlineId ? t.open : t.create;
  return (
    <Link
      href={outlineId ? outlineHref(outlineId) : newOutlineHref(sermon.id)}
      aria-label={
        onCard ? (outlineId ? t.openNamed(sermon.title) : t.createNamed(sermon.title)) : undefined
      }
      title={onCard ? label : undefined}
      className={cn(
        buttonVariants({ variant: onCard ? "ghost" : "outline", size: onCard ? "sm" : "default" }),
        onCard && "relative z-10 px-2.5 text-muted-foreground hover:text-primary",
        className,
      )}
    >
      <ListTree aria-hidden />
      <span className={onCard ? "list-view:sr-only" : undefined}>{onCard ? t.short : label}</span>
    </Link>
  );
}
