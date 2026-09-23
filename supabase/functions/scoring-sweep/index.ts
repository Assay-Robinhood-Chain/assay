// supabase/functions/scoring-sweep/index.ts
//
// Cron 2 — once a day. Recomputes launchpad_scores for every tracked
// launchpad from its current `launches` rows, deterministically:
// same inputs + same ALGORITHM_VERSION => same output, every time.
//
// The five dimension formulas below are a REFERENCE implementation —
// they use only what's in the current schema (graduation/rugpull
// flags, peak multiple, liquidity/volume, wash-trading flag). Replace
// with the finalized formulas from the Developer Brief's scoring
// section once available; the invariant that must survive that swap
// is everything after "-- composite + gating" below.

import { supabaseAdmin, requireCronSecret } from '../_shared/supabaseAdmin.ts';
import {
  initSentry,
  captureException,
  flushSentry,
} from '../_shared/sentry.ts';
import {
  WEIGHT_QUALITY,
  WEIGHT_MECHANISM,
  WEIGHT_MARKET_HEALTH,
  WEIGHT_VALUE,
  WEIGHT_CONSISTENCY,
  MIN_SAMPLE_SIZE_FOR_CONFIDENCE,
  PROVISIONAL_STAR_CAP,
  ALGORITHM_VERSION,
  SCORE_DISCLAIMER,
  starsFromScore,
} from '../_shared/constants.ts';

initSentry('scoring-sweep');

interface LaunchRow {
  is_graduated: boolean;
  is_confirmed_rugpull: boolean;
  peak_multiple: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  wash_trading_flag: boolean;
}

Deno.serve(async (req) => {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = supabaseAdmin();

  const { data: launchpads, error: lpErr } = await supabase
    .from('launchpads')
    .select('id, sample_size');

  if (lpErr) {
    captureException(lpErr);
    await flushSentry();
    return jsonError(lpErr.message, 500);
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: {
    launchpad_id: string;
    final_score: number;
    stars: number;
  }[] = [];

  for (const lp of launchpads ?? []) {
    const { data: launches, error: lErr } = await supabase
      .from('launches')
      .select(
        'is_graduated, is_confirmed_rugpull, peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag',
      )
      .eq('launchpad_id', lp.id);

    if (lErr || !launches || launches.length === 0) continue;

    const dims = computeDimensions(launches as LaunchRow[]);
    const sampleSize = launches.length;

    // -- composite + gating (do not change this section when the
    // dimension formulas above are swapped for the finalized ones) --
    const rawScore =
      dims.quality * WEIGHT_QUALITY +
      dims.mechanism * WEIGHT_MECHANISM +
      dims.marketHealth * WEIGHT_MARKET_HEALTH +
      dims.value * WEIGHT_VALUE +
      dims.consistency * WEIGHT_CONSISTENCY;

    const finalScore = Math.max(
      0,
      Math.min(100, Math.round(rawScore * 10) / 10),
    );
    const isProvisional = sampleSize < MIN_SAMPLE_SIZE_FOR_CONFIDENCE;
    const rawStars = starsFromScore(finalScore);
    const stars = isProvisional
      ? Math.min(rawStars, PROVISIONAL_STAR_CAP)
      : rawStars;

    const { error: upsertErr } = await supabase.from('launchpad_scores').upsert(
      {
        launchpad_id: lp.id,
        score_date: today,
        algorithm_version: ALGORITHM_VERSION,
        final_score: finalScore,
        stars,
        is_provisional: isProvisional,
        sample_size: sampleSize,
        quality: dims.quality,
        mechanism: dims.mechanism,
        market_health: dims.marketHealth,
        value: dims.value,
        consistency: dims.consistency,
        disclaimer: SCORE_DISCLAIMER,
      },
      { onConflict: 'launchpad_id,score_date' },
    );

    if (upsertErr) {
      captureException(upsertErr, { launchpad_id: lp.id });
      continue;
    }

    await supabase
      .from('launchpads')
      .update({ sample_size: sampleSize })
      .eq('id', lp.id);
    results.push({ launchpad_id: lp.id, final_score: finalScore, stars });
  }

  await flushSentry();

  return new Response(
    JSON.stringify({
      scored: results.length,
      algorithm_version: ALGORITHM_VERSION,
      results,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

function computeDimensions(launches: LaunchRow[]) {
  const n = launches.length;
  const rugRate = launches.filter((l) => l.is_confirmed_rugpull).length / n;
  const gradRate = launches.filter((l) => l.is_graduated).length / n;

  // Quality: smoothed graduation minus rugpull rate, Bayesian-adjusted
  // toward a neutral 50 for very small samples so a handful of
  // launches can't swing the score to the extremes.
  const priorWeight = Math.max(0, 20 - n);
  const quality = clamp(
    ((gradRate * 100 - rugRate * 150) * n + 50 * priorWeight) /
      (n + priorWeight),
  );

  // Mechanism: penalize wash-trading flags as a stand-in until
  // contract-verification + LP-lock data is wired in (see the
  // blockscoutAdapter call in ingestion-rotation).
  const washRate = launches.filter((l) => l.wash_trading_flag).length / n;
  const mechanism = clamp(100 - washRate * 100);

  // Market health: liquidity/volume depth, log-scaled so one huge
  // outlier launch can't dominate the average.
  const avgLiquidity =
    launches.reduce((s, l) => s + Math.log10(1 + (l.liquidity_usd ?? 0)), 0) /
    n;
  const marketHealth = clamp((avgLiquidity / 6) * 100); // log10(1e6) = 6 -> ~100

  // Value: capped median peak-vs-launch multiple.
  const multiples = launches
    .map((l) => l.peak_multiple)
    .filter((m): m is number => m != null)
    .sort((a, b) => a - b);
  const median = multiples.length
    ? multiples[Math.floor(multiples.length / 2)]
    : 0;
  const value = clamp((Math.min(median, 10) / 10) * 100);

  // Consistency: inverse of variance across peak multiples — a tight
  // spread scores higher than a few huge wins next to many rugs.
  const mean = multiples.length
    ? multiples.reduce((a, b) => a + b, 0) / multiples.length
    : 0;
  const variance = multiples.length
    ? multiples.reduce((s, m) => s + (m - mean) ** 2, 0) / multiples.length
    : 0;
  const consistency = clamp(100 - Math.sqrt(variance) * 5);

  return { quality, mechanism, marketHealth, value, consistency };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
