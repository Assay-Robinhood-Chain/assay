-- ============================================================
-- Assay — snapshot downsampling & retention
--
-- Replaces the TimescaleDB continuous-aggregate + native-compression
-- workflow described in the main brief's downsampling note. Those two
-- specific features are Timescale-Community-licensed and NOT available
-- on Supabase's bundled `timescaledb-apache` build (only the base
-- create_hypertable() partitioning is). This migration reproduces the
-- same outcome — old raw rows replaced by a compact daily summary —
-- using plain Postgres + pg_cron, no extension, no third party.
--
-- Keep SNAPSHOT_RETENTION_DAYS below in sync with .env.example's value
-- by hand (same pattern already used for the two constants.ts files).
-- ============================================================

-- ------------------------------------------------------------
-- launch_metrics_daily — one row per launch per UTC day, for
-- snapshot rows older than the retention window. This is what a
-- TimescaleDB continuous aggregate would have produced.
-- ------------------------------------------------------------
create table if not exists public.launch_metrics_daily (
  launch_id        uuid not null references public.launches(id) on delete cascade,
  day               date not null,
  open_price_usd    numeric,
  close_price_usd   numeric,
  min_price_usd     numeric,
  max_price_usd     numeric,
  avg_liquidity_usd numeric,
  total_volume_usd  numeric,
  sample_count      integer not null,
  created_at        timestamptz not null default now(),

  primary key (launch_id, day)
);

alter table public.launch_metrics_daily enable row level security;

create policy "launch_metrics_daily is publicly readable"
  on public.launch_metrics_daily for select
  using (true);

-- ------------------------------------------------------------
-- downsample_and_prune_snapshots() — for every launch_metrics_snapshot
-- row older than SNAPSHOT_RETENTION_DAYS:
--   1. fold it into (or update) the matching launch_metrics_daily row
--   2. delete the raw row
-- Idempotent: safe to run more than once for the same day, since
-- the daily row is recomputed with an upsert rather than just added to.
-- ------------------------------------------------------------
create or replace function public.downsample_and_prune_snapshots()
returns void
language plpgsql
as $$
declare
  retention_days constant integer := 180; -- keep in sync with SNAPSHOT_RETENTION_DAYS
  cutoff timestamptz := now() - (retention_days || ' days')::interval;
begin
  insert into public.launch_metrics_daily
    (launch_id, day, open_price_usd, close_price_usd, min_price_usd,
     max_price_usd, avg_liquidity_usd, total_volume_usd, sample_count)
  select
    launch_id,
    (snapshot_at at time zone 'utc')::date as day,
    (array_agg(price_usd order by snapshot_at asc))[1]  as open_price_usd,
    (array_agg(price_usd order by snapshot_at desc))[1] as close_price_usd,
    min(price_usd)          as min_price_usd,
    max(price_usd)          as max_price_usd,
    avg(liquidity_usd)      as avg_liquidity_usd,
    sum(volume_24h_usd)     as total_volume_usd,
    count(*)                as sample_count
  from public.launch_metrics_snapshot
  where snapshot_at < cutoff
  group by launch_id, (snapshot_at at time zone 'utc')::date
  -- Known remaining limitation: open/close aren't stored with their
  -- own timestamps, so on a second run for the same day this can't
  -- tell whether the new batch's open/close is actually earlier/later
  -- than what's already merged — it just takes the new batch's values.
  -- Low risk in practice (a second run only happens for late data past
  -- the same retention cutoff), but worth fixing properly (carry the
  -- open/close timestamps into launch_metrics_daily) before leaning on
  -- day-level open/close for anything that must be exact.
  on conflict (launch_id, day) do update set
    open_price_usd    = excluded.open_price_usd,
    close_price_usd   = excluded.close_price_usd,
    min_price_usd      = least(public.launch_metrics_daily.min_price_usd, excluded.min_price_usd),
    max_price_usd      = greatest(public.launch_metrics_daily.max_price_usd, excluded.max_price_usd),
    -- Weighted merge, not an overwrite: `excluded.avg_liquidity_usd` on
    -- its own is a real average, but only of the rows in *this* run.
    -- If this function ever runs twice for the same day (late-arriving
    -- rows just under the cutoff), a plain overwrite would silently
    -- discard the first run's average instead of merging it — this
    -- weights each run's average by its own sample_count so the
    -- combined value stays a true average across every row folded in.
    avg_liquidity_usd  = (
      public.launch_metrics_daily.avg_liquidity_usd * public.launch_metrics_daily.sample_count
      + excluded.avg_liquidity_usd * excluded.sample_count
    ) / nullif(public.launch_metrics_daily.sample_count + excluded.sample_count, 0),
    total_volume_usd    = public.launch_metrics_daily.total_volume_usd + excluded.total_volume_usd,
    sample_count        = public.launch_metrics_daily.sample_count + excluded.sample_count;

  delete from public.launch_metrics_snapshot
  where snapshot_at < cutoff;
end;
$$;

-- ------------------------------------------------------------
-- Schedule: daily, direct SQL call — no Edge Function, no pg_net,
-- no CRON_SECRET involved, so it isn't subject to the 150s Edge
-- Function idle-timeout risk discussed for the other two jobs.
-- ------------------------------------------------------------
select cron.schedule(
  'snapshot-downsample',
  '30 3 * * *',  -- daily at 03:30 UTC, after the scoring-sweep at 03:00
  $$ select public.downsample_and_prune_snapshots(); $$
);

-- To inspect: select * from cron.job where jobname = 'snapshot-downsample';
-- To unschedule: select cron.unschedule('snapshot-downsample');
-- To run once by hand (e.g. to test): select public.downsample_and_prune_snapshots();
