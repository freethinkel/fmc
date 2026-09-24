// Renders static/og-default.png — the 1200x630 card a link unfurls to when the page behind it
// isn't one watchface. Committed output; this only exists so it can be redrawn when the mark or
// the pitch changes: `pnpm run og-card`.
//
// The mark itself comes from static/icons/icon.svg, so the card can't drift from the app icon.
// Chromium is the one playwright already installs for the browser tests — no new dependency.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const STATIC = join(dirname(fileURLToPath(import.meta.url)), "..", "static");

// the dark-scheme pair from tokens.css, spelled out — a PNG can't read a custom property
const INK = "#131313";
const PAPER = "#f2f2f2";

const mark = await readFile(join(STATIC, "icons", "icon.svg"), "utf8");

const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400..600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    background: ${INK}; color: ${PAPER};
    font-family: Geist, system-ui, sans-serif;
    display: flex; flex-direction: column; justify-content: center; gap: 36px; padding: 0 96px;
  }
  .mark { width: 124px; height: 124px; border-radius: 26px; overflow: hidden; }
  .mark svg { display: block; width: 100%; height: 100%; }
  /* both lines are sized to sit on one line at 1008px of usable width */
  h1 { font-size: 52px; font-weight: 600; letter-spacing: -1px; }
  p { font-size: 28px; font-weight: 400; color: oklch(from ${PAPER} l c h / 55%); }
</style></head>
<body>
  <div class="mark">${mark}</div>
  <h1>Watchfaces for the CMF Watch Pro 2</h1>
  <p>Browse, edit and install — straight from the browser, no phone app</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });

await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const png = await page.screenshot({ type: "png" });

await browser.close();
await writeFile(join(STATIC, "og-default.png"), png);
console.log(`static/og-default.png — ${(png.length / 1024).toFixed(1)} kB`);
