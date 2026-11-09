#!/usr/bin/env node
// Render docs/setup/setup-guide.html to docs/setup/laundriroom-setup-guide.pdf (A4).
//   node scripts/render-setup-guide.mjs
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const src = path.resolve("docs/setup/setup-guide.html");
const out = path.resolve("docs/setup/laundriroom-setup-guide.pdf");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${src}`, { waitUntil: "load" });
await page.pdf({
  path: out, format: "A4", printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true, headerTemplate: "<span></span>", pageRanges: "",
  footerTemplate: '<div style="font:8px Arial;color:#8A93A1;width:100%;text-align:center">laundriroom set-up guide · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
});
await browser.close();
console.log("wrote", out);
