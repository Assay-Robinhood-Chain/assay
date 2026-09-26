// Every threshold below is a named constant with a specific meaning,
// mirroring the Developer Brief's rule: "no number floating in prose."
// These are the *frontend*-facing mirrors of constants that, per the
// brief, actually live server-side (src/config/*.ts) and gate the score
// itself — the frontend never re-derives them, only displays them.

export const TARGET_CHAIN = 'Robinhood Chain' as const;

// Section 8 — scoring
export const STAR_3_THRESHOLD = 80;
export const STAR_2_THRESHOLD = 60;
export const STAR_1_THRESHOLD = 40;
export const MIN_SAMPLE_SIZE_FOR_CONFIDENCE = 20;
export const PROVISIONAL_STAR_CAP = 1;
// Server-side rule, mirrored for display: a dimension is only scored once
// this many launches carry the data it needs.
export const MIN_DATA_POINTS_PER_DIMENSION = 5;
// Server-side rules, mirrored for display (see supabase/functions/_shared/constants.ts).
export const MIN_TOKEN_AGE_HOURS = 72;
export const MIN_DIMENSIONS_FOR_SCORE = 3;

export const WEIGHT_QUALITY = 0.3;
export const WEIGHT_MECHANISM = 0.2;
export const WEIGHT_MARKET_HEALTH = 0.2;
export const WEIGHT_VALUE = 0.2;
export const WEIGHT_CONSISTENCY = 0.1;

// Section 11.3 — states
export const STALE_DATA_THRESHOLD_HOURS = 6;
export const MOBILE_BREAKPOINT_PX = 768;

// backfill-sampling-policy.md — onboarding-only, one-time rule.
// NOT the hourly ingestion rotation (ingestionJob.ts) — do not conflate.
// The sample is BACKFILL_SAMPLE_RATIO of whatever countUpstreamLaunches()
// reports for that launchpad, capped at BACKFILL_SAMPLE_CAP so a very large
// launchpad cannot flood the upstream APIs. 20% of 5,000 is exactly 1,000,
// so the rule is continuous: min(20%, 1000).
export const MIN_BACKFILL_FULL_THRESHOLD = 100;
export const BACKFILL_SAMPLE_RATIO = 0.2;
export const BACKFILL_SAMPLE_CAP = 1000;

// Ingestion / scoring cadence (section 6 and section 15 of the brief,
// and the cronjob the whole pipeline runs on).
export const INGESTION_INTERVAL_HOURS = 1; // Collectors + Normaliser rotation
export const SCORING_SWEEP_INTERVAL_HOURS = 24; // daily scoring cronjob

// Cron 5 — sample-resample (0012_sample_rotation.sql). Ticks daily at
// RESAMPLE_CRON_HOUR_UTC; RESAMPLE_INTERVAL_DAYS is the per-launchpad
// cadence that decides which launchpads are actually due on a given tick
// (mirrors supabase/functions/_shared/constants.ts).
export const RESAMPLE_INTERVAL_DAYS = 1;
export const RESAMPLE_CRON_HOUR_UTC = 4; // 04:00 UTC, after discovery + scoring

// third-party-indexer-integration.md — launch discovery source priority
export const BITQUERY_DAILY_CALL_BUDGET = 4000;
export const DISCOVERY_SOURCE_LABELS = {
  bitquery: 'Bitquery',
  mobula: 'Mobula',
  rpc_self_indexed: 'RPC self-indexed',
} as const;

// Section 9 — API
export const PUBLIC_CACHE_TTL_SECONDS = 300;
export const MAX_PAGE_LIMIT = 200;
export const DEFAULT_PAGE_LIMIT = 50;

// Section 17 — the fixed disclaimer, shipped at the API/serializer layer
// on every response carrying a final_score, per the brief. The frontend
// merely renders what the API already attached — it does not compose it.
export const SCORE_DISCLAIMER =
  'Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns not predictions about any specific future token. Conduct independent research before making any decision.';

export const DIMENSION_LABELS = {
  quality: 'Quality',
  mechanism: 'Mechanism',
  marketHealth: 'Market Health',
  value: 'Value',
  consistency: 'Consistency',
} as const;

export const DIMENSION_WEIGHTS: Record<keyof typeof DIMENSION_LABELS, number> =
  {
    quality: WEIGHT_QUALITY,
    mechanism: WEIGHT_MECHANISM,
    marketHealth: WEIGHT_MARKET_HEALTH,
    value: WEIGHT_VALUE,
    consistency: WEIGHT_CONSISTENCY,
  };

export const DIMENSION_DESCRIPTIONS: Record<
  keyof typeof DIMENSION_LABELS,
  string
> = {
  quality:
    "Smoothed graduation rate + smoothed rugpull rate, Bayesian adjusted so tiny samples aren't over  or under penalized.",
  mechanism: 'Contract verification, audit status, and LP-lock rate.',
  marketHealth:
    'Liquidity/volume depth, minus wash-trading and holder-concentration penalties.',
  value:
    "Capped median peak-vs-launch price multiple, so one outlier token can't dominate a launchpad's average.",
  consistency:
    "Recency-weighted outcome stability across a launchpad's history, variance-penalized.",
};

// What each dimension actually measures TODAY (algorithm v1.6), as opposed
// to what DIMENSION_DESCRIPTIONS says it will eventually cover. Update this
// whenever a new data source is wired into the scorer.
export const DIMENSION_BASIS: Record<keyof typeof DIMENSION_LABELS, string> = {
  quality:
    'Measured today: graduation rate of tokens at least 72h old (a DEX pool with real liquidity, or a completed bonding curve) a token that has already graduated counts immediately regardless of age. Rugpull detection is not wired in yet.',
  mechanism:
    'Measured today: share of token contracts verified on Blockscout, capped at one third of the scale until audit and LP-lock data are wired in.',
  marketHealth:
    'Measured today: liquidity depth across all checked tokens (DEX pool via Dexscreener, or bonding-curve reserves via Mobula) a token with neither counts as zero. Volume, wash-trading and holder-concentration are not wired in yet.',
  value:
    'Measured today: median peak-vs-launch multiple of tokens at least 72h old, or already graduated (Mobula price candles), on a log scale a token that never rose above its launch price scores 0, 10× scores 100.',
  consistency:
    'Measured today: how tightly peak multiples cluster, multiplied by how good the typical outcome is tokens that all flatline do not count as consistent.',
};
