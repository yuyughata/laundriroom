# Manual database updates

Files here bundle migrations for pasting into **Supabase → SQL Editor** when
they can't be applied through the CLI/MCP. Built-in self-checks abort a part
if anything is off, so nothing half-applies. Safe to run twice.

- `apply-0033-0038.sql` — multi-branch vendors (0033), Partner Agreement
  clauses (0034), distance-based delivery pricing (0035), printable tag
  batches (0036), review-quality notification events (0037) and bad-review
  flags + escalation (0038). Two transactions: part 1 = 0033–0037, part 2 =
  0038 (new enum values must be committed before they're used). Records each
  version in `supabase_migrations.schema_migrations`. Tested on Postgres 16
  against 0001–0032 + demo seed: one-request run (as the SQL Editor sends it),
  repeat run, and `psql -f`. Also fine if the earlier `apply-0033-0035.sql`
  was already run.
