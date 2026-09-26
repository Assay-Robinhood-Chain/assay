// supabase/functions/_shared/constants.ts
// Deno-side mirror of lib/constants.ts. Keep these two files in sync —
// this is the one place a genuine "bare number" risk exists, because
// the frontend and the Edge Functions run in separate bundles.

export const STAR_3_THRESHOLD = 80;
export const STAR_2_THRESHOLD = 60;
export const STAR_1_THRESHOLD = 40;
export const MIN_SAMPLE_SIZE_FOR_CONFIDENCE = 20;
export const PROVISIONAL_STAR_CAP = 1;

export const WEIGHT_QUALITY = 0.3;
export const WEIGHT_MECHANISM = 0.2;
export const WEIGHT_MARKET_HEALTH = 0.2;
export const WEIGHT_VALUE = 0.2;
export const WEIGHT_CONSISTENCY = 0.1;

export const MIN_BACKFILL_FULL_THRESHOLD = 100;
export const BACKFILL_SAMPLE_RATIO = 0.2;
// Upper bound on the one-time backfill, so a very large launchpad (tens of
// thousands of launches) cannot flood the upstream APIs. 20% of 5,000 is
// exactly 1,000, so the rule is continuous: min(20%, 1000).
export const BACKFILL_SAMPLE_CAP = 1000;

// How much bigger a pool onboarding-backfill asks an adapter to gather
// than the sample it actually wants — gives sampleWithMinimumAge (see
// adapters.ts) real launches from across the timeline to pick from,
// instead of only whatever the first page of results happens to contain.
// Lowered from 3 -> 1.5 after a large launchpad (Pons) hit 546
// WallClockTime: rpcSelfIndexedAdapter pages Blockscout SEQUENTIALLY
// (cursor-based, can't be parallelised), so poolTarget = sample *
// this multiplier directly sets how many round-trips that loop makes.
// The real fix is RPC_DISCOVERY_TIME_BUDGET_MS below — this just keeps
// the common case comfortably inside it.
export const BACKFILL_POOL_MULTIPLIER = 1.5;

// Hard ceiling on how long rpcSelfIndexedAdapter's pagination loop is
// allowed to keep calling Blockscout, wall-clock, regardless of
// poolTarget/maxPages. Edge Function wall-clock limits are 150s (free)
// / 400s (paid) for the WHOLE request — this budget is deliberately
// well under that, leaving headroom for countUpstreamLaunches (before
// this loop) and the insert/enrichment/scoring steps (after it) in the
// same request. Hitting this budget is not an error: the loop just
// returns whatever pool it has gathered so far instead of continuing
// toward poolTarget, and sampleWithMinimumAge samples from that
// smaller-than-ideal pool rather than the function being killed by the
// platform mid-request.
export const RPC_DISCOVERY_TIME_BUDGET_MS = 90_000;

// --- Upstream discovery + sample resample (post-onboarding) ---
// onboarding-backfill only ever runs once per launchpad. These two crons
// are what keep an onboarded launchpad's data from going stale forever:
// upstream-discovery looks for launches created SINCE onboarding (or the
// last discovery run); sample-resample periodically redraws which known
// launches are the active sample, so newly-discovered launches actually
// get a chance to be tracked instead of just piling up unused.
//
// Deliberately two different cadences: discovery is cheap (one recent-
// activity scan) and safe to run often, so new launches show up in the
// known population quickly. Resampling is what changes WHICH launches are
// actively refreshed/scored, so it runs less often to avoid the active
// sample (and therefore the score) churning day to day.
export const DISCOVERY_INTERVAL_HOURS = 24; // upstream-discovery: daily
export const RESAMPLE_INTERVAL_DAYS = 1; // sample-resample: daily
// How many recent logs upstream-discovery asks an adapter to scan per
// launchpad per run, looking for launches not already in `launches`. Kept
// small relative to BACKFILL_SAMPLE_CAP — this is a "did anything new show
// up recently" check running daily, not a full re-backfill.
export const DISCOVERY_SCAN_SIZE = 200;
// Once a launchpad has a discovery cursor (launchpads.last_discovered_launch_at),
// upstream-discovery no longer scans a fixed "200 newest logs" — it pages
// only until it reaches logs older than the cursor. This is the safety cap
// on how many launches that can gather in one run (a very busy day), and the
// overlap re-scanned before the cursor so boundary launches are never missed
// (duplicates are harmless: the upsert uses ignoreDuplicates).
export const DISCOVERY_CURSOR_MAX_POOL = 1000;
export const DISCOVERY_CURSOR_OVERLAP_MINUTES = 60;

// backfill-enrichment (async token-detail queue) — see
// 0007_backfill_enrichment.sql. Tuned to stay well inside an Edge
// Function's execution window even for a large backlog: a few hundred
// launches per run, fetched with bounded concurrency rather than
// sequentially or all-at-once.
export const ENRICHMENT_BATCH_SIZE = 300;
export const ENRICHMENT_CONCURRENCY = 15;

// onboarding-backfill (called synchronously from the approve action —
// app/api/admin/moderation/route.ts) enriches this many of the
// newest-just-inserted launches itself, right in the same request,
// instead of leaving every single one for backfill-enrichment's next
// 5-minute tick. Deliberately small: `sample` can be in the thousands,
// and this has to stay well inside the Edge Function's execution
// window. The rest of the sample still goes through the normal queue.
export const ONBOARDING_SYNC_ENRICH_LIMIT = 20;

// A launch counts as "graduated" once it has a DEX pool (per Dexscreener)
// with at least this much liquidity. Graduation is a historical fact, so
// once set it is never flipped back to false by a later liquidity drop.
export const MIN_GRADUATED_LIQUIDITY_USD = 1000;

// A dimension is only scored when at least this many launches carry the
// data it needs. Below that it is reported as missing (null) rather than
// as a number computed from a handful of tokens.
// v1.9: this floor no longer applies to Quality, Value or Consistency —
// see tieredOutcomePool() in scoring.ts. It still gates Mechanism and
// Market Health.
export const MIN_DATA_POINTS_PER_DIMENSION = 5;

// Mechanism is defined as contract verification + audit status + LP-lock,
// but only verification is measured today. Scoring it as the verification
// rate alone would hand a launchpad 100/100 for one easily-satisfied
// component (tokens from one factory share bytecode, so Blockscout tends to
// mark them all verified). The score is therefore capped at the share of
// components actually measured. Raise MECHANISM_COMPONENTS_MEASURED when
// audit / LP-lock data is wired in.
export const MECHANISM_COMPONENTS_MEASURED = 1;
export const MECHANISM_COMPONENTS_TOTAL = 3;

// The age threshold used by tieredOutcomePool()'s 2nd-priority tier (see
// scoring.ts): once a launchpad has no graduated launches at all, its
// launches at least this old are used for Quality/Value/Consistency
// instead. A launch younger than this AND not graduated only reaches
// these dimensions through tier 3 (the whole pool, when nothing has
// graduated or aged past this yet) — see tieredOutcomePool() for the full
// priority order. Mechanism and Market Health describe the current state
// and count every token regardless of age.
export const MIN_TOKEN_AGE_HOURS = 72;

// A composite needs at least this many of the five dimensions measured.
// With fewer (e.g. only Mechanism + Market Health), rescaling the weights
// would present a couple of partial signals as if they were the whole
// score, so no composite is produced at all ("Not yet scored").
export const MIN_DIMENSIONS_FOR_SCORE = 3;

// --- Refresh policy (keeps recurring API cost proportional to what changes) ---
// Tokens under 24h old are refreshed by ingestion-rotation every run, but
// each token only every FAST_PATH_REFRESH_HOURS hours (spread over hash
// buckets, so the load is flat instead of one burst per hour).
export const FAST_PATH_REFRESH_HOURS = 3;
// Peak multiple (Mobula OHLCV) changes slowly and only feeds Value and
// Consistency, so it is re-asked at most this often: daily while a token is
// under PEAK_REFRESH_YOUNG_DAYS old (peaks move most early), weekly after.
export const PEAK_REFRESH_YOUNG_HOURS = 24;
export const PEAK_REFRESH_YOUNG_DAYS = 14;
export const PEAK_REFRESH_OLD_HOURS = 168;
// Mobula OHLCV is batched (POST, 10 tokens per request = 10 credits, vs
// 5 credits per single-token GET).
export const MOBULA_PEAK_BATCH_SIZE = 10;
export const MOBULA_PEAK_CONCURRENCY = 4;

// Mobula token/details is batched (POST): this many tokens per request,
// this many requests in flight at once.
export const MOBULA_DETAILS_BATCH_SIZE = 10;
export const MOBULA_DETAILS_CONCURRENCY = 4;

// v1.9: Quality/Value/Consistency replace the old graduated-OR-mature
// filter with a strict tiered pool (graduated > mature > whole pool, see
// tieredOutcomePool() in scoring.ts) and drop the MIN_DATA_POINTS_PER_
// DIMENSION floor for all three — one graduated or mature launch is now
// enough to score off of, and a launchpad with neither is scored off its
// whole (young, unproven) sample rather than showing "not yet scored".
// v1.7: a graduated token counts toward Quality / Value / Consistency
// immediately, regardless of MIN_TOKEN_AGE_HOURS — graduation is a
// completed event, so it no longer waits out the 72h maturity window
// (a token that simply hasn't graduated yet still does). A young
// graduated token's peak multiple is still only counted once Mobula has
// actually answered for it (peak_checked_at set) — this doesn't invent
// data, only lifts the age gate.
// v1.6: tokens under MIN_TOKEN_AGE_HOURS are excluded from Quality / Value /
// Consistency; "Mobula had no price history" counts as a 1.0x peak instead
// of being dropped; a composite needs MIN_DIMENSIONS_FOR_SCORE dimensions.
// v1.5 (on top of v1.4's "no data => null, excluded from the composite"):
//   - Value is gain-based on a log scale (a token that never rose above its
//     launch price scores 0, not 10).
//   - Consistency is stability in log space, multiplied by how good the
//     typical outcome is (uniformly flat tokens are not "consistent").
//   - Market Health averages over ALL checked launches; a token with no DEX
//     pool counts as zero liquidity instead of being left out.
//   - Mechanism is capped by the share of its components actually measured.
export const ALGORITHM_VERSION = 'v1.9';

// SSRF-safe fetch (see ssrfSafeFetch.ts) and submission rate limiting
export const URL_FETCH_TIMEOUT_MS = 8000;
export const URL_FETCH_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_REDIRECT_HOPS = 3;
export const SUBMISSION_RATE_LIMIT_PER_HOUR = 5; // per launchpad_submissions
export const REPORT_RATE_LIMIT_PER_HOUR = 10; // per community_reports (higher — cheaper to file)

export const SCORE_DISCLAIMER =
  'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.';

export function computeBackfillSample(totalLaunches: number): number {
  if (totalLaunches < MIN_BACKFILL_FULL_THRESHOLD) return totalLaunches;
  return Math.min(
    Math.ceil(totalLaunches * BACKFILL_SAMPLE_RATIO),
    BACKFILL_SAMPLE_CAP,
  );
}

export function starsFromScore(score: number): 0 | 1 | 2 | 3 {
  if (score >= STAR_3_THRESHOLD) return 3;
  if (score >= STAR_2_THRESHOLD) return 2;
  if (score >= STAR_1_THRESHOLD) return 1;
  return 0;
}

// --- Auto-approve of new_launchpad submissions ---
// auto-approve-submissions (cron, every minute) approves a pending
// "new_launchpad" submission once it has waited this long without a manual
// decision — the window in which an admin can still reject it (the
// moderation webhook pings on every new submission). Only rows younger than
// AUTO_APPROVE_MAX_AGE_MINUTES are considered, so a submission whose
// approval keeps failing is left for manual review instead of being retried
// forever. AUTO_APPROVE_MAX_PER_RUN bounds how much onboarding (and
// therefore Blockscout/Dexscreener spend) one tick can trigger.
export const AUTO_APPROVE_AFTER_MINUTES = 5;
export const AUTO_APPROVE_MAX_AGE_MINUTES = 60;
export const AUTO_APPROVE_MAX_PER_RUN = 3;
