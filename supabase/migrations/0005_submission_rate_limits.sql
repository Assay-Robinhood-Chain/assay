-- ============================================================
-- Assay — rate limiting for the 2 publicly-insertable tables
--
-- launchpad_submissions and community_reports both allow anon INSERT
-- (RLS: with check (status = 'pending')), with no limit on how many
-- rows one visitor can insert. This adds a per-IP hourly cap enforced
-- as a trigger, so RLS still decides WHAT can be inserted and this
-- decides HOW OFTEN from the same source.
--
-- IP is read from the request headers PostgREST/Supavisor exposes to
-- Postgres via the `request.headers` GUC — this is how Supabase-side
-- rate limiting is normally done without a separate API layer. If the
-- header is ever missing (e.g. a direct psql insert, not through the
-- API), the check fails OPEN (allows the insert) rather than breaking
-- legitimate internal writes — the cap is an abuse deterrent for the
-- public form, not a hard security boundary (RLS + the SSRF guard are).
-- ============================================================

create table if not exists public.submission_rate_events (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  ip          text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_rate_events_ip_time
  on public.submission_rate_events (table_name, ip, created_at desc);

-- No RLS policy needed for select/insert here — this table is only
-- ever touched by the trigger function below, which runs as the
-- table owner and bypasses RLS on its own table by default.
alter table public.submission_rate_events enable row level security;

create or replace function public.enforce_submission_rate_limit()
returns trigger
language plpgsql
security definer
as $$
declare
  client_ip text;
  recent_count integer;
  limit_per_hour integer;
begin
  limit_per_hour := case TG_TABLE_NAME
    when 'launchpad_submissions' then 5   -- keep in sync with SUBMISSION_RATE_LIMIT_PER_HOUR
    when 'community_reports' then 10      -- keep in sync with REPORT_RATE_LIMIT_PER_HOUR
    else 5
  end;

  client_ip := coalesce(
    nullif(split_part(
      coalesce((current_setting('request.headers', true))::json->>'x-forwarded-for', ''),
      ',', 1
    ), ''),
    'unknown'
  );

  -- Fail open if we genuinely can't identify a client (e.g. a direct
  -- database write by an admin/Edge Function, not through the API).
  if client_ip = 'unknown' then
    return new;
  end if;

  select count(*) into recent_count
  from public.submission_rate_events
  where table_name = TG_TABLE_NAME
    and ip = client_ip
    and created_at > now() - interval '1 hour';

  if recent_count >= limit_per_hour then
    raise exception 'Too many submissions from this address — try again later.'
      using errcode = '42501'; -- insufficient_privilege, surfaces as a clean 403-ish error
  end if;

  insert into public.submission_rate_events (table_name, ip) values (TG_TABLE_NAME, client_ip);

  return new;
end;
$$;

create trigger rate_limit_launchpad_submissions
  before insert on public.launchpad_submissions
  for each row execute function public.enforce_submission_rate_limit();

create trigger rate_limit_community_reports
  before insert on public.community_reports
  for each row execute function public.enforce_submission_rate_limit();

-- Old rate-limit rows are cheap to keep, but not worth keeping forever.
-- Fold pruning into the existing daily snapshot-downsample job rather
-- than adding a fourth cron job for a housekeeping task this small.
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
  on conflict (launch_id, day) do update set
    open_price_usd    = excluded.open_price_usd,
    close_price_usd   = excluded.close_price_usd,
    min_price_usd      = least(public.launch_metrics_daily.min_price_usd, excluded.min_price_usd),
    max_price_usd      = greatest(public.launch_metrics_daily.max_price_usd, excluded.max_price_usd),
    avg_liquidity_usd  = excluded.avg_liquidity_usd,
    total_volume_usd    = public.launch_metrics_daily.total_volume_usd + excluded.total_volume_usd,
    sample_count        = public.launch_metrics_daily.sample_count + excluded.sample_count;

  delete from public.launch_metrics_snapshot
  where snapshot_at < cutoff;

  -- Rate-limit log only needs the trailing 24h to be useful; anything
  -- older is just noise once its hourly window has passed.
  delete from public.submission_rate_events
  where created_at < now() - interval '24 hours';
end;
$$;

-- To inspect recent activity from one IP:
--   select * from submission_rate_events where ip = '203.0.113.1' order by created_at desc;
-- To manually clear a false-positive block for testing:
--   delete from submission_rate_events where ip = '203.0.113.1';
