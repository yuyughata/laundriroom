#!/usr/bin/env node
/**
 * Writes the Supabase Auth email templates (sign-up, password reset, email
 * change, …) from src/lib/emails.ts to supabase/templates/*.html.
 *
 *   npm run emails:auth
 *
 * Local dev picks them up via supabase/config.toml. For the hosted project,
 * paste each file into Supabase → Authentication → Email Templates (the
 * subjects are printed below).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const src = fs.readFileSync(path.join(root, "src/lib/emails.ts"), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2021 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "emails-")), "emails.mjs");
fs.writeFileSync(tmp, js);
const { AUTH_EMAIL_TEMPLATES } = await import(pathToFileURL(tmp).href);

const outDir = path.join(root, "supabase/templates");
fs.mkdirSync(outDir, { recursive: true });
for (const [name, t] of Object.entries(AUTH_EMAIL_TEMPLATES)) {
  fs.writeFileSync(path.join(outDir, `${name}.html`), t.html + "\n");
  console.log(`${`supabase/templates/${name}.html`.padEnd(42)} ${t.label.padEnd(22)} subject: ${t.subject}`);
}
