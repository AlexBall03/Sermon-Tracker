import { useId } from "react";

/**
 * Sermon Tracker icon mark: an open Bible with a checklist on the right-hand
 * page and a bookmark ribbon over the top of the left, on a rounded-square
 * tile. The ribbon is shaded where it folds over the page edge, and the two
 * lines of text beside it stop short of it instead of running underneath.
 *
 * Redrawn as flat vector from the brand board (docs/brand/brand-board.png).
 * The mark is a fixed brand asset, so its colours are literal and do not
 * follow the UI theme. Keep public/brand/mark.svg and src/app/icon.svg in
 * step with any change to the geometry here.
 */

type Variant = "primary" | "dark" | "light" | "mono";

const palettes: Record<
  Variant,
  { tile: [string, string]; page: string; ink: string; script: string; bookmark: string }
> = {
  primary: {
    tile: ["#12805f", "#0b3d2e"],
    page: "#f8f6ed",
    ink: "#0b3d2e",
    script: "#a7b89f",
    bookmark: "#d4af6b",
  },
  dark: {
    tile: ["#273244", "#141b27"],
    page: "#f8f6ed",
    ink: "#1f2937",
    script: "#a7b89f",
    bookmark: "#d4af6b",
  },
  light: {
    tile: ["#fbfaf4", "#efecdf"],
    page: "#0b3d2e",
    ink: "#f8f6ed",
    script: "#a7b89f",
    bookmark: "#d4af6b",
  },
  mono: {
    tile: ["#111111", "#111111"],
    page: "#ffffff",
    ink: "#111111",
    script: "#111111",
    bookmark: "#111111",
  },
};

// The ribbon sways slightly along its length and its tail is cut unevenly, as cloth would be.
const ribbon =
  "M36 23.2c0-.8.6-1.2 1.400-1.200h4.900c.8 0 1.300.400 1.300 1.200 .6 6.800-.800 15.800-.100 23.300l-3.900-3.700-3.600 4.200c-.700-7.500.700-16.500 0-23.800z";

type LogoMarkProps = {
  variant?: Variant;
  /** Accessible name. Omit when the mark sits beside the wordmark. */
  title?: string;
  className?: string;
};

export function LogoMark({ variant = "primary", title, className }: LogoMarkProps) {
  const gradientId = useId();
  const c = palettes[variant];

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-variant={variant}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.tile[0]} />
          <stop offset="1" stopColor={c.tile[1]} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill={`url(#${gradientId})`} />
      <g transform="translate(0 0.5)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* cover */}
        <path
          d="M14 31v39.5h29.5c2.4 0 3.2 4.5 6.5 4.5s4.1-4.5 6.5-4.5H86V31"
          stroke={c.page}
          strokeWidth="2.8"
        />
        {/* pages */}
        <path d="M49 31.5C43.5 26.5 30 25 19.5 27.6V64c10.5-2.6 24-1.6 29.5 3.2z" fill={c.page} />
        <path d="M51 31.5C56.5 26.5 70 25 80.5 27.6V64c-10.5-2.6-24-1.6-29.5 3.2z" fill={c.page} />
        {/* left page: flowing text */}
        <g stroke={c.script} strokeWidth="2.5">
          <path d="M25 37c2.8-.7 5.6-1 8.3-.9" />
          <path d="M25 45c2.8-.7 5.6-1 8.3-.9" />
          <path d="M25 53c6.5-1.6 13-1 18.5 1.8" />
        </g>
        {/* bookmark: ribbon over the top of the left page, darker where it folds over the edge, with a faint shadow on the page */}
        {variant !== "mono" && (
          <path d={ribbon} transform="translate(.9 .7)" fill="#000" opacity="0.1" />
        )}
        <path d={ribbon} fill={c.bookmark} />
        <path
          d="M36 23.2c0-.8.6-1.2 1.400-1.200h4.900c.8 0 1.300.400 1.300 1.200l.150 5.300c-2.300-.900-4.900-1.500-7.600-1.800z"
          fill="#000"
          opacity="0.18"
        />
        {/* right page: checklist */}
        <g stroke={c.ink} strokeWidth="2.5">
          <path d="M55.5 37.6l2.2 2.3 3.8-4.8M65 37.5h10.5" />
          <path d="M55.5 45.6l2.2 2.3 3.8-4.8M65 45.5h10.5" />
          <path d="M55.5 53.6l2.2 2.3 3.8-4.8M65 53.5h10.5" />
        </g>
      </g>
    </svg>
  );
}
