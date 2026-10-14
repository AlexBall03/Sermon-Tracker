// Renders raster brand assets from public/brand/mark.svg using Playwright's
// Chromium. Re-run with `npm run brand:assets` whenever the mark changes, or
// `npm run brand:assets -- share` for the share card alone, or
// `npm run brand:assets -- icons` for the icons alone. The share card
// (scripts/brand/share-card.mjs) loads Playfair Display, Figtree, and Lora
// from Google Fonts, so this needs network access; it is a one-off authoring
// step, not part of the build, and its output is committed.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

import { sharePage } from "./brand/share-card.mjs";

const mark = await readFile("public/brand/mark.svg", "utf8");
// Full-bleed tile for platforms that apply their own corner mask (iOS).
const squareMark = mark.replace('rx="23"', 'rx="0"');
// Full bleed with the book drawn at 80%, for platforms that cut the icon to
// their own shape (Android's maskable icons): every part of the book is then
// inside the safe circle of radius 40 that any mask keeps.
const maskableMark = squareMark.replace(
  '<g transform="translate(0 0.5)"',
  '<g transform="translate(50 50.4) scale(0.8) translate(-50 -50)"',
);
if (maskableMark === squareMark) throw new Error("mark.svg changed: update the maskable transform");
const shareOnly = process.argv.includes("share");
// `-- icons`: the icons alone, without the share card (which needs network access for its fonts).
const iconsOnly = process.argv.includes("icons");

const iconPage = (svg) =>
  `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`;

const browser = await chromium.launch();
try {
  const shoot = async (html, width, height, path, omitBackground) => {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await writeFile(path, await page.screenshot({ omitBackground }));
    await page.close();
    console.log("wrote", path);
  };

  if (!shareOnly) {
    await shoot(iconPage(squareMark), 180, 180, "src/app/apple-icon.png", false);
    await shoot(iconPage(mark), 192, 192, "public/brand/icon-192.png", true);
    await shoot(iconPage(mark), 512, 512, "public/brand/icon-512.png", true);
    await shoot(iconPage(maskableMark), 192, 192, "public/brand/icon-maskable-192.png", false);
    await shoot(iconPage(maskableMark), 512, 512, "public/brand/icon-maskable-512.png", false);
  }
  if (!iconsOnly) {
    await shoot(sharePage(mark), 1200, 630, "src/app/opengraph-image.png", false);
  }
} finally {
  await browser.close();
}
