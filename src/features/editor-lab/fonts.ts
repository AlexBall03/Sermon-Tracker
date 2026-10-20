import {
  Arimo,
  Atkinson_Hyperlegible_Next,
  Cormorant_Garamond,
  Cousine,
  EB_Garamond,
  Figtree,
  Inter,
  JetBrains_Mono,
  Lora,
  Merriweather,
  Playfair_Display,
  Source_Sans_3,
  Source_Serif_4,
  Tinos,
} from "next/font/google";

/*
 * The document fonts (PS-1B.2B.2B): the fourteen families of the font
 * registry (`styles/model.ts`), self-hosted by `next/font` at build time and
 * served from `/_next/static/media`, which the service worker keeps once
 * fetched. Licenses (Google Fonts metadata): Tinos, Arimo, and Cousine are
 * Apache 2.0; the other eleven are SIL Open Font License 1.1.
 *
 * Nothing is preloaded: the `@font-face` rules come with the lab's CSS, and a
 * browser downloads a family's file only when text on the page uses it, so a
 * document in Lora downloads Lora alone. Each family has the `latin` subset,
 * which holds Spanish's letters and marks (á é í ó ú ü ñ ¿ ¡), roman and
 * italic, and every weight (variable fonts; Tinos and Cousine have 400 and
 * 700). Until a file arrives, and offline before it was ever fetched, text
 * is drawn in the fallback stack (`fontStack`), and the pages are measured
 * again when it arrives (`pagination/plugin.ts`).
 *
 * `next/font` needs each call written out, with literal options.
 */

const lora = Lora({
  variable: "--lab-font-lora",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const sourceSerif = Source_Serif_4({
  variable: "--lab-font-source-serif-4",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const ebGaramond = EB_Garamond({
  variable: "--lab-font-eb-garamond",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const merriweather = Merriweather({
  variable: "--lab-font-merriweather",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const tinos = Tinos({
  variable: "--lab-font-tinos",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const figtree = Figtree({
  variable: "--lab-font-figtree",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const inter = Inter({
  variable: "--lab-font-inter",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const sourceSans = Source_Sans_3({
  variable: "--lab-font-source-sans-3",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--lab-font-atkinson-hyperlegible-next",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
  // next/font has no fallback metrics for this family; its stack's system fonts stand in.
  adjustFontFallback: false,
});
const arimo = Arimo({
  variable: "--lab-font-arimo",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--lab-font-jetbrains-mono",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const cousine = Cousine({
  variable: "--lab-font-cousine",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const playfair = Playfair_Display({
  variable: "--lab-font-playfair-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});
const cormorant = Cormorant_Garamond({
  variable: "--lab-font-cormorant-garamond",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
});

/** The classes that define every `--lab-font-<key>` variable; set on the lab's workspace. */
export const labFontVariables = [
  lora,
  sourceSerif,
  ebGaramond,
  merriweather,
  tinos,
  figtree,
  inter,
  sourceSans,
  atkinson,
  arimo,
  jetbrainsMono,
  cousine,
  playfair,
  cormorant,
]
  .map((font) => font.variable)
  .join(" ");
