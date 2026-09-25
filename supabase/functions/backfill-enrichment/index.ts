// supabase/functions/backfill-enrichment/index.ts
//
// Cron 3 — every 5 minutes. Works down the backlog of launches that
// have never had a launch_metrics_snapshot written for them
// (launches.metrics_fetched_at IS NULL — see
// 0007_backfill_enrichment.sql), fetching a bounded batch with
// bounded concurrency instead of the old onboarding-backfill
// behaviour of fetching every newly-discovered launch one at a time
// in the same synchronous request.
//
// Split rationale: at 20% of a launchpad's upstream total, capped at
// BACKFILL_SAMPLE_CAP (backfill-sampling-policy.md), a single onboarding
// can still produce a thousand launches. Fetching Dexscreener for
// all of them sequentially, inside the request that adds the
// launchpad, risks hitting the Edge Function's execution timeout —
// this function is what actually does that fetching, a few hundred
// launches at a time, on its own schedule, so onboarding-backfill can
// stay fast and just insert rows + queue them.

import { supabaseAdmin, requireCronSecret } from '../_shared/supabaseAdmin.ts';
import {
  enrichLaunchesBatch,
  type EnrichableLaunch,
} from '../_shared/enrichment.ts';
import { computeAndStoreLaunchpadScore } from '../_shared/scoring.ts';
import {
  ENRICHMENT_BATCH_SIZE,
  ENRICHMENT_CONCURRENCY,
} from '../_shared/constants.ts';
import {
  initSentry,
  captureException,
  flushSentry,
} from '../_shared/sentry.ts';

initSentry('backfill-enrichment');

const DEXSCREENER_BASE_URL =
  Deno.env.get('DEXSCREENER_API_BASE_URL') ?? 'https://api.dexscreener.com';
const BLOCKSCOUT_BASE_URL = Deno.env.get('BLOCKSCOUT_API_BASE_URL') ?? '';
const MOBULA_BASE_URL = Deno.env.get('MOBULA_API_BASE_URL') || undefined;

Deno.serve(async (req) => {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = supabaseAdmin();

  // Oldest-launch-first within the queue isn't the point here — the
  // partial index is on (launchpad_id, launch_date desc), so this
  // naturally prioritizes each launchpad's most recent launches first,
  // matching the same "recent behaviour first" bias as the backfill
  // itself.
  const { data: queued, error: queueErr } = await supabase
    .from('launches')
    .select(
      'id, token_address, launchpad_id, launch_date, name, symbol, is_contract_verified, peak_attempted_at',
    )
    .is('metrics_fetched_at', null)
    // Don't spend Dexscreener/Mobula calls on launches that aren't (or
    // aren't yet) part of the active sample — a launch upstream-discovery
    // just found sits excluded until sample-resample draws it in; a
    // dropped launch stays excluded. Either way it isn't queued here.
    .eq('excluded_from_sample', false)
    .order('launch_date', { ascending: false })
    .limit(ENRICHMENT_BATCH_SIZE);

  if (queueErr) {
    captureException(queueErr);
    await flushSentry();
    return jsonError(queueErr.message, 500);
  }

  const batch = (queued ?? []) as EnrichableLaunch[];

  // Bounded-concurrency worker pool: ENRICHMENT_CONCURRENCY requests
  // in flight at once, not 1 (too slow for a large backlog) and not
  // batch.length at once (hammers Dexscreener + this function's own
  // outbound connection limit).
  const {
    enriched,
    failed,
    touchedLaunchpads,
    mobulaDetailsFound,
    mobulaDetailsError,
    mobulaPeakRequested,
    mobulaPeakAnswered,
    mobulaPeakError,
  } = await enrichLaunchesBatch(
    supabase,
    batch,
    {
      dexscreenerBaseUrl: DEXSCREENER_BASE_URL,
      blockscoutBaseUrl: BLOCKSCOUT_BASE_URL,
      mobulaBaseUrl: MOBULA_BASE_URL,
      concurrency: ENRICHMENT_CONCURRENCY,
    },
  );

  if (touchedLaunchpads.size > 0) {
    await supabase
      .from('launchpads')
      .update({ last_snapshot_at: new Date().toISOString() })
      .in('id', Array.from(touchedLaunchpads));
  }

  // Same as ingestion-rotation: a launchpad whose launches just got
  // real metrics for the first time gets its score/rating recomputed
  // right away, not on the next daily scoring-sweep.
  let rescored = 0;
  for (const launchpadId of touchedLaunchpads) {
    try {
      const result = await computeAndStoreLaunchpadScore(supabase, launchpadId);
      if (result) rescored += 1;
    } catch (e) {
      captureException(e, { launchpad_id: launchpadId });
    }
  }

  await flushSentry();

  return new Response(
    JSON.stringify({
      queue_batch_size: batch.length,
      enriched,
      failed,
      rescored,
      // Visible proof of whether Mobula token/details is working: how many
      // of this batch's tokens Mobula returned, and the first error if not.
      mobula_details_found: mobulaDetailsFound,
      mobula_details_error: mobulaDetailsError,
      mobula_peak_requested: mobulaPeakRequested,
      mobula_peak_answered: mobulaPeakAnswered,
      mobula_peak_error: mobulaPeakError,
      // If this equals batch_size, there's almost certainly more
      // backlog left — the next run (5 minutes later) picks it up.
      likely_more_backlog: batch.length === ENRICHMENT_BATCH_SIZE,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
