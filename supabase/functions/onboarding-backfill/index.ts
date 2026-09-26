// supabase/functions/onboarding-backfill/index.ts
//
// NOT scheduled by pg_cron — called once, directly, when a launchpad
// is added (e.g. from an admin action after the "Get listed" +
// checklist steps in third-party-indexer-integration.md section 6).
// Implements backfillLaunchpad() exactly as specified in
// backfill-sampling-policy.md.
//
// Request body: { "launchpadId": "<uuid>" }

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import {
  bitqueryAdapter,
  countUpstreamLaunchesViaBlockscout,
  rpcSelfIndexedAdapter,
  sampleWithMinimumAge,
} from '../_shared/adapters.ts';
import {
  enrichLaunchesBatch,
  type EnrichableLaunch,
} from '../_shared/enrichment.ts';
import {
  computeBackfillSample,
  ONBOARDING_SYNC_ENRICH_LIMIT,
  ENRICHMENT_CONCURRENCY,
  BACKFILL_POOL_MULTIPLIER,
} from '../_shared/constants.ts';
import { computeAndStoreLaunchpadScore } from '../_shared/scoring.ts';
import { fetchLogoUrl } from '../_shared/logoFetch.ts';
import {
  initSentry,
  captureException,
  flushSentry,
} from '../_shared/sentry.ts';

const BACKFILL_INSERT_CHUNK_SIZE = 500;

initSentry('onboarding-backfill');

const BLOCKSCOUT_BASE_URL = Deno.env.get('BLOCKSCOUT_API_BASE_URL') ?? '';
const DEXSCREENER_BASE_URL =
  Deno.env.get('DEXSCREENER_API_BASE_URL') ?? 'https://api.dexscreener.com';
const MOBULA_BASE_URL = Deno.env.get('MOBULA_API_BASE_URL') || undefined;

Deno.serve(async (req) => {
  // Admin-triggered, not cron-triggered — gated by ADMIN_API_KEY
  // instead of CRON_SECRET.
  const expected = Deno.env.get('ADMIN_API_KEY');
  const got = req.headers.get('x-admin-key');
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: { code: 'unauthorized' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { launchpadId } = await req.json().catch(() => ({}));
  if (!launchpadId) {
    return new Response(
      JSON.stringify({ error: { code: 'missing_launchpad_id' } }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const supabase = supabaseAdmin();

  const { data: lp, error: lpErr } = await supabase
    .from('launchpads')
    .select(
      'id, deployer_addresses, discovery_source, sample_size, website_url, logo_url',
    )
    .eq('id', launchpadId)
    .single();

  if (lpErr || !lp) {
    if (lpErr) captureException(lpErr, { launchpad_id: launchpadId });
    await flushSentry();
    return new Response(JSON.stringify({ error: { code: 'not_found' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (lp.sample_size > 0) {
    // Section 5 of backfill-sampling-policy.md: this rule never runs
    // twice for the same launchpad unless it's manually re-onboarded.
    // Logo discovery is exempt from that guard though — it's the one
    // piece of onboarding this feature ships for launchpads that were
    // already backfilled before fetchLogoUrl() existed, so re-hitting
    // this endpoint for one of them still fills in a missing logo_url
    // (never overwrites one that's already set) even though it declines
    // to touch launches/sample_size again.
    let backfilledLogoUrl: string | null = null;
    if (!lp.logo_url) {
      backfilledLogoUrl = await fetchLogoUrl(lp.website_url as string | null);
      if (backfilledLogoUrl) {
        await supabase
          .from('launchpads')
          .update({ logo_url: backfilledLogoUrl })
          .eq('id', lp.id);
      }
    }
    return new Response(
      JSON.stringify({
        error: { code: 'already_backfilled', sample_size: lp.sample_size },
        logo_url: backfilledLogoUrl ?? lp.logo_url ?? null,
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 1. total = countUpstreamLaunches(launchpadId)
  const factoryAddress = lp.deployer_addresses?.[0];
  let countResult: { total: number | null; reason: string | null };

  if (!factoryAddress) {
    countResult = {
      total: null,
      reason: `Launchpad "${lp.id}" has no deployer_addresses set — the "Factory Contract Address" field was likely empty when this was submitted.`,
    };
    console.warn(`onboarding-backfill: ${countResult.reason}`);
  } else if (!BLOCKSCOUT_BASE_URL) {
    countResult = {
      total: null,
      reason: 'BLOCKSCOUT_API_BASE_URL is not set on the server.',
    };
    console.warn(`onboarding-backfill: ${countResult.reason}`);
  } else {
    countResult = await countUpstreamLaunchesViaBlockscout(
      factoryAddress,
      BLOCKSCOUT_BASE_URL,
    );
  }
  const total = countResult.total;

  if (total === null) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'upstream_count_unknown',
          message:
            countResult.reason ??
            'countUpstreamLaunches() returned null for an unknown reason.',
        },
      }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Auto-discover a logo from the submitted website — kicked off now so
  // it runs concurrently with the discovery/insert pipeline below rather
  // than adding its own latency on top. Best-effort (see logoFetch.ts):
  // resolves to null on any failure, never rejects. A launchpad that
  // already has one (e.g. manually re-onboarded) keeps it as-is.
  const logoUrlPromise: Promise<string | null> = lp.logo_url
    ? Promise.resolve(lp.logo_url as string)
    : fetchLogoUrl(lp.website_url as string | null);

  // 2. sample = the exact rule from backfill-sampling-policy.md section 1
  const sample = computeBackfillSample(total);

  // 3. fetchLaunchPool(launchpadId, poolTarget) — gather a pool bigger
  // than `sample` across the whole discoverable history (not just the
  // newest page), then sampleWithMinimumAge() below picks a RANDOM
  // `sample` out of it — not "the most recent `sample`" — and guarantees
  // at least 10% of what comes back is older than MIN_TOKEN_AGE_HOURS
  // (72h) so Quality/Value/Consistency scoring has mature launches to
  // work with right away instead of only ever seeing brand-new ones.
  const poolTarget = sample * BACKFILL_POOL_MULTIPLIER;
  const pool =
    lp.discovery_source === 'bitquery'
      ? await bitqueryAdapter(lp.deployer_addresses ?? [], poolTarget)
      : lp.discovery_source === 'rpc_self_indexed'
        ? await rpcSelfIndexedAdapter(
            lp.deployer_addresses ?? [],
            poolTarget,
            BLOCKSCOUT_BASE_URL,
          )
        : []; // mobula: wire in a Mobula-informed manual list here.

  // Defensive: whatever adapter produced `pool`, never send the same
  // token twice in one upsert (Postgres error 21000) — dedupe BEFORE
  // sampling, so the sample isn't accidentally short a slot because two
  // entries for the same token both looked like separate candidates.
  const uniquePool = [
    ...new Map(
      pool.map((d) => [d.tokenAddress.toLowerCase(), d] as const),
    ).values(),
  ];
  const discovered = sampleWithMinimumAge(uniquePool, sample);

  // 3.5. Insert in chunks, not one row per round-trip — the sample is
  // 20% of the upstream total capped at BACKFILL_SAMPLE_CAP, so up to a
  // thousand rows, and one upsert() per row would be the same
  // "thousands of sequential round-trips" problem the token metrics
  // fetch used to have.
  let inserted = 0;
  for (const chunk of chunkArray(
    discovered,
    BACKFILL_INSERT_CHUNK_SIZE,
  )) {
    const { data: upsertedChunk, error } = await supabase
      .from('launches')
      .upsert(
        chunk.map((launch) => ({
          launchpad_id: lp.id,
          token_address: launch.tokenAddress,
          launch_date: launch.launchDate,
        })),
        { onConflict: 'launchpad_id,token_address' },
      )
      .select('id');
    if (error) {
      captureException(error, {
        launchpad_id: lp.id,
        chunk_size: chunk.length,
      });
      continue;
    }
    inserted += upsertedChunk?.length ?? 0;
  }

  // 4. record both counts — never let sample_size alone imply the
  // whole population (backfill-sampling-policy.md section 6) — plus
  // whatever fetchLogoUrl() found (or null, if nothing did).
  const logoUrl = await logoUrlPromise;

  await supabase
    .from('launchpads')
    .update({
      total_launches_upstream: total,
      sample_size: inserted,
      onboarded_at: new Date().toISOString(),
      logo_url: logoUrl,
    })
    .eq('id', lp.id);

  // 5. Enrich the newest ONBOARDING_SYNC_ENRICH_LIMIT launches RIGHT
  // HERE, synchronously, with Dexscreener (liquidity/volume/name) and
  // Mobula (peak multiple) — this is the piece that used to be entirely
  // missing: every launch just inserted has metrics_fetched_at = null
  // and peak_multiple = null, and previously nothing wrote either one
  // until backfill-enrichment's next 5-minute tick (and even then,
  // peak_multiple stayed null forever — no adapter ever computed it).
  // Approving a launchpad/token would sit at all dashes for minutes,
  // sometimes indefinitely for peak multiple specifically.
  //
  // Kept small (ONBOARDING_SYNC_ENRICH_LIMIT) so this stays well
  // inside the Edge Function's execution window even when `sample` is
  // in the thousands — backfill-enrichment still owns the rest of the
  // sample via its normal queue (metrics_fetched_at IS NULL).
  let immediateEnrichment: {
    attempted: number;
    enriched: number;
    failed: number;
  } | null = null;

  if (inserted > 0) {
    const { data: toEnrichNow, error: toEnrichErr } = await supabase
      .from('launches')
      .select('id, token_address, launchpad_id, launch_date')
      .eq('launchpad_id', lp.id)
      .is('metrics_fetched_at', null)
      .order('launch_date', { ascending: false })
      .limit(ONBOARDING_SYNC_ENRICH_LIMIT);

    if (toEnrichErr) {
      captureException(toEnrichErr, { launchpad_id: lp.id });
    } else if (toEnrichNow && toEnrichNow.length > 0) {
      const batch = toEnrichNow as EnrichableLaunch[];
      const { enriched, failed } = await enrichLaunchesBatch(supabase, batch, {
        dexscreenerBaseUrl: DEXSCREENER_BASE_URL,
        blockscoutBaseUrl: BLOCKSCOUT_BASE_URL,
        mobulaBaseUrl: MOBULA_BASE_URL,
        concurrency: Math.min(ENRICHMENT_CONCURRENCY, batch.length),
      });
      immediateEnrichment = { attempted: batch.length, enriched, failed };
    }
  }

  // 6. Compute a score/rating snapshot from `launches` as it stands
  // now — AFTER the synchronous enrichment above, so this first
  // snapshot already reflects real liquidity/peak-multiple data for
  // whichever launches got enriched just now, not just structural
  // data. Any launch beyond the sync-enrich limit still starts null
  // and gets picked up (and re-scored) by backfill-enrichment.
  const scoreResult = await computeAndStoreLaunchpadScore(supabase, lp.id);

  await flushSentry();

  const remainingQueued = Math.max(
    0,
    inserted - (immediateEnrichment?.attempted ?? 0),
  );

  return new Response(
    JSON.stringify({
      launchpad_id: lp.id,
      total_launches_upstream: total,
      sample_size: inserted,
      logo_url: logoUrl,
      score: scoreResult,
      immediate_enrichment: immediateEnrichment,
      enrichment: {
        status: remainingQueued > 0 ? 'queued' : 'nothing_to_enrich',
        queued_launches: remainingQueued,
        note: immediateEnrichment
          ? `The ${immediateEnrichment.attempted} most recent launch(es) were enriched synchronously in this request (${immediateEnrichment.enriched} succeeded, ${immediateEnrichment.failed} failed — will retry). Any remaining launches are fetched asynchronously by backfill-enrichment (runs every 5 min).`
          : 'Token-level price/liquidity/volume snapshots are fetched asynchronously by backfill-enrichment (runs every 5 min) — this response does not wait on that.',
      },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
