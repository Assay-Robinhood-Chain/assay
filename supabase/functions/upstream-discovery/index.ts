// supabase/functions/upstream-discovery/index.ts
//
// Cron 4 — daily (see 0012_sample_rotation.sql; actual per-launchpad
// cadence is DISCOVERY_INTERVAL_HOURS in constants.ts, not the cron
// schedule itself). Looks for launches an onboarded launchpad's factory
// has created since the last check, and inserts any that are new.
//
// This does NOT touch the active sample. New launches are inserted with
// excluded_from_sample = true — "known, but not yet drawn in" — same
// state as a launch a resample has dropped. sample-resample is the only
// thing that ever sets excluded_from_sample = false. That split exists
// so a launchpad that suddenly ships 500 tokens in one day doesn't
// silently balloon the active (refreshed + scored) sample by 500 — it
// just grows the known population sample-resample draws from next time
// it runs.
//
// Only ever acts on launchpads that have already been through
// onboarding-backfill once (sample_size > 0) — a launchpad that has
// never been onboarded has no factory/discovery_source relationship
// established yet and stays onboarding-backfill's job, not this one.

import { supabaseAdmin, requireCronSecret } from '../_shared/supabaseAdmin.ts';
import {
  bitqueryAdapter,
  countUpstreamLaunchesViaBlockscout,
  rpcSelfIndexedAdapter,
} from '../_shared/adapters.ts';
import { fetchAllRows } from '../_shared/fetchAll.ts';
import {
  DISCOVERY_INTERVAL_HOURS,
  DISCOVERY_SCAN_SIZE,
  DISCOVERY_CURSOR_MAX_POOL,
  DISCOVERY_CURSOR_OVERLAP_MINUTES,
} from '../_shared/constants.ts';
import { initSentry, captureException, flushSentry } from '../_shared/sentry.ts';

initSentry('upstream-discovery');

const BLOCKSCOUT_BASE_URL = Deno.env.get('BLOCKSCOUT_API_BASE_URL') ?? '';
const INSERT_CHUNK_SIZE = 500;

interface DueLaunchpad {
  id: string;
  discovery_source: string | null;
  deployer_addresses: string[] | null;
  total_launches_upstream: number | null;
  last_discovered_launch_at: string | null;
}

Deno.serve(async (req) => {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = supabaseAdmin();
  const cutoff = new Date(
    Date.now() - DISCOVERY_INTERVAL_HOURS * 3_600_000,
  ).toISOString();

  // Onboarded (sample_size > 0) AND due (never discovered, or last
  // discovery run was more than DISCOVERY_INTERVAL_HOURS ago).
  let due: DueLaunchpad[];
  try {
    due = await fetchAllRows<DueLaunchpad>((from, to) =>
      supabase
        .from('launchpads')
        .select(
          'id, discovery_source, deployer_addresses, total_launches_upstream, last_discovered_launch_at',
        )
        .gt('sample_size', 0)
        .or(`last_discovery_at.is.null,last_discovery_at.lt.${cutoff}`)
        .order('id')
        .range(from, to),
    );
  } catch (e) {
    captureException(e);
    await flushSentry();
    return jsonError(e instanceof Error ? e.message : String(e), 500);
  }

  const results: {
    launchpad_id: string;
    found: number;
    inserted: number;
    total_launches_upstream: number | null;
    error?: string;
  }[] = [];

  for (const lp of due) {
    try {
      const factoryAddress = lp.deployer_addresses?.[0];

      // Refresh the upstream total while we're here — this is what lets
      // computeBackfillSample() at resample time reflect a launchpad
      // that has genuinely grown, not just whatever total was recorded
      // once at onboarding. Best-effort: keep the old total if this
      // fails, rather than blocking discovery on it.
      let totalUpstream = lp.total_launches_upstream;
      if (factoryAddress && BLOCKSCOUT_BASE_URL) {
        const countResult = await countUpstreamLaunchesViaBlockscout(
          factoryAddress,
          BLOCKSCOUT_BASE_URL,
        );
        if (countResult.total !== null) totalUpstream = countResult.total;
      }

      // With a cursor: scan only what is newer than it (minus a small
      // overlap), up to a generous safety cap. Without one (first run
      // after this column was added): the old fixed-size recent scan.
      const cursor = lp.last_discovered_launch_at;
      const sinceIso = cursor
        ? new Date(
            new Date(cursor).getTime() -
              DISCOVERY_CURSOR_OVERLAP_MINUTES * 60_000,
          ).toISOString()
        : undefined;
      const scanSize = sinceIso ? DISCOVERY_CURSOR_MAX_POOL : DISCOVERY_SCAN_SIZE;

      const pool =
        lp.discovery_source === 'bitquery'
          ? await bitqueryAdapter(lp.deployer_addresses ?? [], scanSize)
          : lp.discovery_source === 'rpc_self_indexed'
            ? await rpcSelfIndexedAdapter(
                lp.deployer_addresses ?? [],
                scanSize,
                BLOCKSCOUT_BASE_URL,
                sinceIso,
              )
            : []; // mobula: no automated discovery source yet.

      // Dedupe the pool itself, then let the upsert's ignoreDuplicates
      // skip anything already known — never touch (or re-exclude) a
      // launch that's already in `launches`, active or not.
      const uniquePool = [
        ...new Map(
          pool.map((d) => [d.tokenAddress.toLowerCase(), d] as const),
        ).values(),
      ];

      let inserted = 0;
      for (const chunk of chunkArray(uniquePool, INSERT_CHUNK_SIZE)) {
        const { data, error } = await supabase
          .from('launches')
          .upsert(
            chunk.map((launch) => ({
              launchpad_id: lp.id,
              token_address: launch.tokenAddress,
              launch_date: launch.launchDate,
              // Newly discovered launches wait for the next sample-resample
              // to decide whether they join the active sample.
              excluded_from_sample: true,
              excluded_from_sample_at: new Date().toISOString(),
            })),
            { onConflict: 'launchpad_id,token_address', ignoreDuplicates: true },
          )
          .select('id');
        if (error) {
          captureException(error, { launchpad_id: lp.id, chunk_size: chunk.length });
          continue;
        }
        inserted += data?.length ?? 0;
      }

      // Advance the cursor to the newest launch actually SEEN (not
      // now()), so a launch that lands between scans can never fall
      // into a gap. Never move it backwards; keep it if nothing was found.
      const newestSeen = uniquePool.reduce<string | null>(
        (max, d) => (max === null || d.launchDate > max ? d.launchDate : max),
        null,
      );
      const nextCursor =
        newestSeen !== null &&
        (cursor === null || newestSeen > new Date(cursor).toISOString())
          ? newestSeen
          : null;

      await supabase
        .from('launchpads')
        .update({
          ...(nextCursor !== null ? { last_discovered_launch_at: nextCursor } : {}),
          last_discovery_at: new Date().toISOString(),
          ...(totalUpstream !== null ? { total_launches_upstream: totalUpstream } : {}),
        })
        .eq('id', lp.id);

      results.push({
        launchpad_id: lp.id,
        found: uniquePool.length,
        inserted,
        total_launches_upstream: totalUpstream,
      });
    } catch (e) {
      captureException(e, { launchpad_id: lp.id });
      results.push({
        launchpad_id: lp.id,
        found: 0,
        inserted: 0,
        total_launches_upstream: lp.total_launches_upstream,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await flushSentry();

  return new Response(
    JSON.stringify({
      checked: due.length,
      results,
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

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
