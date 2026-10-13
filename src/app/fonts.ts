import { Figtree, Lora, Playfair_Display } from "next/font/google";

// All interface text: navigation, controls, tables, forms, body copy.
const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

// Headlines only: the wordmark, page titles, dialog titles. Never italic.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

// Sermon material, set to be read: Scripture, references, idea titles.
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
});

/** The three families as classes for `<html>`: the root layout's, and the root error page's. */
export const fontVariables = `${figtree.variable} ${playfair.variable} ${lora.variable}`;
