# Manual database updates

Files here bundle migrations for pasting into **Supabase → SQL Editor** when
they can't be applied through the CLI/MCP. Each runs as one transaction with a
built-in self-check: if anything fails, nothing changes. Safe to run twice.

- `apply-0033-0035.sql` — multi-branch vendors (0033), Partner Agreement
  clauses (0034), distance-based delivery pricing (0035). Records 0033–0035 in
  `supabase_migrations.schema_migrations`. Tested on Postgres 16 against
  0001–0032 + demo seed (fresh run, repeat run, and a sabotaged copy that the
  self-check rejects).
