import type { DimensionKey, Launch, LaunchpadScore } from './types';
import {
  STAR_1_THRESHOLD,
  STAR_2_THRESHOLD,
  STAR_3_THRESHOLD,
  MIN_BACKFILL_FULL_THRESHOLD,
  BACKFILL_SAMPLE_RATIO,
  BACKFILL_SAMPLE_CAP,
  STALE_DATA_THRESHOLD_HOURS,
  MIN_DATA_POINTS_PER_DIMENSION,
  MIN_TOKEN_AGE_HOURS,
} from './constants';

/** Maps a 0–100 final score to a 3-stop red/amber/green ramp. The
 * boundaries are exactly the star thresholds — colour and stars must
 * never drift apart (brief, 11.2). */
export function rampColor(score: number): 'red' | 'amber' | 'green' {
  if (score >= STAR_2_THRESHOLD) return 'green';
  if (score >= STAR_1_THRESHOLD) return 'amber';
  return 'red';
}

export function starsFromScore(score: number): 0 | 1 | 2 | 3 {
  if (score >= STAR_3_THRESHOLD) return 3;
  if (score >= STAR_2_THRESHOLD) return 2;
  if (score >= STAR_1_THRESHOLD) return 1;
  return 0;
}

/** True once at least one dimension has real data behind it. A launchpad
 * with tracked launches but no measurable dimension yet has no score row
 * and must not be shown as "0.0". */
export function hasScore(score: LaunchpadScore): boolean {
  return Object.values(score.dimensions).some((v) => v !== null);
}

/** 0x1234…abcd — used wherever a token has no name/symbol yet. */
export function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}

export function formatUsd(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatMultiple(n: number | null): string {
  if (n === null) return '—';
  return `${n.toFixed(2)}×`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function hoursSince(iso: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

export function isStale(lastSnapshotAt: string, now?: Date): boolean {
  return hoursSince(lastSnapshotAt, now) > STALE_DATA_THRESHOLD_HOURS;
}

/** Mirrors computeDimensions()'s eligibility rules (see
 * supabase/functions/_shared/scoring.ts) closely enough to explain, in one
 * sentence, why a dimension is still `null` — and how close it is to
 * filling in. Display-only: never used to decide the score itself, only
 * to describe it. Returns null once the dimension has enough data (the
 * caller should already know that from `value !== null`, this is just a
 * safety fallback). */
export function dimensionGapReason(
  key: DimensionKey,
  launches: Launch[],
  now: Date = new Date(),
): string | null {
  const need = MIN_DATA_POINTS_PER_DIMENSION;
  // Only launches in the active sample count toward any dimension —
  // a launch marked "not sampled" doesn't move this number.
  const sampled = launches.filter((l) => !l.excludedFromSample);
  const isMature = (l: Launch) =>
    hoursSince(l.launchDate, now) >= MIN_TOKEN_AGE_HOURS;
  // v1.9: mirrors tieredOutcomePool() in
  // supabase/functions/_shared/scoring.ts — graduated launches win outright
  // if any exist, else mature (>=MIN_TOKEN_AGE_HOURS) ones, else the whole
  // pool. Quality/Value/Consistency have no minimum-count floor any more
  // (MIN_DATA_POINTS_PER_DIMENSION still gates Mechanism/Market Health
  // below), so these three are only ever "not yet scored" when their
  // tiered pool is completely empty.
  const tieredSelect = (pool: Launch[]): Launch[] => {
    const graduated = pool.filter((l) => l.isGraduated);
    if (graduated.length > 0) return graduated;
    const mature = pool.filter(isMature);
    if (mature.length > 0) return mature;
    return pool;
  };

  switch (key) {
    case 'quality': {
      // Mirrors scoring.ts: tier-select over the CHECKED subset.
      const checked = sampled.filter((l) => l.metricsFetchedAt !== null);
      const n = tieredSelect(checked).length;
      return n > 0 ? null : 'No launches with market data checked yet.';
    }
    case 'mechanism': {
      const n = sampled.filter((l) => l.isContractVerified !== null).length;
      return n >= need
        ? null
        : `${n} of ${need} minimum sampled launches with contract-verification data.`;
    }
    case 'marketHealth': {
      const n = sampled.filter((l) => l.metricsFetchedAt !== null).length;
      return n >= need
        ? null
        : `${n} of ${need} minimum sampled launches with market data checked.`;
    }
    case 'value':
    case 'consistency': {
      // Mirrors scoring.ts: tier-select over ALL sampled launches FIRST,
      // then check how many of that tier have price history — not the
      // other way around, so a graduated-but-not-yet-priced tier still
      // reports "no price history" rather than silently falling through
      // to mature/whole-pool launches that happen to have data.
      const n = tieredSelect(sampled).filter(
        (l) => l.peakMultiple !== null || l.peakCheckedAt !== null,
      ).length;
      return n > 0 ? null : 'No price history for the eligible launches yet.';
    }
  }
}

/** Pure reimplementation of backfillLaunchpad()'s sizing rule (see
 * backfill-sampling-policy.md), used only to power the interactive
 * worked-example on the Methodology page — never to decide anything
 * about real data, which already carries its own sampleSize. */
export function computeBackfillSample(totalLaunches: number): number {
  if (totalLaunches < MIN_BACKFILL_FULL_THRESHOLD) return totalLaunches;
  return Math.min(
    Math.ceil(totalLaunches * BACKFILL_SAMPLE_RATIO),
    BACKFILL_SAMPLE_CAP,
  );
}
