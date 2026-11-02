-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Run the process-payouts edge function every hour.
--
-- The job reads two Vault secrets, so nothing environment-specific or secret
-- lives in this file or in cron.job:
--   project_url                  e.g. https://<ref>.supabase.co
--   process_payouts_cron_secret  must equal the function's CRON_SECRET
-- Where they aren't set (e.g. local dev) the job does nothing.
-- See docs/CONNECT-DATABASE.md → Automated vendor payouts.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- cron.schedule with an existing job name replaces that job.
select cron.schedule(
  'process-payouts-hourly',
  '0 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/process-payouts',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                                   where name = 'process_payouts_cron_secret')),
    body    := '{}'::jsonb
  )
  where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
    and exists (select 1 from vault.decrypted_secrets where name = 'process_payouts_cron_secret');
  $job$
);
