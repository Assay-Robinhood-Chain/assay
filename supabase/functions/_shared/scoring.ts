// supabase/functions/_shared/scoring.ts
//
// Single source of truth for "compute + persist a launchpad_scores row
// for ONE launchpad", factored out of scoring-sweep/index.ts so the
// exact same math runs whether it's triggered by:
//   - scoring-sweep (Cron 2, daily, loops every launchpad), or
//   - an on-demand snapshot right after launches change:
//       * onboarding-backfill (a launchpad is ADDED)
//       * ingestion-rotation  (a launchpad's launches are UPDATED)
// backfill-sampling-policy.md / the Developer Brief both assume one
// scoring implementation — this file is that implementation.

import {
  WEIGHT_QUALITY,
  WEIGHT_MECHANISM,
  WEIGHT_MARKET_HEALTH,
  WEIGHT_VALUE,
  WEIGHT_CONSISTENCY,
  MIN_SAMPLE_SIZE_FOR_CONFIDENCE,
  MIN_DATA_POINTS_PER_DIMENSION,
  MIN_TOKEN_AGE_HOURS,
  MIN_DIMENSIONS_FOR_SCORE,
  MECHANISM_COMPONENTS_MEASURED,
  MECHANISM_COMPONENTS_TOTAL,
  PROVISIONAL_STAR_CAP,
  ALGORITHM_VERSION,
  SCORE_DISCLAIMER,
  starsFromScore,
} from './constants.ts';
import { fetchAllRows } from './fetchAll.ts';

export interface LaunchRow {
  launch_date: string;
  is_graduated: boolean;
  is_confirmed_rugpull: boolean;
  peak_multiple: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  wash_trading_flag: boolean;
  // null = market data has never been fetched for this launch, so its
  // graduation status is UNKNOWN (is_graduated=false is only meaningful
  // once this is set).
  metrics_fetched_at: string | null;
  // null = not checked yet / Blockscout unavailable.
  is_contract_verified: boolean | null;
  // Set once Mobula has EVIDENCE about the token (price candles, or it
  // answered and knows the token). With peak_multiple still null that means
  // "Mobula has no price history" = the token never traded = it never rose
  // above its launch price.
  peak_checked_at: string | null;
}

/** Each dimension is 0-100, or null when there is not enough data to
 * measure it yet. null is NOT zero and NOT perfect: it is excluded from
 * the composite and shown as "n/a" in the UI. */
export interface Dimensions {
  quality: number | null;
  mechanism: number | null;
  marketHealth: number | null;
  value: number | null;
  consistency: number | null;
}

export interface LaunchpadScoreResult {
  launchpad_id: string;
  score_date: string;
  final_score: number;
  stars: number;
  is_provisional: boolean;
  sample_size: number;
  dimensions_scored: number;
}

/** Recomputes and upserts today's launchpad_scores row for a single
 * launchpad, from whatever is currently in `launches`. Deterministic:
 * same inputs + same ALGORITHM_VERSION => same output.
 *
 * Returns null if there is nothing measurable yet (no launches, or no
 * dimension has enough data) or if the upsert itself fails. */
// deno-lint-ignore no-explicit-any
export async function computeAndStoreLaunchpadScore(
  supabase: any,
  launchpadId: string,
): Promise<LaunchpadScoreResult | null> {
  // Page through ALL of the launchpad's launches: a bare .select() is
  // silently capped at 1000 rows, which would also make sample_size (taken
  // from launches.length below) wrong for any launchpad above that.
  let launches: LaunchRow[];
  try {
    launches = await fetchAllRows<LaunchRow>((from, to) =>
      supabase
        .from('launches')
        .select(
          'launch_date, is_graduated, is_confirmed_rugpull, peak_multiple, liquidity_usd, volume_24h_usd, wash_trading_flag, metrics_fetched_at, is_contract_verified, peak_checked_at',
        )
        .eq('launchpad_id', launchpadId)
        // Score off the active sample only — a launch a resample dropped
        // (or upstream-discovery hasn't drawn in yet) doesn't count
        // toward sample_size or any dimension.
        .eq('excluded_from_sample', false)
        .order('id')
        .range(from, to),
    );
  } catch (e) {
    console.error(
      `computeAndStoreLaunchpadScore: could not read launches for ${launchpadId} — ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }

  if (launches.length === 0) return null;

  const sampleSize = launches.length;
  const scored = scoreLaunches(launches);
  if (!scored) return null; // no dimension is measurable yet

  const { dims, finalScore, dimensionsScored, allDimensionsScored } = scored;

  // Provisional when the sample is small OR any dimension could not be
  // measured — a score built on partial data must not earn a full star
  // rating.
  const isProvisional =
    sampleSize < MIN_SAMPLE_SIZE_FOR_CONFIDENCE || !allDimensionsScored;
  const rawStars = starsFromScore(finalScore);
  const stars = isProvisional
    ? Math.min(rawStars, PROVISIONAL_STAR_CAP)
    : rawStars;
  const scoreDate = new Date().toISOString().slice(0, 10);

  const { error: upsertErr } = await supabase.from('launchpad_scores').upsert(
    {
      launchpad_id: launchpadId,
      score_date: scoreDate,
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
    // Most likely cause: migration 0008 (nullable dimension columns)
    // has not been applied yet.
    console.error(
      `computeAndStoreLaunchpadScore: upsert failed for ${launchpadId} — ${upsertErr.message}`,
    );
    return null;
  }

  await supabase
    .from('launchpads')
    .update({ sample_size: sampleSize })
    .eq('id', launchpadId);

  return {
    launchpad_id: launchpadId,
    score_date: scoreDate,
    final_score: finalScore,
    stars,
    is_provisional: isProvisional,
    sample_size: sampleSize,
    dimensions_scored: dimensionsScored,
  };
}

/** Pure scoring step (no I/O): dimensions -> composite over the
 * dimensions that have data, weights rescaled to sum to 1. Returns null
 * when no dimension is measurable. Exported for tests. */
export function scoreLaunches(
  launches: LaunchRow[],
  nowMs: number = Date.now(),
): {
  dims: Dimensions;
  finalScore: number;
  dimensionsScored: number;
  allDimensionsScored: boolean;
} | null {
  const dims = computeDimensions(launches, nowMs);

  const parts: [number | null, number][] = [
    [dims.quality, WEIGHT_QUALITY],
    [dims.mechanism, WEIGHT_MECHANISM],
    [dims.marketHealth, WEIGHT_MARKET_HEALTH],
    [dims.value, WEIGHT_VALUE],
    [dims.consistency, WEIGHT_CONSISTENCY],
  ];

  let weightedSum = 0;
  let availableWeight = 0;
  let dimensionsScored = 0;
  for (const [value, weight] of parts) {
    if (value === null) continue;
    weightedSum += value * weight;
    availableWeight += weight;
    dimensionsScored += 1;
  }
  // Too few dimensions measured: rescaling the weights would present a
  // couple of partial signals as the whole score. No composite at all.
  if (dimensionsScored < MIN_DIMENSIONS_FOR_SCORE) return null;

  const finalScore = clamp(weightedSum / availableWeight);
  return {
    dims,
    finalScore,
    dimensionsScored,
    allDimensionsScored: dimensionsScored === parts.length,
  };
}

export function computeDimensions(
  launches: LaunchRow[],
  nowMs: number = Date.now(),
): Dimensions {
  const enough = (count: number) => count >= MIN_DATA_POINTS_PER_DIMENSION;

  // Outcome-based dimensions (Quality, Value, Consistency) draw from a
  // strict, tiered pool instead of a fixed age/graduation gate:
  //   1. Any graduated launch in the pool -> use ONLY graduated launches.
  //      Graduation is a completed, unambiguous event — one graduation is
  //      real evidence, not a "small sample" to be distrusted, so
  //      MIN_DATA_POINTS_PER_DIMENSION does NOT apply to this tier.
  //   2. None graduated, but some are >= MIN_TOKEN_AGE_HOURS old -> use
  //      ONLY those. Same reasoning: age alone (with no graduation event)
  //      is not "in progress" the way a brand-new token is, so no minimum
  //      applies here either.
  //   3. Neither exists (the whole pool is young and unproven) -> fall
  //      back to the WHOLE pool rather than reporting "not enough data"
  //      for a launchpad's entire first days. This tier is deliberately
  //      the full pool, not a random subset: scoring.ts's contract is
  //      "same inputs + same ALGORITHM_VERSION => same output, every
  //      time" (see computeAndStoreLaunchpadScore above), and drawing a
  //      Math.random() subset would make the score for the same
  //      launches on the same day non-reproducible. Want a random-looking
  //      but still reproducible subset instead? That needs a seed derived
  //      from the data (e.g. launchpad id + score_date), not true
  //      randomness — ask if you want that wired in instead.
  // v1.9: this replaces the old single "graduated OR mature" filter that
  // still required MIN_DATA_POINTS_PER_DIMENSION (5) to count at all,
  // which is why a launchpad with e.g. one graduated token used to show
  // "Not yet scored" until four more joined it.
  const minAgeMs = MIN_TOKEN_AGE_HOURS * 3_600_000;
  const isMature = (l: LaunchRow) =>
    nowMs - Date.parse(l.launch_date) >= minAgeMs;
  function tieredOutcomePool(pool: LaunchRow[]): LaunchRow[] {
    const graduated = pool.filter((l) => l.is_graduated);
    if (graduated.length > 0) return graduated;
    const mature = pool.filter(isMature);
    if (mature.length > 0) return mature;
    return pool;
  }

  // Launches whose market data has been fetched. Before that, "not
  // graduated" / "no liquidity" only means "not looked at yet". (The
  // Dexscreener adapter throws on 429/5xx, so once metrics_fetched_at is
  // set a null liquidity really means "no DEX pool".)
  const checked = launches.filter((l) => l.metrics_fetched_at !== null);

  // Quality: smoothed graduation rate minus rugpull rate, Bayesian-adjusted
  // toward a neutral 50 for very small samples (this smoothing is
  // unrelated to — and unaffected by — the tiering above: it's what keeps
  // "1 of 1 graduated" from scoring a naive, overconfident 100). Rugpull
  // detection is not wired in yet, so is_confirmed_rugpull is always
  // false and this is graduation-only.
  let quality: number | null = null;
  const qualityPool = tieredOutcomePool(checked);
  if (qualityPool.length > 0) {
    const n = qualityPool.length;
    const gradRate = qualityPool.filter((l) => l.is_graduated).length / n;
    const rugRate = qualityPool.filter((l) => l.is_confirmed_rugpull).length / n;
    const priorWeight = Math.max(0, 20 - n);
    quality = clamp(
      ((gradRate * 100 - rugRate * 150) * n + 50 * priorWeight) /
        (n + priorWeight),
    );
  }

  // Mechanism: share of launches whose token contract is verified on
  // Blockscout, capped by the share of Mechanism's components that are
  // actually measured (verification is 1 of 3; audit and LP-lock are not
  // wired in), so one easy component cannot reach 100 on its own.
  let mechanism: number | null = null;
  const verifiable = launches.filter((l) => l.is_contract_verified !== null);
  if (enough(verifiable.length)) {
    const verified = verifiable.filter((l) => l.is_contract_verified).length;
    const coverage = MECHANISM_COMPONENTS_MEASURED / MECHANISM_COMPONENTS_TOTAL;
    mechanism = clamp((verified / verifiable.length) * 100 * coverage);
  }

  // Market health: liquidity depth across ALL checked launches, log-scaled
  // so one huge outlier can't dominate. A launch with no DEX pool has no
  // liquidity and counts as zero — a launchpad where nothing ever reached a
  // pool has NO market health; it must not be left out of the composite.
  let marketHealth: number | null = null;
  if (enough(checked.length)) {
    const avgLiquidity =
      checked.reduce(
        (sum, l) => sum + Math.log10(1 + (l.liquidity_usd ?? 0)),
        0,
      ) / checked.length;
    marketHealth = clamp((avgLiquidity / 6) * 100); // log10(1e6) = 6 -> 100
  }

  // Value + Consistency both come from peak-vs-launch multiples
  // (peak_multiple >= 1 by construction; exactly 1 = never rose above the
  // launch price).
  let value: number | null = null;
  let consistency: number | null = null;
  // A mature token Mobula has evidence on but no price candles for never
  // traded, so it never rose: it counts as 1.0x instead of being dropped
  // (dropping it would keep only tokens that traded and inflate both).
  const multiples = tieredOutcomePool(launches)
    .map((l) => l.peak_multiple ?? (l.peak_checked_at !== null ? 1 : null))
    .filter((m): m is number => m !== null)
    .sort((a, b) => a - b);
  if (multiples.length > 0) {
    // Value: gain-based, log scale. 1x = 0, 10x = 100. The old linear
    // median/10 scored a token that never moved at 10.
    const median = multiples[Math.floor(multiples.length / 2)];
    value = clamp(Math.log10(Math.max(median, 1)) * 100);

    // Consistency: how tightly outcomes cluster (std-dev in log space, so
    // one 500x token doesn't zero it out), multiplied by how good the
    // typical outcome is. Without that factor a launchpad whose tokens ALL
    // flatline would score as perfectly "consistent".
    const logs = multiples.map((m) => Math.log10(Math.max(m, 1)));
    const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
    const sd = Math.sqrt(
      logs.reduce((sum, x) => sum + (x - mean) ** 2, 0) / logs.length,
    );
    const stability = clamp(100 - sd * 100);
    consistency = clamp(stability * (value / 100));
  }

  return { quality, mechanism, marketHealth, value, consistency };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}
