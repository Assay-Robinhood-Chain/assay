// supabase/functions/scoring-sweep/index.ts
//
// Cron 2 — once a day. Recomputes launchpad_scores for every tracked
// launchpad from its current `launches` rows, deterministically:
// same inputs + same ALGORITHM_VERSION => same output, every time.
//
// This is now a thin loop around computeAndStoreLaunchpadScore()
// (_shared/scoring.ts) — the exact same math is also run on demand,
// right after a launchpad is added (onboarding-backfill) or updated
// (ingestion-rotation), so a snapshot is never more than one add/
// update cycle stale. This sweep stays as the daily safety net that
// catches any launchpad that didn't otherwise touch, and keeps a
// full same-day record for every tracked launchpad.

import { supabaseAdmin, requireCronSecret } from '../_shared/supabaseAdmin.ts';
import {
  initSentry,
  captureException,
  flushSentry,
} from '../_shared/sentry.ts';
import { ALGORITHM_VERSION } from '../_shared/constants.ts';
import { computeAndStoreLaunchpadScore } from '../_shared/scoring.ts';

initSentry('scoring-sweep');

Deno.serve(async (req) => {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = supabaseAdmin();

  const { data: launchpads, error: lpErr } = await supabase
    .from('launchpads')
    .select('id');

  if (lpErr) {
    captureException(lpErr);
    await flushSentry();
    return jsonError(lpErr.message, 500);
  }

  const results: {
    launchpad_id: string;
    final_score: number;
    stars: number;
  }[] = [];

  for (const lp of launchpads ?? []) {
    try {
      const result = await computeAndStoreLaunchpadScore(supabase, lp.id);
      if (!result) continue;
      results.push({
        launchpad_id: result.launchpad_id,
        final_score: result.final_score,
        stars: result.stars,
      });
    } catch (e) {
      captureException(e, { launchpad_id: lp.id });
    }
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

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
