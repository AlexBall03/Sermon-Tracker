const bar =
  "absolute inset-x-0.5 top-[calc(50%-0.875px)] h-[1.75px] rounded-full bg-current transition-transform duration-200 ease-out";

/** The mobile menu button's glyph: two lines that close into a cross while the menu is open. */
export function MenuIcon({ open }: { open: boolean }) {
  return (
    <span aria-hidden data-open={open || undefined} className="group/icon relative block size-5">
      <span
        className={`${bar} -translate-y-1 group-data-open/icon:translate-y-0 group-data-open/icon:rotate-45`}
      />
      <span
        className={`${bar} translate-y-1 group-data-open/icon:translate-y-0 group-data-open/icon:-rotate-45`}
      />
    </span>
  );
}
