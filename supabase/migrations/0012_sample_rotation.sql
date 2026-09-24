-- ============================================================
-- Assay — sample rotation: upstream re-discovery + periodic resample
--
-- Context: onboarding-backfill only ever runs ONCE per launchpad (see
-- backfill-sampling-policy.md section 5). Everything after that —
-- ingestion-rotation, backfill-enrichment, scoring-sweep — only ever
-- touches the exact set of launches that onboarding inserted that one
-- time. A launchpad that keeps shipping new tokens after onboarding is
-- invisible to Assay forever: nothing re-checks upstream, and the
-- "sample" never changes.
--
-- This migration adds the schema for two new crons that fix that:
--   - upstream-discovery (daily): looks for launches created since the
--     last check and adds them to `launches` as KNOWN but not yet part
--     of the active sample (excluded_from_sample = true).
--   - sample-resample (weekly): redraws which of ALL known launches for
--     a launchpad (original sample + everything upstream-discovery has
--     found since) are the active sample, via sampleWithMinimumAge —
--     same random-with-a-72h-floor rule as the initial backfill.
--
-- Soft-exclude, not delete: a launch dropped by a resample keeps its row
-- and its launch_metrics_snapshot history — it is just skipped by
-- ingestion-rotation / backfill-enrichment / scoring from then on. That
-- keeps launchpad_scores' day-by-day history exactly as accurate as it
-- always was (it is a per-day aggregate, not tied to specific launches),
-- while still letting anyone trace "why was this launch dropped" later
-- instead of the data being gone.
-- ============================================================

alter table public.launches
  add column if not exists excluded_from_sample boolean not null default false,
  add column if not exists excluded_from_sample_at timestamptz;

comment on column public.launches.excluded_from_sample is
  'true = known upstream but NOT part of the current active sample: either newly found by upstream-discovery and not yet drawn into the sample, or previously active and dropped by a sample-resample. Soft-exclude only — the row and its launch_metrics_snapshot history are kept, never deleted. Skipped by ingestion-rotation, backfill-enrichment and scoring.';

comment on column public.launches.excluded_from_sample_at is
  'When this launch was last excluded (set alongside excluded_from_sample = true; cleared to null when re-included by a later resample). Null while active.';

-- Every launch inserted by the original onboarding-backfill is, by
-- definition, part of that launchpad''s original active sample.
update public.launches
  set excluded_from_sample = false
  where excluded_from_sample is null;

-- The "currently active" queries (ingestion-rotation, backfill-enrichment,
-- scoring) all filter on this — keep it cheap no matter how large a
-- launchpad's total known-but-excluded history grows.
create index if not exists idx_launches_active_sample
  on public.launches (launchpad_id)
  where excluded_from_sample = false;

alter table public.launchpads
  add column if not exists last_discovery_at timestamptz,
  add column if not exists last_resample_at timestamptz;

comment on column public.launchpads.last_discovery_at is
  'When upstream-discovery last checked this launchpad for launches created since onboarding (or the previous check). Null = never run since the onboarding backfill.';

comment on column public.launchpads.last_resample_at is
  'When the active sample was last redrawn by sample-resample. Null = still exactly the original onboarding-backfill sample.';

-- ------------------------------------------------------------
-- Cron 4 — Upstream discovery. Daily. Finds launches created since the
-- last check and adds them to `launches` as known-but-excluded, so
-- sample-resample has something new to draw from. See
-- upstream-discovery/index.ts.
-- ------------------------------------------------------------
select cron.schedule(
  'upstream-discovery',
  '30 2 * * *',  -- daily at 02:30 UTC — ahead of scoring-sweep (03:00) so a same-day resample's new score is fresh, behind midnight to avoid the daily UTC-rollover crowd
  $$
  select net.http_post(
    url := 'https://fkkfcdiwpfyqzzlfhuyu.supabase.co/functions/v1/upstream-discovery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ------------------------------------------------------------
-- Cron 5 — Sample resample. Weekly. Redraws each due launchpad's active
-- sample from everything upstream-discovery has found so far. See
-- sample-resample/index.ts and RESAMPLE_INTERVAL_DAYS in constants.ts —
-- change that constant, not this schedule, if the interval needs to
-- differ from "weekly"; this cron just needs to run at least that often
-- to notice a launchpad is due.
-- ------------------------------------------------------------
select cron.schedule(
  'sample-resample',
  '0 4 * * *',  -- daily at 04:00 UTC (after discovery + scoring); RESAMPLE_INTERVAL_DAYS decides which launchpads are actually due each run
  $$
  select net.http_post(
    url := 'https://fkkfcdiwpfyqzzlfhuyu.supabase.co/functions/v1/sample-resample',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect: select * from cron.job where jobname in ('upstream-discovery', 'sample-resample');
-- To unschedule: select cron.unschedule('upstream-discovery'); select cron.unschedule('sample-resample');
-- To check which launchpads are overdue right now:
--   select id, slug, last_discovery_at from public.launchpads where sample_size > 0 and (last_discovery_at is null or last_discovery_at < now() - interval '24 hours');
--   select id, slug, last_resample_at from public.launchpads where sample_size > 0 and (last_resample_at is null or last_resample_at < now() - interval '7 days');
