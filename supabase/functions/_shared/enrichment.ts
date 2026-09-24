// supabase/functions/_shared/enrichment.ts
//
// One place for "fetch market data for a launch and write the result",
// shared by:
//   - backfill-enrichment (Cron 3, every 5 min, drains the whole queue)
//   - ingestion-rotation (Cron 1, hourly refresh)
//   - onboarding-backfill (synchronous, a small batch right at approval
//     time — see ONBOARDING_SYNC_ENRICH_LIMIT in constants.ts)
//
// Data sources, and who wins when they overlap:
//   - Dexscreener: DEX pools. Authoritative for liquidity / volume / price
//     once a token has a pool. A failure (429/5xx) propagates so the launch
//     stays queued and is retried. One request per token.
//   - Mobula token/details (batched, 10 tokens per request): covers tokens
//     still on a bonding curve, which Dexscreener cannot see. Fills
//     liquidity / volume / name when Dexscreener has none, and reports
//     `bonded` (curve completed) as a second graduation signal. Best-effort.
//   - Blockscout: contract verification + token name/symbol. STATIC data —
//     only asked while it is still unknown.
//   - Mobula OHLCV (batched): peak-vs-launch multiple. Slow-changing, so only
//     asked when isPeakDue() says so (see refreshPolicy.ts). Best-effort.
//
// Request budget per token: the recurring cost is one Dexscreener call per
// refresh plus 1/10 of a Mobula details request; Blockscout and the peak
// fetch are one-time / occasional.

import {
  dexscreenerAdapter,
  blockscoutAdapter,
  mobulaTokenDetailsBatch,
  mobulaPeakMultiplesBatch,
  type MobulaPeakMultiple,
  type MobulaTokenDetails,
} from './adapters.ts';
import {
  MIN_GRADUATED_LIQUIDITY_USD,
  MOBULA_DETAILS_BATCH_SIZE,
  MOBULA_DETAILS_CONCURRENCY,
  MOBULA_PEAK_BATCH_SIZE,
  MOBULA_PEAK_CONCURRENCY,
} from './constants.ts';
import { isPeakDue } from './refreshPolicy.ts';
import { captureException } from './sentry.ts';

export interface EnrichableLaunch {
  id: string;
  token_address: string;
  launchpad_id: string;
  launch_date?: string | null;
  // Already-known state. Callers that select these let the enrichment skip
  // work that cannot have changed; leaving them out just means "unknown".
  name?: string | null;
  symbol?: string | null;
  is_contract_verified?: boolean | null;
  peak_attempted_at?: string | null;
}

export interface EnrichmentAdapterUrls {
  dexscreenerBaseUrl: string;
  blockscoutBaseUrl: string;
  mobulaBaseUrl?: string;
  concurrency: number;
}

export interface EnrichmentBatchResult {
  enriched: number;
  failed: number;
  touchedLaunchpads: Set<string>;
  mobulaDetailsFound: number;
  mobulaDetailsError: string | null;
  mobulaPeakRequested: number;
  mobulaPeakAnswered: number;
  mobulaPeakError: string | null;
}

/** Fetches + writes market data for ONE launch. Dexscreener failures
 * (rate-limited / 5xx) propagate so the caller can leave
 * metrics_fetched_at unset and retry later. Mobula (details + peak) is
 * strictly best-effort: it never blocks or invalidates the write that
 * Dexscreener already succeeded at.
 *   mobulaDetails — pre-fetched batch result for this token (undefined =
 *     Mobula returned nothing for it).
 *   peakResult    — pre-fetched peak for this token, ONLY when it was due
 *     this run (undefined = not asked; peak columns are left untouched). */
export async function enrichOneLaunch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  launch: EnrichableLaunch,
  urls: EnrichmentAdapterUrls,
  mobulaDetails?: MobulaTokenDetails,
  peakResult?: MobulaPeakMultiple,
): Promise<void> {
  const metrics = await dexscreenerAdapter(
    launch.token_address,
    urls.dexscreenerBaseUrl,
  );

  // Dexscreener first (a real DEX pool), Mobula second (bonding-curve
  // reserves / volume for tokens that have no pool yet).
  const liquidityUsd = metrics.liquidityUsd ?? mobulaDetails?.liquidityUsd ?? null;
  const volume24hUsd = metrics.volume24hUsd ?? mobulaDetails?.volume24hUsd ?? null;
  const priceUsd = metrics.priceUsd ?? mobulaDetails?.priceUsd ?? null;
  const usedMobulaMarket =
    (metrics.liquidityUsd === null && mobulaDetails?.liquidityUsd != null) ||
    (metrics.volume24hUsd === null && mobulaDetails?.volume24hUsd != null);

  // Graduated = a DEX pool with real liquidity, OR Mobula says the bonding
  // curve completed. Never flipped back to false by a later drop.
  const isGraduated =
    (metrics.liquidityUsd ?? 0) >= MIN_GRADUATED_LIQUIDITY_USD ||
    mobulaDetails?.bonded === true;

  // Contract verification and token name/symbol do not change once known,
  // so Blockscout is only asked while either is still missing. (A contract
  // that is later verified is not re-checked: the token template is
  // verified or not from deploy time.)
  const staticKnown =
    launch.is_contract_verified !== undefined &&
    launch.is_contract_verified !== null &&
    !!launch.name;
  const info =
    !staticKnown && urls.blockscoutBaseUrl
      ? await blockscoutAdapter(launch.token_address, urls.blockscoutBaseUrl)
      : null;
  const isVerified = info?.isVerified ?? null;

  // Name/symbol: Blockscout's token metadata, then Mobula, then Dexscreener.
  // Only written while the launch has none — an existing name is never
  // overwritten by a later refresh.
  const tokenName = info?.tokenName ?? mobulaDetails?.name ?? metrics.name ?? null;
  const tokenSymbol =
    info?.tokenSymbol ?? mobulaDetails?.symbol ?? metrics.symbol ?? null;

  // Peak multiple. peak_attempted_at = when we last got an ANSWER from
  // Mobula (drives the refresh schedule). peak_checked_at = Mobula has
  // EVIDENCE about the token: it returned price candles, or it answered and
  // also knows the token (details record). A token Mobula knows nothing
  // about stays unchecked — that is "no coverage", not "never traded" — and
  // is excluded from the peak statistics instead of being counted as 1.0x.
  const peakMultiple = peakResult?.peakMultiple ?? null;
  const peakAttempted = peakResult?.answered === true;
  const peakChecked =
    peakMultiple !== null || (peakAttempted && mobulaDetails !== undefined);

  const now = new Date().toISOString();

  const { error: snapshotErr } = await supabase
    .from('launch_metrics_snapshot')
    .insert({
      launch_id: launch.id,
      price_usd: priceUsd,
      liquidity_usd: liquidityUsd,
      volume_24h_usd: volume24hUsd,
      data_source: usedMobulaMarket ? 'mobula' : 'dexscreener',
    });
  if (snapshotErr) {
    // Snapshots are history, not the launch's live state: never fail the
    // enrichment over them, but don't lose the reason either. (Most likely
    // cause: migration 0010 — the 'mobula' data_source — is not applied.)
    console.warn(
      `enrichOneLaunch: snapshot insert failed for ${launch.id} — ${snapshotErr.message}`,
    );
  }

  const { error: updateErr } = await supabase
    .from('launches')
    .update({
      liquidity_usd: liquidityUsd,
      volume_24h_usd: volume24hUsd,
      metrics_fetched_at: now,
      ...(isGraduated ? { is_graduated: true } : {}),
      ...(isVerified !== null ? { is_contract_verified: isVerified } : {}),
      ...(tokenName && !launch.name ? { name: tokenName } : {}),
      ...(tokenSymbol && !launch.symbol ? { symbol: tokenSymbol } : {}),
      // Only ever write a real number: never overwrite a good peak with a
      // fresh null when Mobula temporarily has no candles.
      ...(peakMultiple !== null ? { peak_multiple: peakMultiple } : {}),
      ...(peakChecked ? { peak_checked_at: now } : {}),
      ...(peakAttempted ? { peak_attempted_at: now } : {}),
    })
    .eq('id', launch.id);
  if (updateErr) throw updateErr;
}

/** Bounded-concurrency worker pool over `launches`. Mobula's token details
 * for the whole batch, and the peak multiple for the launches that are DUE
 * for one, are fetched up front in a few batched requests (10 tokens each)
 * instead of one call per launch. Does NOT recompute the launchpad score —
 * callers do that themselves once per touched launchpad. */
export async function enrichLaunchesBatch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  launches: EnrichableLaunch[],
  urls: EnrichmentAdapterUrls,
): Promise<EnrichmentBatchResult> {
  let enriched = 0;
  let failed = 0;
  const touchedLaunchpads = new Set<string>();

  const { details, error: detailsError } = await mobulaTokenDetailsBatch(
    launches.map((l) => l.token_address),
    urls.mobulaBaseUrl,
    MOBULA_DETAILS_BATCH_SIZE,
    MOBULA_DETAILS_CONCURRENCY,
  );
  if (detailsError) {
    console.warn(
      `enrichLaunchesBatch: ${detailsError} — continuing without Mobula details for the rest of this batch.`,
    );
  }

  const nowMs = Date.now();
  const due = launches.filter(
    (l): l is EnrichableLaunch & { launch_date: string } =>
      !!l.launch_date && isPeakDue(l, nowMs),
  );
  const { peaks, error: peakError } = await mobulaPeakMultiplesBatch(
    due.map((l) => ({ tokenAddress: l.token_address, launchDate: l.launch_date })),
    urls.mobulaBaseUrl,
    MOBULA_PEAK_BATCH_SIZE,
    MOBULA_PEAK_CONCURRENCY,
  );
  if (peakError) {
    console.warn(
      `enrichLaunchesBatch: ${peakError} — peak multiples for the rest of this batch stay queued.`,
    );
  }

  let cursor = 0;
  async function worker() {
    while (cursor < launches.length) {
      const launch = launches[cursor];
      cursor += 1;
      const key = launch.token_address.toLowerCase();
      try {
        await enrichOneLaunch(
          supabase,
          launch,
          urls,
          details.get(key),
          peaks.get(key),
        );
        touchedLaunchpads.add(launch.launchpad_id);
        enriched += 1;
      } catch (e) {
        // Deliberately do NOT set metrics_fetched_at on failure — the
        // launch stays in (or re-enters) the queue and gets retried on
        // a later pass, same as a transient Dexscreener error always was.
        captureException(e, {
          launch_id: launch.id,
          launchpad_id: launch.launchpad_id,
        });
        failed += 1;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(urls.concurrency, launches.length)) },
      worker,
    ),
  );

  return {
    enriched,
    failed,
    touchedLaunchpads,
    mobulaDetailsFound: details.size,
    mobulaDetailsError: detailsError,
    mobulaPeakRequested: due.length,
    mobulaPeakAnswered: peaks.size,
    mobulaPeakError: peakError,
  };
}
