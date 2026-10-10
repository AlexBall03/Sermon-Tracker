import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

type ShortcutLinkProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

/** A card that is one link, so it may have hover and pressed states. */
export function ShortcutLink({ href, icon: Icon, title, description }: ShortcutLinkProps) {
  return (
    <Link
      href={href}
      className="group/shortcut flex items-start gap-3.5 rounded-xl border bg-surface p-5 shadow-card transition-[border-color,background-color] duration-150 hover:border-primary/70 active:bg-foreground/5"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight
        className="mt-1 size-4 shrink-0 text-muted-foreground transition-[color,translate] duration-150 group-hover/shortcut:translate-x-0.5 group-hover/shortcut:text-primary"
        aria-hidden
      />
    </Link>
  );
}
