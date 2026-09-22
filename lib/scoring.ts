import {
  STAR_1_THRESHOLD,
  STAR_2_THRESHOLD,
  STAR_3_THRESHOLD,
  MIN_BACKFILL_FULL_THRESHOLD,
  MAX_BACKFILL_SAMPLE,
  BACKFILL_SAMPLE_RATIO,
  STALE_DATA_THRESHOLD_HOURS,
} from "./constants";

/** Maps a 0–100 final score to a 3-stop red/amber/green ramp. The
 * boundaries are exactly the star thresholds — colour and stars must
 * never drift apart (brief, 11.2). */
export function rampColor(score: number): "red" | "amber" | "green" {
  if (score >= STAR_2_THRESHOLD) return "green";
  if (score >= STAR_1_THRESHOLD) return "amber";
  return "red";
}

export function starsFromScore(score: number): 0 | 1 | 2 | 3 {
  if (score >= STAR_3_THRESHOLD) return 3;
  if (score >= STAR_2_THRESHOLD) return 2;
  if (score >= STAR_1_THRESHOLD) return 1;
  return 0;
}

export function formatUsd(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

export function formatMultiple(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(2)}×`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function hoursSince(iso: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

export function isStale(lastSnapshotAt: string, now?: Date): boolean {
  return hoursSince(lastSnapshotAt, now) > STALE_DATA_THRESHOLD_HOURS;
}

/** Pure reimplementation of backfillLaunchpad()'s sizing rule (see
 * backfill-sampling-policy.md), used only to power the interactive
 * worked-example on the Methodology page — never to decide anything
 * about real data, which already carries its own sampleSize. */
export function computeBackfillSample(totalLaunches: number): number {
  if (totalLaunches < MIN_BACKFILL_FULL_THRESHOLD) return totalLaunches;
  return Math.min(
    MAX_BACKFILL_SAMPLE,
    Math.ceil(totalLaunches * BACKFILL_SAMPLE_RATIO)
  );
}
