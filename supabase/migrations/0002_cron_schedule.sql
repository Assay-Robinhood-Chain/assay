-- ============================================================
-- Assay — cron schedule
-- Run this AFTER deploying the 3 Edge Functions in supabase/functions/
-- and setting CRON_SECRET as an Edge Function secret.
-- Replace <PROJECT_REF> below with your project's ref (Settings > General).
--
-- IMPORTANT — one manual step before this file works:
-- The Edge Functions read CRON_SECRET from `Deno.env.get("CRON_SECRET")`
-- (a Supabase Edge Function secret). The cron jobs below need the SAME
-- value available to plain SQL, which Edge Function secrets are NOT —
-- they live in a completely separate store. Supabase Vault is the
-- correct place to put a secret that both SQL and a human need to
-- read. Run this once, in the SQL Editor, with your REAL generated
-- secret (the same one you passed to `supabase secrets set CRON_SECRET=...`):
--
--   select vault.create_secret('<your-generated-cron-secret>', 'cron_secret');
--
-- Do NOT hardcode the real secret directly into this migration file —
-- unlike <PROJECT_REF> below (not sensitive), this value must never be
-- committed to git. Run the vault.create_secret() call by hand, once,
-- outside version control.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cron 1 — Ingestion rotation. Refreshes metrics for tracked launches
-- (20%/hour rotating batch + the <24h "always polled" fast path), and
-- runs the discovery adapters for any due launchpad.
-- See: main brief section 6 + third-party-indexer-integration.md.
select cron.schedule(
  'ingestion-rotation',
  '0 * * * *',  -- every hour, on the hour
  $$
  select net.http_post(
    url := 'https://fkkfcdiwpfyqzzlfhuyu.supabase.co/functions/v1/ingestion-rotation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cron 2 — Scoring sweep. Recomputes launchpad_scores for every
-- tracked launchpad, plus the algorithm-drift and data-volume-drift
-- checks (main brief section 15).
select cron.schedule(
  'scoring-sweep',
  '0 3 * * *',  -- daily at 03:00 UTC
  $$
  select net.http_post(
    url := 'https://fkkfcdiwpfyqzzlfhuyu.supabase.co/functions/v1/scoring-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Note: onboarding-backfill is intentionally NOT scheduled here — it
-- is event-triggered once per launchpad at onboarding time, called
-- directly (e.g. from an admin action), never on a recurring cadence.
-- See backfill-sampling-policy.md, section 5: "Do not merge the two."

-- To inspect scheduled jobs:
--   select * from cron.job;
-- To inspect run history:
--   select * from cron.job_run_details order by start_time desc limit 20;
-- To unschedule (e.g. before re-running this file):
--   select cron.unschedule('ingestion-rotation');
--   select cron.unschedule('scoring-sweep');