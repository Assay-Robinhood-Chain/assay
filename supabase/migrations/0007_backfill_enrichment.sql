-- ============================================================
-- Assay — async token-detail enrichment for backfilled launches
--
-- Context: backfill-sampling-policy.md's sample size is now
-- BACKFILL_SAMPLE_RATIO (20%) of a launchpad's upstream total with NO
-- fixed cap (see 0001_init.sql's original 250-cap comment, now
-- stale). A large launchpad can therefore backfill tens of thousands
-- of launches at once. onboarding-backfill used to fetch each one's
-- Dexscreener metrics synchronously, in the same request that inserts
-- the launches — fine at 250, a real Edge-Function-timeout risk at
-- 50,000+. This migration adds the one thing that split needs: a way
-- to tell "not yet enriched" apart from "enriched, no data found".
-- ============================================================

alter table public.launches
  add column if not exists metrics_fetched_at timestamptz;

comment on column public.launches.metrics_fetched_at is
  'Null = never had a launch_metrics_snapshot written for it yet (queued for backfill-enrichment). Set once the first snapshot lands; the hourly ingestion-rotation keeps refreshing metrics after that but does not touch this column again — it only marks "has this launch ever been enriched at all".';

-- Partial index: only rows the enrichment queue actually cares about,
-- so the queue-select stays cheap no matter how large `launches` gets.
create index if not exists idx_launches_pending_enrichment
  on public.launches (launchpad_id, launch_date desc)
  where metrics_fetched_at is null;

-- Existing launches (backfilled under the old synchronous path, or
-- already touched by ingestion-rotation) already have real metrics —
-- don't queue the entire history for re-enrichment on migrate.
update public.launches
  set metrics_fetched_at = now()
  where metrics_fetched_at is null
    and (liquidity_usd is not null or volume_24h_usd is not null);

-- ------------------------------------------------------------
-- Cron 3 — Backfill enrichment. Works down the metrics_fetched_at IS
-- NULL backlog in small, concurrency-limited batches (see
-- backfill-enrichment/index.ts), then rescopes launchpad_scores for
-- whatever it touched. Runs far more often than the other two crons
-- because its whole job is to drain a queue quickly after a big
-- onboarding, not to re-poll data that's already fresh.
-- Requires the same 'cron_secret' vault entry as 0002_cron_schedule.sql
-- — re-run that file's `select vault.create_secret(...)` step first if
-- you haven't already.
-- ------------------------------------------------------------
select cron.schedule(
  'backfill-enrichment',
  '*/5 * * * *',  -- every 5 minutes
  $$
  select net.http_post(
    url := 'https://fkkfcdiwpfyqzzlfhuyu.supabase.co/functions/v1/backfill-enrichment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect: select * from cron.job where jobname = 'backfill-enrichment';
-- To unschedule: select cron.unschedule('backfill-enrichment');
-- To check the remaining backlog by hand:
--   select launchpad_id, count(*) from public.launches
--   where metrics_fetched_at is null group by launchpad_id;
