-- ============================================================
-- Assay — seed data (mirrors lib/data.ts mock dataset)
-- Run via: supabase db reset   (applies migrations then this file)
-- or paste into the SQL editor on a fresh project.
-- Safe to re-run: clears the 5 tables first.
-- ============================================================

truncate table
  public.launchpad_badges,
  public.launchpad_scores,
  public.launch_metrics_snapshot,
  public.launches,
  public.launchpads
restart identity cascade;

do $$
declare
  lp_id uuid;
  launch_id uuid;
  i int;
begin

  -- ---------- Meridian Launch ----------
  insert into public.launchpads
    (slug, name, description, deployer_addresses, website_url, discovery_source, discovery_source_url,
     total_launches_upstream, sample_size, onboarded_at, last_snapshot_at)
  values
    ('meridian-launch', 'Meridian Launch',
     'One of the earliest factory contracts on Robinhood Chain; steady graduation rate with conservative LP-lock defaults.',
     array['0x71a...9fE2'], 'https://meridianlaunch.example', 'mobula', 'https://docs.mobula.io',
     842, 250, now() - interval '50 days', now() - interval '1.5 hours')
  returning id into lp_id;

  insert into public.launchpad_scores
    (launchpad_id, score_date, final_score, stars, is_provisional, sample_size,
     quality, mechanism, market_health, value, consistency, disclaimer)
  values
    (lp_id, current_date, 78.5, 2, false, 250, 82, 88, 74, 69, 80,
     'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.');

  insert into public.launchpad_badges (launchpad_id, name, description, awarded_at)
  values (lp_id, 'Verified Contracts', '100% of tracked launches use verified source.', now() - interval '40 days');

  for i in 1..24 loop
    insert into public.launches
      (launchpad_id, token_address, name, symbol, launch_date, is_graduated, is_confirmed_rugpull,
       peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag)
    values
      (lp_id, '0x' || substr(md5('meridian' || i), 1, 40), 'Nova ' || i, 'TK1' || i,
       now() - (i * 2 || ' days')::interval, (i % 5 = 0), (i % 23 = 0),
       round((1 + random() * 18)::numeric, 2), round((2000 + random() * 480000)::numeric, 2),
       round((500 + random() * 900000)::numeric, 2), (random() > 0.85));
  end loop;

  -- ---------- ForgeCap (Pons-scale) ----------
  insert into public.launchpads
    (slug, name, description, deployer_addresses, discovery_source, discovery_source_url,
     total_launches_upstream, sample_size, onboarded_at, last_snapshot_at)
  values
    ('forgecap', 'ForgeCap',
     'High-volume factory with aggressive listing cadence; wash-trading flags run above cohort median.',
     array['0x3bC...11D9'], 'bitquery', 'https://docs.bitquery.io',
     167412, 250, now() - interval '55 days', now() - interval '0.4 hours')
  returning id into lp_id;

  insert into public.launchpad_scores
    (launchpad_id, score_date, final_score, stars, is_provisional, sample_size,
     quality, mechanism, market_health, value, consistency, disclaimer)
  values
    (lp_id, current_date, 55.8, 1, false, 250, 58, 61, 42, 71, 50,
     'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.');

  for i in 1..28 loop
    insert into public.launches
      (launchpad_id, token_address, name, symbol, launch_date, is_graduated, is_confirmed_rugpull,
       peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag)
    values
      (lp_id, '0x' || substr(md5('forgecap' || i), 1, 40), 'Cinder ' || i, 'TK2' || i,
       now() - (i * 2 || ' days')::interval, (i % 4 = 0), (i % 8 = 0),
       case when i % 8 = 0 then null else round((1 + random() * 18)::numeric, 2) end,
       case when i % 8 = 0 then null else round((2000 + random() * 480000)::numeric, 2) end,
       round((500 + random() * 900000)::numeric, 2), (random() > 0.7));
  end loop;

  -- ---------- Saltpans ----------
  insert into public.launchpads
    (slug, name, description, deployer_addresses, discovery_source,
     total_launches_upstream, sample_size, onboarded_at, last_snapshot_at)
  values
    ('saltpans', 'Saltpans',
     'Curated, low-volume launchpad; every launch is manually screened before the factory contract fires.',
     array['0x9F2...002a'], 'rpc_self_indexed',
     61, 61, now() - interval '38 days', now() - interval '2.1 hours')
  returning id into lp_id;

  insert into public.launchpad_scores
    (launchpad_id, score_date, final_score, stars, is_provisional, sample_size,
     quality, mechanism, market_health, value, consistency, disclaimer)
  values
    (lp_id, current_date, 84.9, 3, false, 61, 91, 95, 77, 60, 88,
     'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.');

  insert into public.launchpad_badges (launchpad_id, name, description, awarded_at) values
    (lp_id, 'LP Lock Verified', 'Liquidity locked at launch on 100% of tracked launches.', now() - interval '30 days'),
    (lp_id, 'Low Rug Rate', 'Smoothed rugpull rate in the bottom decile of the cohort.', now() - interval '18 days');

  for i in 1..18 loop
    insert into public.launches
      (launchpad_id, token_address, name, symbol, launch_date, is_graduated, is_confirmed_rugpull,
       peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag)
    values
      (lp_id, '0x' || substr(md5('saltpans' || i), 1, 40), 'Vertex ' || i, 'TK3' || i,
       now() - (i * 2 || ' days')::interval, (i % 3 = 0), false,
       round((1 + random() * 18)::numeric, 2), round((2000 + random() * 480000)::numeric, 2),
       round((500 + random() * 900000)::numeric, 2), false);
  end loop;

  -- ---------- Dune Court (provisional — below confidence threshold) ----------
  insert into public.launchpads
    (slug, name, description, deployer_addresses, discovery_source,
     total_launches_upstream, sample_size, onboarded_at, last_snapshot_at)
  values
    ('dunecourt', 'Dune Court',
     'New entrant, onboarded three weeks ago. Sample size is still below the confidence gate — treat any star rating as provisional.',
     array['0x4E1...77bA'], 'rpc_self_indexed',
     14, 14, now() - interval '21 days', now() - interval '0.8 hours')
  returning id into lp_id;

  insert into public.launchpad_scores
    (launchpad_id, score_date, final_score, stars, is_provisional, sample_size,
     quality, mechanism, market_health, value, consistency, disclaimer)
  values
    (lp_id, current_date, 65.2, 1, true, 14, 74, 80, 66, 58, 40,
     'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.');

  for i in 1..14 loop
    insert into public.launches
      (launchpad_id, token_address, name, symbol, launch_date, is_graduated, is_confirmed_rugpull,
       peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag)
    values
      (lp_id, '0x' || substr(md5('dunecourt' || i), 1, 40), 'Drift ' || i, 'TK4' || i,
       now() - (i * 2 || ' days')::interval, (i % 3 = 0), false,
       round((1 + random() * 18)::numeric, 2), round((2000 + random() * 480000)::numeric, 2),
       round((500 + random() * 900000)::numeric, 2), false);
  end loop;

  -- ---------- Glasswing Foundry (stale snapshot on purpose) ----------
  insert into public.launchpads
    (slug, name, description, deployer_addresses, discovery_source, discovery_source_url,
     total_launches_upstream, sample_size, onboarded_at, last_snapshot_at)
  values
    ('glasswing-foundry', 'Glasswing Foundry',
     'Mid-size launchpad with a strong graduation rate but recent liquidity depth has thinned relative to volume.',
     array['0x88C...4412'], 'bitquery', 'https://docs.bitquery.io',
     318, 159, now() - interval '44 days', now() - interval '9.5 hours')
  returning id into lp_id;

  insert into public.launchpad_scores
    (launchpad_id, score_date, final_score, stars, is_provisional, sample_size,
     quality, mechanism, market_health, value, consistency, disclaimer)
  values
    (lp_id, current_date, 68.4, 2, false, 159, 76, 70, 55, 64, 68,
     'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.');

  insert into public.launchpad_badges (launchpad_id, name, description, awarded_at)
  values (lp_id, 'Verified Contracts', '100% of tracked launches use verified source.', now() - interval '35 days');

  for i in 1..22 loop
    insert into public.launches
      (launchpad_id, token_address, name, symbol, launch_date, is_graduated, is_confirmed_rugpull,
       peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag)
    values
      (lp_id, '0x' || substr(md5('glasswing' || i), 1, 40), 'Halcyon ' || i, 'TK5' || i,
       now() - (i * 2 || ' days')::interval, (i % 3 = 0), (i % 15 = 0),
       round((1 + random() * 18)::numeric, 2), round((2000 + random() * 480000)::numeric, 2),
       round((500 + random() * 900000)::numeric, 2), (random() > 0.85));
  end loop;

  -- ---------- Ironquay (low score — past rugpull cluster) ----------
  insert into public.launchpads
    (slug, name, description, deployer_addresses, discovery_source,
     total_launches_upstream, sample_size, onboarded_at, last_snapshot_at)
  values
    ('ironquay', 'Ironquay',
     'Confirmed rugpull cluster in July led to a sharp score drop; monitored closely since, no repeat incidents in the tracked sample.',
     array['0x0aD...9903'], 'rpc_self_indexed',
     205, 103, now() - interval '68 days', now() - interval '3 hours')
  returning id into lp_id;

  insert into public.launchpad_scores
    (launchpad_id, score_date, final_score, stars, is_provisional, sample_size,
     quality, mechanism, market_health, value, consistency, disclaimer)
  values
    (lp_id, current_date, 41.7, 1, false, 103, 38, 52, 40, 45, 33,
     'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.');

  for i in 1..20 loop
    insert into public.launches
      (launchpad_id, token_address, name, symbol, launch_date, is_graduated, is_confirmed_rugpull,
       peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag)
    values
      (lp_id, '0x' || substr(md5('ironquay' || i), 1, 40), 'Quill ' || i, 'TK6' || i,
       now() - (i * 2 || ' days')::interval, (i % 5 = 0), (i % 5 = 0),
       case when i % 5 = 0 then null else round((1 + random() * 18)::numeric, 2) end,
       case when i % 5 = 0 then null else round((2000 + random() * 480000)::numeric, 2) end,
       round((500 + random() * 900000)::numeric, 2), (random() > 0.75));
  end loop;

  -- ---------- Tidecraft ----------
  insert into public.launchpads
    (slug, name, description, deployer_addresses, discovery_source, discovery_source_url,
     total_launches_upstream, sample_size, onboarded_at, last_snapshot_at)
  values
    ('tidecraft', 'Tidecraft',
     'Small but consistent: fewer launches than most peers, but the cohort with the tightest score-history variance tracked.',
     array['0x5C7...220e'], 'mobula', 'https://docs.mobula.io',
     96, 96, now() - interval '61 days', now() - interval '1.1 hours')
  returning id into lp_id;

  insert into public.launchpad_scores
    (launchpad_id, score_date, final_score, stars, is_provisional, sample_size,
     quality, mechanism, market_health, value, consistency, disclaimer)
  values
    (lp_id, current_date, 78.8, 2, false, 96, 85, 79, 71, 62, 90,
     'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.');

  insert into public.launchpad_badges (launchpad_id, name, description, awarded_at)
  values (lp_id, 'Low Rug Rate', 'Smoothed rugpull rate in the bottom decile of the cohort.', now() - interval '24 days');

  for i in 1..19 loop
    insert into public.launches
      (launchpad_id, token_address, name, symbol, launch_date, is_graduated, is_confirmed_rugpull,
       peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag)
    values
      (lp_id, '0x' || substr(md5('tidecraft' || i), 1, 40), 'Pallas ' || i, 'TK7' || i,
       now() - (i * 2 || ' days')::interval, (i % 2 = 0), false,
       round((1 + random() * 18)::numeric, 2), round((2000 + random() * 480000)::numeric, 2),
       round((500 + random() * 900000)::numeric, 2), false);
  end loop;

end $$;

-- A handful of metrics snapshots so the ingestion pipeline has
-- something to look at immediately (one snapshot per launch).
insert into public.launch_metrics_snapshot (launch_id, snapshot_at, price_usd, liquidity_usd, volume_24h_usd, data_source)
select id, now(), round((random() * 2)::numeric, 6), liquidity_usd, volume_24h_usd, 'dexscreener'
from public.launches;
