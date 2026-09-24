// supabase/functions/sample-resample/index.ts
//
// Cron 5 — daily invocation, weekly per-launchpad effect (see
// 0012_sample_rotation.sql; actual per-launchpad cadence is
// RESAMPLE_INTERVAL_DAYS in constants.ts). Redraws which of a
// launchpad's KNOWN launches (the original onboarding-backfill sample,
// plus anything upstream-discovery has found since) make up the active
// sample.
//
// Soft-exclude, not delete: whatever isn't picked this round gets
// excluded_from_sample = true, keeping its row and its
// launch_metrics_snapshot history intact — see 0012_sample_rotation.sql's
// header note on why (launchpad_scores' day-by-day history is a
// per-launchpad aggregate, not tied to individual launches, so it is
// unaffected either way; this only changes what gets refreshed/scored
// from today onward).
//
// A launch dropped in one round is not excluded forever: it goes back
// into the same pool next time and can be drawn again, same odds as any
// other known launch.

import { supabaseAdmin, requireCronSecret } from '../_shared/supabaseAdmin.ts';
import { sampleWithMinimumAge } from '../_shared/adapters.ts';
import { fetchAllRows } from '../_shared/fetchAll.ts';
import { computeAndStoreLaunchpadScore } from '../_shared/scoring.ts';
import { computeBackfillSample, RESAMPLE_INTERVAL_DAYS } from '../_shared/constants.ts';
import { initSentry, captureException, flushSentry } from '../_shared/sentry.ts';

initSentry('sample-resample');

interface DueLaunchpad {
  id: string;
  total_launches_upstream: number | null;
}

interface KnownLaunch {
  id: string;
  launch_date: string;
  excluded_from_sample: boolean;
}

Deno.serve(async (req) => {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = supabaseAdmin();
  const cutoff = new Date(
    Date.now() - RESAMPLE_INTERVAL_DAYS * 24 * 3_600_000,
  ).toISOString();

  let due: DueLaunchpad[];
  try {
    due = await fetchAllRows<DueLaunchpad>((from, to) =>
      supabase
        .from('launchpads')
        .select('id, total_launches_upstream')
        .gt('sample_size', 0)
        .or(`last_resample_at.is.null,last_resample_at.lt.${cutoff}`)
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
    known: number;
    active_before: number;
    active_after: number;
    rescored: boolean;
    error?: string;
  }[] = [];

  for (const lp of due) {
    try {
      // Every launch this launchpad has ever had, active or not — this
      // IS the pool sampleWithMinimumAge draws the new active set from.
      const known = await fetchAllRows<KnownLaunch>((from, to) =>
        supabase
          .from('launches')
          .select('id, launch_date, excluded_from_sample')
          .eq('launchpad_id', lp.id)
          .order('id')
          .range(from, to),
      );

      if (known.length === 0) {
        results.push({
          launchpad_id: lp.id,
          known: 0,
          active_before: 0,
          active_after: 0,
          rescored: false,
        });
        continue;
      }

      const activeBefore = known.filter((l) => !l.excluded_from_sample).length;
      const targetSize = Math.min(
        computeBackfillSample(lp.total_launches_upstream ?? known.length),
        known.length,
      );
      // sampleWithMinimumAge expects `launchDate` (camelCase) — map the
      // DB's `launch_date` onto it and back rather than renaming the
      // column or widening the helper's generic just for this one caller.
      const pool = known.map((k) => ({ id: k.id, launchDate: k.launch_date }));
      const chosen = sampleWithMinimumAge(pool, targetSize);
      const chosenIds = new Set(chosen.map((c) => c.id));
      const now = new Date().toISOString();

      // Two updates rather than one row-by-row loop: cheap for the
      // thousand-row samples this can reach (same reasoning as the
      // chunked upsert in onboarding-backfill / upstream-discovery).
      if (chosenIds.size > 0) {
        const { error: includeErr } = await supabase
          .from('launches')
          .update({ excluded_from_sample: false, excluded_from_sample_at: null })
          .in('id', [...chosenIds]);
        if (includeErr) throw includeErr;
      }
      const excludedIds = known
        .map((k) => k.id)
        .filter((id) => !chosenIds.has(id));
      if (excludedIds.length > 0) {
        const { error: excludeErr } = await supabase
          .from('launches')
          .update({ excluded_from_sample: true, excluded_from_sample_at: now })
          .in('id', excludedIds);
        if (excludeErr) throw excludeErr;
      }

      await supabase
        .from('launchpads')
        .update({ sample_size: chosenIds.size, last_resample_at: now })
        .eq('id', lp.id);

      // The active set just changed (possibly a lot) — recompute the
      // score now rather than waiting on the next daily scoring-sweep,
      // same as ingestion-rotation and backfill-enrichment do for any
      // launchpad they touch.
      let rescored = false;
      try {
        const scoreResult = await computeAndStoreLaunchpadScore(supabase, lp.id);
        rescored = scoreResult !== null;
      } catch (e) {
        captureException(e, { launchpad_id: lp.id });
      }

      results.push({
        launchpad_id: lp.id,
        known: known.length,
        active_before: activeBefore,
        active_after: chosenIds.size,
        rescored,
      });
    } catch (e) {
      captureException(e, { launchpad_id: lp.id });
      results.push({
        launchpad_id: lp.id,
        known: 0,
        active_before: 0,
        active_after: 0,
        rescored: false,
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

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
