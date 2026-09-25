// supabase/functions/ingestion-rotation/index.ts
//
// Cron 1 — every hour. Refreshes market metrics for tracked launches:
// a rotating 20%-per-hour batch for older launches, plus the launches
// under 24h old (the "new-launch fast path"), each refreshed every
// FAST_PATH_REFRESH_HOURS hours — one hash bucket per run, so the load is
// flat rather than a burst of every fresh launch each hour.
// See backfill-sampling-policy.md's header note: this is a DIFFERENT
// job from the one-time onboarding backfill — do not merge the two.

import { supabaseAdmin, requireCronSecret } from '../_shared/supabaseAdmin.ts';
import {
  enrichLaunchesBatch,
  type EnrichableLaunch,
} from '../_shared/enrichment.ts';
import { computeAndStoreLaunchpadScore } from '../_shared/scoring.ts';
import { fetchAllRows } from '../_shared/fetchAll.ts';
import {
  ENRICHMENT_CONCURRENCY,
  FAST_PATH_REFRESH_HOURS,
} from '../_shared/constants.ts';
import {
  initSentry,
  captureException,
  flushSentry,
} from '../_shared/sentry.ts';

initSentry('ingestion-rotation');

const DEXSCREENER_BASE_URL =
  Deno.env.get('DEXSCREENER_API_BASE_URL') ?? 'https://api.dexscreener.com';
const BLOCKSCOUT_BASE_URL = Deno.env.get('BLOCKSCOUT_API_BASE_URL') ?? '';
const MOBULA_BASE_URL = Deno.env.get('MOBULA_API_BASE_URL') || undefined;
const ROTATION_BUCKETS = 5; // 20% per hour => full cycle every 5 hours
const FAST_PATH_HOURS = 24;
// Columns the enrichment uses to skip work that cannot have changed.
const LAUNCH_COLUMNS =
  'id, token_address, launchpad_id, launch_date, name, symbol, is_contract_verified, peak_attempted_at';

Deno.serve(async (req) => {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = supabaseAdmin();
  const currentHour = Math.floor(Date.now() / 3_600_000);
  const bucket = currentHour % ROTATION_BUCKETS;
  const fastBucket = currentHour % FAST_PATH_REFRESH_HOURS;

  // Both reads page through the whole table (fetchAllRows): a bare
  // .select() is silently capped at 1000 rows by PostgREST, which would
  // leave every launch beyond the first 1000 (in arbitrary order) without
  // a refresh, forever.
  const freshCutoff = new Date(
    Date.now() - FAST_PATH_HOURS * 3_600_000,
  ).toISOString();

  let freshLaunches: EnrichableLaunch[];
  let olderLaunches: EnrichableLaunch[];
  try {
    // Fast path: every ACTIVE launch under 24h old (a third of them per
    // run). excluded_from_sample = true means a resample dropped it (or
    // upstream-discovery found it but hasn't been drawn in yet) — skip
    // it here the same way backfill-enrichment and scoring do.
    freshLaunches = await fetchAllRows<EnrichableLaunch>((from, to) =>
      supabase
        .from('launches')
        .select(LAUNCH_COLUMNS)
        .eq('excluded_from_sample', false)
        .gte('launch_date', freshCutoff)
        .order('id')
        .range(from, to),
    );

    // Everything older — the rotating batch is sliced from this.
    olderLaunches = await fetchAllRows<EnrichableLaunch>((from, to) =>
      supabase
        .from('launches')
        .select(LAUNCH_COLUMNS)
        .eq('excluded_from_sample', false)
        .lt('launch_date', freshCutoff)
        .order('id')
        .range(from, to),
    );
  } catch (e) {
    captureException(e);
    await flushSentry();
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }

  // Rotating batch: sliced by a stable hash of the launch id so the same
  // launches land in the same bucket each cycle.
  const rotatingBatch = olderLaunches.filter(
    (l) => hashToBucket(l.id, ROTATION_BUCKETS) === bucket,
  );

  // Fast path, spread: each fresh launch lands in one of
  // FAST_PATH_REFRESH_HOURS buckets and is refreshed when its bucket comes
  // up — every 3 hours instead of every hour, at a third of the load per run.
  const freshBatch = freshLaunches.filter(
    (l) => hashToBucket(l.id, FAST_PATH_REFRESH_HOURS) === fastBucket,
  );

  const toProcess: EnrichableLaunch[] = [...freshBatch, ...rotatingBatch];

  // Bounded-concurrency worker pool (same pattern as backfill-enrichment,
  // now the same shared implementation): ENRICHMENT_CONCURRENCY launches
  // in flight at once instead of one at a time, so a run over hundreds of
  // launches finishes well inside the Edge Function wall-clock limit.
  // Mobula details ride along on every refresh (one request per 10
  // tokens); the peak multiple is only re-asked when isPeakDue() says so
  // (daily while young, weekly after), so it keeps climbing if a token
  // makes a new high without costing a call per launch per hour.
  const {
    enriched: processed,
    failed,
    touchedLaunchpads,
    mobulaDetailsFound,
    mobulaDetailsError,
    mobulaPeakRequested,
    mobulaPeakAnswered,
    mobulaPeakError,
  } = await enrichLaunchesBatch(supabase, toProcess, {
    dexscreenerBaseUrl: DEXSCREENER_BASE_URL,
    blockscoutBaseUrl: BLOCKSCOUT_BASE_URL,
    mobulaBaseUrl: MOBULA_BASE_URL,
    concurrency: ENRICHMENT_CONCURRENCY,
  });

  if (touchedLaunchpads.size > 0) {
    await supabase
      .from('launchpads')
      .update({ last_snapshot_at: new Date().toISOString() })
      .in('id', Array.from(touchedLaunchpads));
  }

  // Every launchpad whose launches actually got new metrics this run
  // gets a fresh score/rating snapshot right away — the token-detail
  // snapshot above and the score/rating snapshot below always land
  // together, on the same update, instead of the score waiting for
  // the next daily scoring-sweep.
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
      bucket,
      fast_path_total: freshLaunches.length,
      fast_path_count: freshBatch.length,
      rotating_batch_count: rotatingBatch.length,
      processed,
      failed,
      rescored,
      mobula_details_found: mobulaDetailsFound,
      mobula_details_error: mobulaDetailsError,
      mobula_peak_requested: mobulaPeakRequested,
      mobula_peak_answered: mobulaPeakAnswered,
      mobula_peak_error: mobulaPeakError,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

function hashToBucket(id: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % buckets;
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
