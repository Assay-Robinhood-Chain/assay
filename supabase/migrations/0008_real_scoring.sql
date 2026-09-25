-- ============================================================
-- Assay — real scoring (algorithm v1.4)
--
-- Until now four launch columns the scorer reads (is_graduated,
-- peak_multiple, is_confirmed_rugpull, wash_trading_flag) were never
-- written by anything, so dimensions came out as artefacts of defaults
-- (0 or a fake 100). v1.4 fixes that:
--   * a dimension with no data is NULL and left out of the composite,
--     it is never stored as 0 or 100 as a stand-in;
--   * is_graduated comes from Dexscreener (a DEX pool with liquidity);
--   * contract verification comes from Blockscout (new column below).
-- ============================================================

alter table public.launches
  add column if not exists is_contract_verified boolean;

comment on column public.launches.is_contract_verified is
  'true/false = Blockscout says this token contract''s source is / is not verified. null = not checked yet, or Blockscout was unavailable. Feeds the Mechanism dimension.';

-- Dimensions may now be null ("no data yet"). The existing
-- CHECK (... between 0 and 100) constraints keep validating real values
-- and simply pass on null.
alter table public.launchpad_scores
  alter column quality      drop not null,
  alter column mechanism    drop not null,
  alter column market_health drop not null,
  alter column value        drop not null,
  alter column consistency  drop not null;

comment on column public.launchpad_scores.quality is
  'null = not enough data to measure this dimension. Never 0 or 100 as a placeholder.';

-- Every launch needs one pass through the new enrichment logic
-- (graduation + verification). Re-queue them all; backfill-enrichment
-- drains the queue in batches. Rows already scored under v1.3 are kept
-- as history; today's row is overwritten as soon as data arrives.
update public.launches
  set metrics_fetched_at = null;
