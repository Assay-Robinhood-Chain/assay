-- ============================================================
-- Assay — cron schedule
-- Run this AFTER deploying the 3 Edge Functions in supabase/functions/
-- and setting CRON_SECRET as an Edge Function secret.
-- Replace <PROJECT_REF> below with your project's ref (Settings > General).
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
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/ingestion-rotation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
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
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/scoring-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
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
