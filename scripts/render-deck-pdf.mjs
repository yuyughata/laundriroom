#!/usr/bin/env node
// Render a slide deck in docs/presentations/<deck>/ to PDF: the slides
// (1920×1080 pages) and the speaker notes (A4).
//
//   node scripts/render-deck-pdf.mjs docs/presentations/team-training \
//        docs/presentations/team-training.pdf docs/presentations/team-training-speaker-notes.pdf
//
// Needs Playwright with Chromium (npm i -D playwright && npx playwright install chromium).
// Slides reference images as /_blob/<id> (the deck's claude.ai asset store);
// they're read from <deck>/images/<id>.png. The viewer's icon font isn't
// available offline, so <x-icon> is drawn with simple line icons below.
// Fails if a slide's content runs into its footer or off the slide.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

import { createRequire } from "node:module";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  try { ({ chromium } = createRequire(import.meta.url)("playwright")); } // a global install (NODE_PATH)
  catch { console.error("Playwright isn't installed: npm i -D playwright && npx playwright install chromium"); process.exit(1); }
}

const [deckDir, outSlides, outNotes] = process.argv.slice(2);
if (!deckDir || !outSlides || !outNotes) {
  console.error("usage: node scripts/render-deck-pdf.mjs <deck dir> <slides.pdf> <notes.pdf>");
  process.exit(1);
}
const dir = path.resolve(deckDir);
const deck = JSON.parse(fs.readFileSync(path.join(dir, "deck.json"), "utf8"));
// Line icons standing in for the viewer's icon font (24×24, stroke).
const I = {
  Book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6.5A2.5 2.5 0 0 0 4 21.5v-2z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  Chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  Chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  Check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  CheckCircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  Database: '<ellipse cx="12" cy="5.5" rx="8" ry="2.5"/><path d="M4 5.5v13c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-13"/><path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5"/>',
  Globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  Home: '<path d="M3 11l9-7 9 7"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  Key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M16 7l3 3"/><path d="M14 9l2 2"/>',
  Lightning: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  Link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  Lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  PaperPlane: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7z"/>',
  Search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  Settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  Star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z"/>',
  ThumbsUp: '<path d="M7 11v9H4v-9h3z"/><path d="M7 11l4-8a2.5 2.5 0 0 1 2.5 2.5V9h5.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.5 20H7"/>',
  Tool: '<path d="M14.7 6.3a4 4 0 0 0-5.3 5.3L3 18l3 3 6.4-6.4a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.8-.7-.7-2.8 2.5-2.5z"/>',
  Trust: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  Users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.6c2.5.3 4.4 2.1 5 5.4"/>',
  Verified: '<path d="M12 2.5l2.4 1.7 2.9-.1.9 2.8 2.3 1.8-.9 2.8.9 2.8-2.3 1.8-.9 2.8-2.9-.1L12 21.5l-2.4-1.7-2.9.1-.9-2.8-2.3-1.8.9-2.8-.9-2.8 2.3-1.8.9-2.8 2.9.1L12 2.5z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  Warning: '<path d="M12 3.5L2.5 20h19L12 3.5z"/><path d="M12 10v4.5"/><path d="M12 17.5v.5"/>',
};
const icon = (m, name, style) => {
  if (!I[name]) throw new Error("no icon " + name);
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="${style};flex:none">${I[name]}</svg>`;
};
const fix = (html) => html
  .replace(/<x-icon name="([A-Za-z]+)" style="([^"]*)"><\/x-icon>/g, icon)
  .replace(/<x-shape kind="arrow-right" style="([^"]*)"><\/x-shape>/g,
    (m, st) => `<div style="${st};flex:none;clip-path:polygon(0 30%,62% 30%,62% 0,100% 50%,62% 100%,62% 70%,0 70%)"></div>`)
  .replace(/src="\/_blob\/([0-9a-f]{32})"/g, 'src="/images/$1.png"');

const slides = deck.order.map((id) => {
  const raw = fs.readFileSync(path.join(dir, "slides", id + ".html"), "utf8");
  const notes = (raw.match(/<aside>([\s\S]*?)<\/aside>/) || [])[1] ?? "";
  const title = (raw.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/) || [])[1]?.replace(/<[^>]+>/g, "") ?? id;
  return { id, html: fix(raw).replace(/<aside>[\s\S]*?<\/aside>/, ""), notes, title };
});
const fonts = Object.values(deck.faces ?? {}).map((f) => `<link rel="stylesheet" href="${f.href}">`).join("");
const base = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
section{width:1920px;height:1080px;position:relative;overflow:hidden;break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}
section:last-of-type{break-after:auto}
section p,section h1,section h2,section h3,section ul{margin:0}
section ul{padding-left:1.2em}
section table{width:100%;border-collapse:collapse;table-layout:fixed}
section th,section td{padding:14px 28px;text-align:left;vertical-align:top}
section th{font-weight:600}
section img{display:block}`;
const slidesPage = `<!doctype html><html><head><meta charset="utf-8">${fonts}<style>${base}@page{size:1920px 1080px;margin:0}</style></head><body>${slides.map((s) => s.html).join("\n")}</body></html>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const notesPage = `<!doctype html><html><head><meta charset="utf-8">${fonts}<style>
@page{size:A4;margin:18mm 18mm 20mm}
body{font-family:Inter,Arial,sans-serif;color:#0F1B2D;font-size:11pt;line-height:1.5}
h1{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:24pt;margin:0 0 4pt}
.sub{color:#5B6678;margin:0 0 18pt}
.n{break-inside:avoid;margin:0 0 14pt;padding-top:10pt;border-top:1px solid #E6E1D6}
.n b{font-family:Fraunces,Georgia,serif;font-weight:500;font-size:13pt}
.n span{color:#8A6A2B;font-size:9pt;letter-spacing:.08em;text-transform:uppercase;margin-right:8pt}
.n p{margin:4pt 0 0}
</style></head><body><h1>${esc(deck.title)}</h1><p class="sub">Speaker notes · ${slides.length} slides</p>
${slides.map((s, i) => `<div class="n"><span>Slide ${i + 1}</span><b>${s.title}</b><p>${s.notes}</p></div>`).join("\n")}</body></html>`;
const pages = { "/_slides.html": slidesPage, "/_notes.html": notesPage };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (pages[url]) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(pages[url]); }
  const f = path.join(dir, url);
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": f.endsWith(".png") ? "image/png" : "text/html; charset=utf-8" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1920, height: 1080 } });
const missing = [];
p.on("response", (r) => r.status() >= 400 && missing.push(r.url()));
await p.goto(`http://localhost:${port}/_slides.html`, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
const fontsOk = await p.evaluate(() => [document.fonts.check("48px Fraunces"), document.fonts.check("16px Inter")]);
// overflow check: any content past the slide edge?
const overflow = await p.evaluate(() => [...document.querySelectorAll("section")].map((s) => s.id).filter((id) => {
  const s = document.getElementById(id); return s.scrollHeight > 1081 || s.scrollWidth > 1921; }));
// footer clash check: content boxes that reach into the footer bar
const clash = await p.evaluate(() => [...document.querySelectorAll("section")].flatMap((sec) => {
  const foot = [...sec.children].find((c) => c.style.position === "absolute" && c.style.bottom);
  if (!foot) return [];
  const ft = foot.getBoundingClientRect().top;
  const hit = [...sec.querySelectorAll("*")].some((el) => !foot.contains(el) && !el.contains(foot) &&
    !el.closest("aside") && el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().bottom > ft + 1);
  return hit ? [sec.id] : [];
}));
await p.pdf({ path: outSlides, width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
await p.goto(`http://localhost:${port}/_notes.html`, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.pdf({ path: outNotes, format: "A4", printBackground: true, preferCSSPageSize: true });
await br.close(); server.close();
console.log(JSON.stringify({ slides: slides.length, fontsOk, missing, overflow, clash }));
if (missing.length || overflow.length || clash.length || !fontsOk.every(Boolean)) {
  console.error("Problems found — check the slides listed above."); process.exit(1);
}
