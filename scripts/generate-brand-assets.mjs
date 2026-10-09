// Renders raster brand assets from public/brand/mark.svg using Playwright's
// Chromium. Re-run with `npm run brand:assets` whenever the mark changes.
// The share card loads Playfair Display and Montserrat from Google Fonts,
// so this needs network access; it is a one-off authoring step, not part
// of the build.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const mark = await readFile("public/brand/mark.svg", "utf8");
// Full-bleed tile for platforms that apply their own corner mask (iOS).
const squareMark = mark.replace('rx="23"', 'rx="0"');

const iconPage = (svg) =>
  `<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`;

const sharePage = `
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500&family=Playfair+Display:wght@600&display=block">
<style>
  html,body{margin:0}
  body{width:1200px;height:630px;display:flex;align-items:center;justify-content:center;gap:56px;
    background:radial-gradient(60% 80% at 22% 50%,rgba(45,169,133,.22),transparent 70%),#101114;color:#f5f2ea}
  svg{width:230px;height:230px;filter:drop-shadow(0 18px 40px rgba(0,0,0,.35))}
  h1{margin:0;font:600 104px/1 "Playfair Display",serif;letter-spacing:-.02em}
  p{margin:26px 0 0;font:500 30px/1 Montserrat,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#d5b574}
</style>
${mark}<div><h1>Sermon Tracker</h1><p>Capture. Develop. Preach.</p></div>`;

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

  await shoot(iconPage(squareMark), 180, 180, "src/app/apple-icon.png", false);
  await shoot(iconPage(mark), 192, 192, "public/brand/icon-192.png", true);
  await shoot(iconPage(mark), 512, 512, "public/brand/icon-512.png", true);
  await shoot(sharePage, 1200, 630, "src/app/opengraph-image.png", false);
} finally {
  await browser.close();
}
