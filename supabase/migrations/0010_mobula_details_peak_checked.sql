-- ============================================================
-- Assay — Mobula details + peak_checked_at
--
--  1. launches.peak_checked_at: set once Mobula has EVIDENCE about a token
--     (price candles, or it answered and knows the token). A launch with
--     peak_checked_at set and peak_multiple still null is a token that never
--     traded, and scoring counts it as a 1.0x peak instead of dropping it.
--  2. launch_metrics_snapshot.data_source may now be 'mobula' (liquidity /
--     volume for tokens that are still on a bonding curve and therefore have
--     no Dexscreener pool).
-- ============================================================

alter table public.launches
  add column if not exists peak_checked_at timestamptz;

comment on column public.launches.peak_checked_at is
  'When Mobula last provided evidence about this token (candles, or it answered and knows the token). With peak_multiple null this means the token never traded. Null = unknown / no Mobula coverage — excluded from peak statistics, not counted as 1.0x.';

-- Launches that already carry a peak were, by definition, answered by Mobula.
update public.launches
  set peak_checked_at = now()
  where peak_multiple is not null and peak_checked_at is null;

alter table public.launch_metrics_snapshot
  drop constraint if exists launch_metrics_snapshot_data_source_check;

alter table public.launch_metrics_snapshot
  add constraint launch_metrics_snapshot_data_source_check
  check (data_source in ('dexscreener', 'blockscout', 'bitquery', 'rpc', 'mobula'));
