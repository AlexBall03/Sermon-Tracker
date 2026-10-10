import { cn } from "@/lib/utils";

type AvatarProps = {
  /** The profile picture, when the person has set one. */
  imageUrl?: string | null;
  initials: string;
  className?: string;
};

/** A person's picture, or their initials. Decorative: name the person beside it. */
export function Avatar({ imageUrl, initials, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-secondary font-semibold text-foreground select-none",
        className,
      )}
    >
      {imageUrl ? (
        // Served and resized by the sign-in provider, so the image optimiser is not involved.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
