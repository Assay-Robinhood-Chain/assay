-- ============================================================
-- Assay — token names/symbols
--
-- Launches were inserted with name = '' / symbol = '' and nothing ever
-- filled them in, so the token list showed an empty Token column.
-- backfill-enrichment now reads name/symbol from Blockscout (fallback:
-- Dexscreener). Re-queue every launch that still has no name so the
-- queue picks it up; already-named launches are left alone.
-- ============================================================
update public.launches
  set metrics_fetched_at = null
  where name = '';
