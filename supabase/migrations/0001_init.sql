-- ============================================================
-- Assay — initial schema
-- Mirrors lib/types.ts on the frontend. Run via:
--   supabase db push
-- or paste into the Supabase SQL editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- launchpads
-- ------------------------------------------------------------
create table if not exists public.launchpads (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text unique not null,
  name                    text not null,
  description             text not null default '',
  chain                   text not null default 'Robinhood Chain',
  deployer_addresses      text[] not null default '{}',
  website_url             text,

  -- third-party-indexer-integration.md — launch discovery source
  discovery_source        text not null default 'rpc_self_indexed'
                             check (discovery_source in ('bitquery', 'mobula', 'rpc_self_indexed')),
  discovery_source_url    text,

  -- backfill-sampling-policy.md — both counts always carried together
  -- (section 6: a partial sample must never silently present itself
  -- as the whole population)
  total_launches_upstream bigint,
  sample_size             integer not null default 0,

  onboarded_at            timestamptz not null default now(),
  last_snapshot_at        timestamptz,
  created_at              timestamptz not null default now()
);

comment on column public.launchpads.sample_size is
  'Set once by backfillLaunchpad() at onboarding per backfill-sampling-policy.md; never re-run for the same launchpad.';

-- ------------------------------------------------------------
-- launches — one row per discovered token
-- ------------------------------------------------------------
create table if not exists public.launches (
  id                    uuid primary key default gen_random_uuid(),
  launchpad_id          uuid not null references public.launchpads(id) on delete cascade,
  token_address         text not null,
  name                  text not null default '',
  symbol                text not null default '',
  launch_date           timestamptz not null,
  is_graduated          boolean not null default false,
  is_confirmed_rugpull  boolean not null default false,
  peak_multiple         numeric,           -- null renders as "—", never 0
  liquidity_usd         numeric,
  volume_24h_usd        numeric,
  wash_trading_flag     boolean not null default false,
  created_at            timestamptz not null default now(),

  unique (launchpad_id, token_address)
);

create index if not exists idx_launches_launchpad_id on public.launches (launchpad_id);
create index if not exists idx_launches_launch_date on public.launches (launch_date desc);

-- ------------------------------------------------------------
-- launch_metrics_snapshot — one row per launch per ingestion cycle
-- (this is the high-volume, append-mostly table — the TimescaleDB
-- hypertable candidate in the main brief. Left as plain indexed
-- Postgres here; see the optional block at the bottom of this file.)
-- ------------------------------------------------------------
create table if not exists public.launch_metrics_snapshot (
  id              bigint generated always as identity,
  launch_id       uuid not null references public.launches(id) on delete cascade,
  snapshot_at     timestamptz not null default now(),
  price_usd       numeric,
  liquidity_usd   numeric,
  volume_24h_usd  numeric,
  data_source     text not null check (data_source in ('dexscreener', 'blockscout', 'bitquery', 'rpc')),

  primary key (id, snapshot_at)
);

create index if not exists idx_snapshot_launch_id_time
  on public.launch_metrics_snapshot (launch_id, snapshot_at desc);

-- ------------------------------------------------------------
-- launchpad_scores — one row per launchpad per score_date
-- Never downsampled or deleted (main brief: the historical-
-- consistency record independence rests on).
-- ------------------------------------------------------------
create table if not exists public.launchpad_scores (
  id                 uuid primary key default gen_random_uuid(),
  launchpad_id       uuid not null references public.launchpads(id) on delete cascade,
  score_date         date not null,
  algorithm_version  text not null default 'v1.3',
  final_score        numeric not null check (final_score between 0 and 100),
  stars              smallint not null check (stars in (0, 1, 2, 3)),
  is_provisional     boolean not null default false,
  sample_size        integer not null,

  -- the five dimensions, see lib/constants.ts DIMENSION_WEIGHTS
  quality            numeric not null check (quality between 0 and 100),
  mechanism          numeric not null check (mechanism between 0 and 100),
  market_health      numeric not null check (market_health between 0 and 100),
  value              numeric not null check (value between 0 and 100),
  consistency        numeric not null check (consistency between 0 and 100),

  disclaimer         text not null,
  created_at         timestamptz not null default now(),

  unique (launchpad_id, score_date)
);

create index if not exists idx_scores_launchpad_date
  on public.launchpad_scores (launchpad_id, score_date desc);

-- ------------------------------------------------------------
-- launchpad_badges
-- ------------------------------------------------------------
create table if not exists public.launchpad_badges (
  id            uuid primary key default gen_random_uuid(),
  launchpad_id  uuid not null references public.launchpads(id) on delete cascade,
  name          text not null,
  description   text not null default '',
  awarded_at    timestamptz not null default now()
);

create index if not exists idx_badges_launchpad_id on public.launchpad_badges (launchpad_id);

-- ------------------------------------------------------------
-- launchpad_submissions — "Get listed" form (app/get-listed)
-- Independence rule (brief section 3 / methodology page): a
-- submission NEVER writes to launchpads/scores directly. A human
-- moderates status: pending -> approved | rejected.
-- ------------------------------------------------------------
create table if not exists public.launchpad_submissions (
  id               uuid primary key default gen_random_uuid(),
  launchpad_slug   text,
  field            text not null,
  value            text not null,
  submitted_by     text,
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  created_at       timestamptz not null default now(),
  reviewed_at      timestamptz,
  reviewed_by      text
);

create index if not exists idx_submissions_status on public.launchpad_submissions (status, created_at desc);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.launchpads enable row level security;
alter table public.launches enable row level security;
alter table public.launch_metrics_snapshot enable row level security;
alter table public.launchpad_scores enable row level security;
alter table public.launchpad_badges enable row level security;
alter table public.launchpad_submissions enable row level security;

-- Public (anon) read access — everything scored is meant to be public.
-- No paid-placement rule (methodology page): there is no policy here
-- that branches on who is asking, on purpose.
create policy "public read launchpads" on public.launchpads
  for select using (true);

create policy "public read launches" on public.launches
  for select using (true);

create policy "public read launch_metrics_snapshot" on public.launch_metrics_snapshot
  for select using (true);

create policy "public read launchpad_scores" on public.launchpad_scores
  for select using (true);

create policy "public read launchpad_badges" on public.launchpad_badges
  for select using (true);

-- Submissions: anyone can INSERT (the Get Listed form), but only the
-- service role (Edge Functions / moderation tooling) can read or
-- update — a submission is never publicly readable while pending,
-- and never bypasses a human review.
create policy "public insert submissions" on public.launchpad_submissions
  for insert
  with check (status = 'pending');

-- No select/update policy for anon/authenticated on submissions —
-- service_role bypasses RLS entirely, which is exactly the boundary
-- we want (moderation tooling only).

-- ============================================================
-- OPTIONAL: TimescaleDB hypertable for launch_metrics_snapshot
-- ============================================================
-- Uncomment ONLY if `create extension if not exists timescaledb;`
-- succeeds on your project (Database > Extensions in the dashboard).
-- Continuous aggregates / native compression are Timescale
-- Community-licensed and may not be available on hosted Supabase —
-- see README.md > "Database" for the manual-downsample alternative
-- (a pg_cron job pruning + aggregating rows older than
-- SNAPSHOT_RETENTION_DAYS). At Assay's current scale (sample capped
-- at 250 launches per launchpad, see backfill-sampling-policy.md)
-- a plain indexed table is very likely enough — treat this as a
-- later optimization, not a launch blocker.
--
-- create extension if not exists timescaledb;
-- select create_hypertable('public.launch_metrics_snapshot', 'snapshot_at', if_not_exists => true);
