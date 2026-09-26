import { Launchpad } from './types';
import {
  MIN_SAMPLE_SIZE_FOR_CONFIDENCE,
  RESAMPLE_INTERVAL_DAYS,
  RESAMPLE_CRON_HOUR_UTC,
} from './constants';

export type ConfidenceFloor = 'high' | 'med' | 'low';

const DAY_MS = 24 * 3_600_000;

/** Next occurrence of the sample-resample cron tick (daily, at
 * RESAMPLE_CRON_HOUR_UTC) on or after `from`. */
function nextCronTick(from: Date): Date {
  const tick = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      RESAMPLE_CRON_HOUR_UTC,
      0,
      0,
      0,
    ),
  );
  if (tick.getTime() <= from.getTime()) tick.setUTCDate(tick.getUTCDate() + 1);
  return tick;
}

/** When this launchpad's active sample is next due to be redrawn.
 * Mirrors the eligibility check sample-resample itself runs
 * (`last_resample_at is null OR < now - RESAMPLE_INTERVAL_DAYS`,
 * supabase/functions/sample-resample/index.ts), then rounds up to the
 * next daily cron tick that will actually pick it up. Null when the
 * launchpad has no active sample yet — sample-resample only ever
 * touches launchpads with sample_size > 0, so it's never "next" for one
 * that has none. */
export function nextResampleAt(
  lastResampleAt: string | null,
  sampleSize: number,
  now: Date = new Date(),
): string | null {
  if (sampleSize <= 0) return null;
  const dueMs = lastResampleAt
    ? Date.parse(lastResampleAt) + RESAMPLE_INTERVAL_DAYS * DAY_MS
    : now.getTime();
  return nextCronTick(new Date(Math.max(dueMs, now.getTime()))).toISOString();
}

/** Rough, display-only confidence banding for the coverage table — NOT
 * the scoring engine's confidence gate (that's binary: is_provisional).
 * This is a coarser, three-way read on how much a reader should trust
 * the sample size alone, independent of what the score came out to. */
export function confidenceFloor(sampleSize: number): ConfidenceFloor {
  if (sampleSize >= MIN_SAMPLE_SIZE_FOR_CONFIDENCE * 5) return 'high';
  if (sampleSize >= MIN_SAMPLE_SIZE_FOR_CONFIDENCE) return 'med';
  return 'low';
}

export interface Collector {
  name: string;
  provides: string;
  status: 'online' | 'degraded' | 'offline';
  role: 'discovery' | 'metrics' | 'verification' | 'fallback';
}

// Mirrors main brief section 6 + third-party-indexer-integration.md.
export const COLLECTORS: Collector[] = [
  {
    name: 'Dexscreener',
    provides: 'Price, 24h volume, liquidity',
    status: 'online',
    role: 'metrics',
  },
  {
    name: 'Blockscout',
    provides: 'Contract verification, holder distribution, transfers',
    status: 'online',
    role: 'verification',
  },
  {
    name: 'Bitquery',
    provides:
      'Documented factory addresses, decoded launch events, live trades',
    status: 'online',
    role: 'discovery',
  },
  {
    name: 'Mobula',
    provides:
      'Price history (OHLCV) → peak multiple, plus liquidity, volume and bonding status for tokens still on a curve',
    status: 'online',
    role: 'metrics',
  },
  {
    name: 'Chain RPC watcher',
    provides:
      'Self-indexed deploy/graduation events the fallback with no third party in the loop',
    status: 'online',
    role: 'fallback',
  },
];

export interface CoverageRow {
  launchpad: Launchpad;
  confidenceFloor: ConfidenceFloor;
}

export function buildCoverageRows(launchpads: Launchpad[]): CoverageRow[] {
  return launchpads
    .map((lp) => ({
      launchpad: lp,
      confidenceFloor: confidenceFloor(lp.sampleSize),
    }))
    .sort((a, b) => b.launchpad.sampleSize - a.launchpad.sampleSize);
}
