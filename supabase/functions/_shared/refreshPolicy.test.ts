// Run with:  deno test supabase/functions/_shared/refreshPolicy.test.ts

import { isPeakDue } from './refreshPolicy.ts';
import { computeBackfillSample } from './constants.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

const NOW = Date.parse('2026-09-24T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

Deno.test('peak: never asked => due', () => {
  assert(isPeakDue({ launch_date: hoursAgo(2), peak_attempted_at: null }, NOW), 'null');
  assert(isPeakDue({ launch_date: hoursAgo(2) }, NOW), 'undefined');
});

Deno.test('peak: no launch date => never due (nothing to ask)', () => {
  assert(!isPeakDue({ launch_date: null, peak_attempted_at: null }, NOW), 'null date');
  assert(!isPeakDue({ launch_date: 'not-a-date', peak_attempted_at: null }, NOW), 'bad date');
});

Deno.test('peak: young tokens are re-asked once a day, not every hour', () => {
  const launch = daysAgo(3);
  assert(!isPeakDue({ launch_date: launch, peak_attempted_at: hoursAgo(1) }, NOW), '1h ago => not due');
  assert(!isPeakDue({ launch_date: launch, peak_attempted_at: hoursAgo(23) }, NOW), '23h ago => not due');
  assert(isPeakDue({ launch_date: launch, peak_attempted_at: hoursAgo(24) }, NOW), '24h ago => due');
});

Deno.test('peak: older tokens are re-asked weekly', () => {
  const launch = daysAgo(30);
  assert(!isPeakDue({ launch_date: launch, peak_attempted_at: daysAgo(3) }, NOW), '3d ago => not due');
  assert(!isPeakDue({ launch_date: launch, peak_attempted_at: hoursAgo(167) }, NOW), '167h ago => not due');
  assert(isPeakDue({ launch_date: launch, peak_attempted_at: daysAgo(7) }, NOW), '7d ago => due');
});

Deno.test('backfill sample = min(20%, 1000), all below 100', () => {
  assert(computeBackfillSample(12) === 12, '12 => all');
  assert(computeBackfillSample(99) === 99, '99 => all');
  assert(computeBackfillSample(100) === 20, '100 => 20%');
  assert(computeBackfillSample(500) === 100, '500 => 100');
  assert(computeBackfillSample(4_365) === 873, '4,365 => 873');
  assert(computeBackfillSample(4_999) === 1000, '4,999 => 1000 (ceil of 999.8)');
  assert(computeBackfillSample(5_000) === 1000, '5,000 => 1000, continuous with 20%');
  assert(computeBackfillSample(5_001) === 1000, '5,001 => capped');
  assert(computeBackfillSample(276_000) === 1000, '276,000 => capped, not 55,200');
});
