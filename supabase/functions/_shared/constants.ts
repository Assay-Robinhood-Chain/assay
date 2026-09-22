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
export const MAX_BACKFILL_SAMPLE = 250;
export const BACKFILL_SAMPLE_RATIO = 0.5;

export const ALGORITHM_VERSION = "v1.3";

export const SCORE_DISCLAIMER =
  "Scores are informational only and do not constitute financial, investment, or legal advice. Assay is not a registered investment adviser. Scores describe historical, on-chain patterns — not predictions about any specific future token. Conduct independent research before making any decision.";

export function computeBackfillSample(totalLaunches: number): number {
  if (totalLaunches < MIN_BACKFILL_FULL_THRESHOLD) return totalLaunches;
  return Math.min(
    MAX_BACKFILL_SAMPLE,
    Math.ceil(totalLaunches * BACKFILL_SAMPLE_RATIO)
  );
}

export function starsFromScore(score: number): 0 | 1 | 2 | 3 {
  if (score >= STAR_3_THRESHOLD) return 3;
  if (score >= STAR_2_THRESHOLD) return 2;
  if (score >= STAR_1_THRESHOLD) return 1;
  return 0;
}
