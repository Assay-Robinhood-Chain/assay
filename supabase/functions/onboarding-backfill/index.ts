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
} from '../_shared/adapters.ts';
import { computeBackfillSample } from '../_shared/constants.ts';
import {
  initSentry,
  captureException,
  flushSentry,
} from '../_shared/sentry.ts';

initSentry('onboarding-backfill');

const BLOCKSCOUT_BASE_URL = Deno.env.get('BLOCKSCOUT_API_BASE_URL') ?? '';

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
    .select('id, deployer_addresses, discovery_source, sample_size')
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
    return new Response(
      JSON.stringify({
        error: { code: 'already_backfilled', sample_size: lp.sample_size },
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

  // 2. sample = the exact rule from backfill-sampling-policy.md section 1
  const sample = computeBackfillSample(total);

  // 3. fetchRecentLaunches(launchpadId, sample), ORDER BY launch_date DESC
  const discovered =
    lp.discovery_source === 'bitquery'
      ? await bitqueryAdapter(lp.deployer_addresses ?? [], sample)
      : lp.discovery_source === 'rpc_self_indexed'
        ? await rpcSelfIndexedAdapter(
            lp.deployer_addresses ?? [],
            sample,
            BLOCKSCOUT_BASE_URL,
          )
        : []; // mobula: wire in a Mobula-informed manual list here.

  let inserted = 0;
  for (const launch of discovered.slice(0, sample)) {
    const { error } = await supabase.from('launches').upsert(
      {
        launchpad_id: lp.id,
        token_address: launch.tokenAddress,
        launch_date: launch.launchDate,
      },
      { onConflict: 'launchpad_id,token_address' },
    );
    if (!error) inserted += 1;
  }

  // 4. record both counts — never let sample_size alone imply the
  // whole population (backfill-sampling-policy.md section 6).
  await supabase
    .from('launchpads')
    .update({
      total_launches_upstream: total,
      sample_size: inserted,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', lp.id);

  await flushSentry();

  return new Response(
    JSON.stringify({
      launchpad_id: lp.id,
      total_launches_upstream: total,
      sample_size: inserted,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
