-- ============================================================
-- Assay — peak refresh schedule
--
-- launches.peak_attempted_at: when Mobula last ANSWERED for this launch's
-- price history (candles, or "no pool"). It drives how often the peak
-- multiple is re-asked (daily while a token is young, weekly after — see
-- _shared/refreshPolicy.ts). Not the same as peak_checked_at, which means
-- "Mobula has evidence about this token".
-- ============================================================

alter table public.launches
  add column if not exists peak_attempted_at timestamptz;

comment on column public.launches.peak_attempted_at is
  'When Mobula last answered a price-history request for this launch. Null = never asked. Drives the peak-multiple refresh schedule; a failed request leaves it untouched so the launch is retried.';

-- Every launch that already has Mobula evidence was, by definition, asked.
update public.launches
  set peak_attempted_at = coalesce(peak_checked_at, now())
  where peak_attempted_at is null
    and (peak_multiple is not null or peak_checked_at is not null);
