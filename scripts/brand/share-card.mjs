// The share card: the one image shown when a link to the site is shared
// (src/app/opengraph-image.png, 1200 × 630). Rendered by
// scripts/generate-brand-assets.mjs; this file only writes the page it shoots.
//
// It is always dark, whatever the visitor's theme. On the left, the brand and
// the message; on the right, the dashboard as a window and as a phone, drawn
// again here with the application's dark tokens and simplified so it still
// reads when the card is a few hundred pixels wide.
//
// Every word and figure on the screens comes from the landing page's fictional
// workspace (`demoWorkspace`, src/components/marketing/demo.ts) and the
// dictionaries, imported directly, so the card cannot disagree with the
// landing page. Nothing here reads an account.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

// The application's own modules use the `@/` alias and leave out extensions,
// as its bundler allows. Node strips their types itself; this resolves the rest.
registerHooks({
  resolve(specifier, context, nextResolve) {
    const base = specifier.startsWith("@/")
      ? `${root}src/${specifier.slice(2)}`
      : specifier.startsWith(".") && context.parentURL?.endsWith(".ts")
        ? fileURLToPath(new URL(specifier, context.parentURL))
        : null;
    if (base) {
      for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
        if (/\.ts$/.test(candidate) && existsSync(candidate)) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { demoWorkspace } = await import("../../src/components/marketing/demo.ts");
const { dictionary } = await import("../../src/i18n/index.ts");
const { formatDate } = await import("../../src/lib/format.ts");
const { welcomeTitle } = await import("../../src/features/dashboard/greeting.ts");

/** The words of the card itself. The headline is the landing page's promise, said once. */
export const shareCopy = {
  headline: ["Every Great", "Sermon Starts", "Somewhere."],
  supporting: ["Capture ideas. Build outlines.", "Keep your preaching record."],
};

const escape = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

// Lucide's plus, list, and the four destinations' icons, as the application draws them.
const icon = {
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  dashboard:
    '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  library: '<path d="M16 6l4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
  outlines:
    '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  bible:
    '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
};
const svg = (name, size, color = "currentColor") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon[name]}</svg>`;

/** The page to shoot, given the mark's SVG source. */
export function sharePage(mark) {
  const locale = "en";
  const workspace = demoWorkspace(locale);
  const nav = dictionary(locale, "navigation");
  const t = dictionary(locale, "dashboard");
  const statuses = dictionary(locale, "ideas").statuses;
  const results = dictionary(locale, "library").results;
  const entries = dictionary(locale, "outlines").overview.entries;

  const destinations = ["dashboard", "library", "outlines", "bible"];
  const working = workspace.continueWorking.slice(0, 2);
  const developed = (idea) =>
    `${results.lastDeveloped} ${formatDate(idea.lastDevelopedAt, locale)}`;
  const stats = [
    [t.summary.sermons, workspace.counts.sermons],
    [t.summary.points, workspace.counts.points],
    [t.summary.developing, workspace.counts.developing],
    [t.summary.preached, workspace.timesPreached],
  ];
  const tile = (size) => mark.replace("<svg ", `<svg width="${size}" height="${size}" `);
  const lockup = (size, text) =>
    `<span class="lockup">${tile(size)}<span style="font-size:${text}px">Sermon Tracker</span></span>`;

  const sermonRow = ({ sermon, entryCount }) => `
    <div class="row">
      <div class="row-text">
        <p class="title">${escape(sermon.title)}</p>
        <p class="meta"><b>${escape(statuses[sermon.status])}</b> · ${escape(developed(sermon))}</p>
        <p class="meta outline">${svg("list", 15)}${escape(entryCount === null ? t.continue.noOutline : `${t.continue.outline} · ${entries(entryCount)}`)}</p>
      </div>
      <span class="button">${escape(t.continue.resume)}${svg("arrow", 16)}</span>
    </div>`;

  const window = `
    <div class="window">
      <div class="bar">
        ${lockup(30, 20)}
        <div class="links">
          ${destinations
            .map(
              (id) =>
                `<span class="${id === "dashboard" ? "link current" : "link"}">${escape(nav[id])}</span>`,
            )
            .join("")}
        </div>
        <span class="capture">${svg("plus", 17, "#2da985")}${escape(nav.capture)}</span>
        <span class="avatar">${escape(workspace.initials)}</span>
      </div>
      <div class="page">
        <p class="greeting">${escape(welcomeTitle(workspace.firstName, locale))}</p>
        <p class="lede">${escape(t.description)}</p>
        <div class="grid">
          <div class="panel wide">
            <p class="panel-title">${escape(t.continue.title)}</p>
            ${working.map(sermonRow).join("")}
          </div>
          <div class="panel">
            <p class="panel-title">${escape(t.revisit.title)}</p>
            ${workspace.revisit
              .slice(0, 2)
              .map(
                (idea) =>
                  `<div class="row small"><div class="row-text"><p class="title">${escape(idea.title)}</p><p class="meta"><b>${escape(statuses[idea.status])}</b></p></div></div>`,
              )
              .join("")}
          </div>
        </div>
        <div class="stats">
          ${stats.map(([label, value]) => `<div><p class="stat-label">${escape(label)}</p><p class="stat">${value}</p></div>`).join("")}
        </div>
      </div>
    </div>`;

  const [first] = working;
  const phone = `
    <div class="phone">
      <div class="screen">
        <div class="bar">${lockup(26, 17)}<span class="avatar">${escape(workspace.initials)}</span></div>
        <div class="page">
          <p class="greeting">${escape(welcomeTitle(workspace.firstName, locale))}</p>
          <div class="panel">
            <p class="panel-title">${escape(t.continue.title)}</p>
            <div class="row">
              <div class="row-text">
                <p class="title">${escape(first.sermon.title)}</p>
                <p class="meta"><b>${escape(statuses[first.sermon.status])}</b></p>
              </div>
            </div>
          </div>
          <div class="mini-stats">
            ${stats
              .slice(0, 2)
              .map(
                ([label, value]) =>
                  `<div><p class="stat-label">${escape(label)}</p><p class="stat">${value}</p></div>`,
              )
              .join("")}
          </div>
        </div>
        <div class="tabs">
          ${svg("dashboard", 22, "#2da985")}${svg("library", 22)}
          <span class="disc">${svg("plus", 22, "#2da985")}</span>
          ${svg("outlines", 22)}${svg("bible", 22)}
        </div>
      </div>
    </div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=Lora:wght@500&family=Playfair+Display:wght@500;600&display=block">
<style>
  /* The application's dark tokens (src/app/globals.css). */
  :root {
    --background: #0e0f11; --surface: #17191c; --raised: #1f2125;
    --foreground: #efebe2; --muted: #a3a4a1;
    --border: rgb(255 255 255 / 0.09); --input: rgb(255 255 255 / 0.16);
    --primary: #2da985; --lamp: #5ff0be; --gold: #d5b574;
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative; background: var(--background); color: var(--foreground);
    font-family: Figtree, sans-serif; -webkit-font-smoothing: antialiased;
  }
  /* the one light, behind the product */
  .glow {
    position: absolute; left: 520px; top: -40px; width: 900px; height: 760px;
    background: radial-gradient(closest-side, rgb(45 169 133 / 0.36), rgb(45 169 133 / 0.10) 60%, transparent);
  }
  .floor {
    position: absolute; inset: auto 0 0 0; height: 260px;
    background: radial-gradient(60% 100% at 70% 100%, rgb(95 240 190 / 0.07), transparent);
  }

  /* left: the brand and the message */
  .copy { position: absolute; left: 68px; top: 64px; bottom: 64px; width: 470px; display: flex; flex-direction: column; z-index: 3; }
  .lockup { display: inline-flex; align-items: center; gap: 12px; font-family: "Playfair Display", serif; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; }
  .lockup svg { border-radius: 23%; flex: none; }
  .brand .lockup { gap: 16px; }
  .brand .lockup svg { box-shadow: 0 10px 30px rgb(0 0 0 / 0.45); }
  h1 { margin-top: auto; font: 500 64px/1.06 "Playfair Display", serif; letter-spacing: -0.022em; }
  h1 span { display: block; }
  .rule { width: 56px; height: 2px; border-radius: 2px; background: var(--gold); margin: 30px 0 24px; }
  .supporting { font-size: 24px; line-height: 1.4; font-weight: 500; color: #c9c6be; }
  .supporting span { display: block; }

  /* right: the product */
  .stage { position: absolute; inset: 0; perspective: 2400px; z-index: 1; }
  .window {
    position: absolute; left: 580px; top: 92px; width: 900px; height: 600px;
    border-radius: 18px; background: var(--background); border: 1px solid var(--input);
    overflow: hidden; transform-origin: 0 50%; transform: rotateY(-13deg) rotateX(3deg);
    box-shadow: 0 40px 90px rgb(0 0 0 / 0.55), inset 0 1px 0 rgb(255 255 255 / 0.06);
  }
  /* the lit edge, on the window's top border */
  .window::before {
    content: ""; position: absolute; top: -1px; left: 18%; width: 46%; height: 1px; z-index: 2;
    background: linear-gradient(to right, transparent, var(--lamp), transparent);
    box-shadow: 0 0 10px 1px rgb(95 240 190 / 0.45);
  }
  .bar { display: flex; align-items: center; gap: 22px; height: 64px; padding: 0 26px; border-bottom: 1px solid var(--border); background: rgb(23 25 28 / 0.7); }
  .links { display: flex; gap: 6px; flex: 1; }
  .link { position: relative; padding: 6px 11px; font-size: 16px; font-weight: 500; color: var(--muted); }
  .link.current { color: var(--foreground); }
  .link.current::after { content: ""; position: absolute; left: 11px; right: 11px; bottom: -2px; height: 2px; border-radius: 2px; background: var(--primary); }
  .capture { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 16px 0 12px; border-radius: 999px; border: 1px solid var(--input); background: var(--surface); font-size: 16px; font-weight: 600; }
  .avatar { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--input); background: var(--surface); font-size: 13px; font-weight: 600; color: var(--muted); flex: none; }
  .window .page { padding: 34px 34px 0; }
  .greeting { font: 500 38px/1.15 "Playfair Display", serif; letter-spacing: -0.015em; }
  .lede { margin-top: 8px; font-size: 17px; color: var(--muted); }
  .grid { display: grid; grid-template-columns: 1.75fr 1fr; gap: 20px; margin-top: 26px; }
  .panel { border-radius: 14px; border: 1px solid var(--border); background: var(--surface); box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.04); overflow: hidden; }
  .panel-title { padding: 18px 20px 14px; font-size: 19px; font-weight: 600; letter-spacing: -0.015em; border-bottom: 1px solid var(--border); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 16px 20px; }
  .row + .row { border-top: 1px solid var(--border); }
  .row-text { min-width: 0; }
  .title { font: 500 21px/1.25 Lora, serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row.small .title { font-size: 18px; }
  .meta { margin-top: 6px; font-size: 14px; color: var(--muted); white-space: nowrap; }
  .meta b { color: var(--foreground); font-weight: 600; }
  .meta.outline { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .button { display: inline-flex; align-items: center; gap: 6px; height: 38px; padding: 0 14px; border-radius: 9px; border: 1px solid var(--input); background: var(--surface); font-size: 15px; font-weight: 600; white-space: nowrap; flex: none; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: 20px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); }
  .stats > div { padding: 16px 20px; }
  .stats > div + div { border-left: 1px solid var(--border); }
  .stat-label { font-size: 14px; font-weight: 500; color: var(--muted); }
  .stat { margin-top: 6px; font-size: 32px; font-weight: 600; letter-spacing: -0.02em; line-height: 1; }

  .phone {
    position: absolute; left: 916px; top: 232px; width: 246px; height: 470px; z-index: 2;
    padding: 8px; border-radius: 40px; background: var(--raised); border: 1px solid var(--input);
    box-shadow: 0 30px 70px rgb(0 0 0 / 0.65), 0 0 0 1px rgb(0 0 0 / 0.4);
    transform: rotate(2.5deg);
  }
  .screen { height: 100%; border-radius: 32px; overflow: hidden; background: var(--background); border: 1px solid var(--border); display: flex; flex-direction: column; }
  .phone .bar { height: 54px; padding: 0 16px; justify-content: space-between; gap: 8px; }
  .phone .avatar { width: 30px; height: 30px; font-size: 11px; }
  .phone .page { flex: 1; padding: 22px 16px 0; }
  .phone .greeting { font-size: 25px; }
  .phone .panel { margin-top: 16px; }
  .phone .panel-title { padding: 12px 14px 10px; font-size: 15px; }
  .phone .row { padding: 12px 14px; }
  .phone .title { font-size: 15px; }
  .phone .meta { font-size: 12px; }
  .mini-stats { display: grid; grid-template-columns: 1fr 1fr; margin-top: 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
  .mini-stats > div { padding: 10px 12px; }
  .mini-stats > div + div { border-left: 1px solid var(--border); }
  .mini-stats .stat-label { font-size: 11px; }
  .mini-stats .stat { font-size: 22px; }
  .tabs { display: flex; align-items: center; justify-content: space-around; height: 60px; padding: 0 8px 6px; border-top: 1px solid var(--border); background: rgb(23 25 28 / 0.7); color: var(--muted); }
  .disc { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; border: 1px solid var(--input); background: var(--surface); }

  /* the product fades into the dark at the foot, so nothing ends on a hard edge */
  .fade { position: absolute; inset: auto 0 0 520px; height: 90px; z-index: 2; background: linear-gradient(to top, var(--background), transparent); }
</style></head>
<body>
  <div class="glow"></div><div class="floor"></div>
  <div class="stage">${window}${phone}</div>
  <div class="fade"></div>
  <div class="copy">
    <div class="brand">${lockup(58, 32)}</div>
    <h1>${shareCopy.headline.map((line) => `<span>${escape(line)}</span>`).join("")}</h1>
    <div class="rule"></div>
    <p class="supporting">${shareCopy.supporting.map((line) => `<span>${escape(line)}</span>`).join("")}</p>
  </div>
</body></html>`;
}
