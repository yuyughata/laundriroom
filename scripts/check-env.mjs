#!/usr/bin/env node
/**
 * Pre-flight check: confirms the env vars needed to run against a live Supabase
 * project are present. Run with `npm run setup`.
 */
const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
const serverOnly = ["SUPABASE_SERVICE_ROLE_KEY"];

let ok = true;
console.log("\nFresco — environment check\n");
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
