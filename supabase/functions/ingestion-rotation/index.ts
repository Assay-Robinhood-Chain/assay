// supabase/functions/ingestion-rotation/index.ts
//
// Cron 1 — every hour. Refreshes market metrics for tracked launches:
// a rotating 20%-per-hour batch for older launches, plus every launch
// under 24h old every single run (the "new-launch fast path").
// See backfill-sampling-policy.md's header note: this is a DIFFERENT
// job from the one-time onboarding backfill — do not merge the two.

import { supabaseAdmin, requireCronSecret } from "../_shared/supabaseAdmin.ts";
import { dexscreenerAdapter, blockscoutAdapter } from "../_shared/adapters.ts";

const DEXSCREENER_BASE_URL = Deno.env.get("DEXSCREENER_API_BASE_URL") ?? "https://api.dexscreener.com";
const BLOCKSCOUT_BASE_URL = Deno.env.get("BLOCKSCOUT_API_BASE_URL") ?? "";
const ROTATION_BUCKETS = 5; // 20% per hour => full cycle every 5 hours
const FAST_PATH_HOURS = 24;

Deno.serve(async (req) => {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = supabaseAdmin();
  const currentHour = Math.floor(Date.now() / 3_600_000);
  const bucket = currentHour % ROTATION_BUCKETS;

  // Fast path: every launch under 24h old, every run.
  const { data: freshLaunches, error: freshErr } = await supabase
    .from("launches")
    .select("id, token_address, launchpad_id")
    .gte("launch_date", new Date(Date.now() - FAST_PATH_HOURS * 3_600_000).toISOString());

  if (freshErr) {
    return jsonError(freshErr.message, 500);
  }

  // Rotating batch: everything else, sliced by a stable hash of the
  // launch id so the same launches land in the same bucket each cycle.
  const { data: allLaunches, error: allErr } = await supabase
    .from("launches")
    .select("id, token_address, launchpad_id");

  if (allErr) return jsonError(allErr.message, 500);

  const freshIds = new Set((freshLaunches ?? []).map((l) => l.id));
  const rotatingBatch = (allLaunches ?? []).filter(
    (l) => !freshIds.has(l.id) && hashToBucket(l.id, ROTATION_BUCKETS) === bucket
  );

  const toProcess = [...(freshLaunches ?? []), ...rotatingBatch];
  let processed = 0;
  let failed = 0;
  const touchedLaunchpads = new Set<string>();

  for (const launch of toProcess) {
    try {
      const metrics = await dexscreenerAdapter(launch.token_address, DEXSCREENER_BASE_URL);

      await supabase.from("launch_metrics_snapshot").insert({
        launch_id: launch.id,
        price_usd: metrics.priceUsd,
        liquidity_usd: metrics.liquidityUsd,
        volume_24h_usd: metrics.volume24hUsd,
        data_source: "dexscreener",
      });

      await supabase
        .from("launches")
        .update({
          liquidity_usd: metrics.liquidityUsd,
          volume_24h_usd: metrics.volume24hUsd,
        })
        .eq("id", launch.id);

      if (BLOCKSCOUT_BASE_URL) {
        // Verification check — informational only in this reference
        // implementation; wire into the Mechanism dimension once the
        // scoring formula is finalized.
        await blockscoutAdapter(launch.token_address, BLOCKSCOUT_BASE_URL);
      }

      touchedLaunchpads.add(launch.launchpad_id);
      processed += 1;
    } catch (e) {
      console.error(`ingestion failed for launch ${launch.id}:`, e);
      failed += 1;
    }
  }

  if (touchedLaunchpads.size > 0) {
    await supabase
      .from("launchpads")
      .update({ last_snapshot_at: new Date().toISOString() })
      .in("id", Array.from(touchedLaunchpads));
  }

  return new Response(
    JSON.stringify({
      bucket,
      fast_path_count: freshLaunches?.length ?? 0,
      rotating_batch_count: rotatingBatch.length,
      processed,
      failed,
    }),
    { headers: { "Content-Type": "application/json" } }
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
    headers: { "Content-Type": "application/json" },
  });
}
