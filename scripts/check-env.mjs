#!/usr/bin/env node
/**
 * Pre-flight check: confirms the env vars needed to run against a live Supabase
 * project are present. Run with `npm run setup`.
 *
 * Reads .env.local and .env the way Next.js does (shell variables win), so it
 * checks the same values `npm run dev` will see.
 */
import { existsSync, readFileSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const serverOnly = ["SUPABASE_SERVICE_ROLE_KEY"];

let ok = true;
console.log("\nlaundriroom — environment check\n");
for (const k of required) {
  const v = process.env[k];
  console.log(`  ${v ? "✓" : "✗"}  ${k}${v ? "" : "  (missing — required)"}`);
  if (!v) ok = false;
}
for (const k of serverOnly) {
  const v = process.env[k];
  console.log(`  ${v ? "✓" : "·"}  ${k}${v ? "" : "  (optional until payouts/webhooks run)"}`);
}
console.log(
  ok
    ? "\nReady. Start the app with `npm run dev`.\n"
    : "\nNot ready yet. Copy .env.example to .env.local and fill in the Supabase values.\n"
);
process.exit(ok ? 0 : 1);
