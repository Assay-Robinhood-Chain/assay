// supabase/functions/_shared/scoring.test.ts
//
// Run with:  deno test supabase/functions/_shared/scoring.test.ts
// (no imports beyond scoring.ts — plain Deno.test + a tiny assert helper.)

import {
  computeAndStoreLaunchpadScore,
  computeDimensions,
  scoreLaunches,
  type LaunchRow,
} from './scoring.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}
function near(a: number | null, b: number, eps = 0.11): boolean {
  return a !== null && Math.abs(a - b) <= eps;
}

const NOW = Date.parse('2026-09-24T12:00:00Z');
const OLD = '2026-09-01T00:00:00Z'; // well past MIN_TOKEN_AGE_HOURS
const YOUNG = '2026-09-24T00:00:00Z'; // 12h old

const base: LaunchRow = {
  launch_date: OLD,
  is_graduated: false,
  is_confirmed_rugpull: false,
  peak_multiple: null,
  liquidity_usd: null,
  volume_24h_usd: null,
  wash_trading_flag: false,
  metrics_fetched_at: '2026-09-24T00:00:00Z',
  is_contract_verified: null,
  peak_checked_at: null,
};
const make = (n: number, f: (i: number) => Partial<LaunchRow>): LaunchRow[] =>
  Array.from({ length: n }, (_, i) => ({ ...base, ...f(i) }));
const dims = (l: LaunchRow[]) => computeDimensions(l, NOW);

Deno.test('flatline launchpad (the Bags.fm screenshot) scores near zero', () => {
  // 874 checked, mature tokens: none graduated, none with liquidity, every
  // contract verified, ~60% have candles and they barely moved.
  const launches = make(874, (i) => ({
    is_contract_verified: true,
    peak_multiple: i < 524 ? (i % 3 === 0 ? 1.0 : 1.05) : null,
    peak_checked_at: i < 524 ? '2026-09-24T00:00:00Z' : null,
  }));
  const r = scoreLaunches(launches, NOW)!;
  assert(r.dims.quality === 0, 'quality 0 (no graduates)');
  assert(r.dims.marketHealth === 0, 'market health 0, NOT n/a (no pools)');
  assert(near(r.dims.mechanism, 33.3), `mechanism capped near 33.3, got ${r.dims.mechanism}`);
  assert(near(r.dims.value, 2.1), `value ~2.1 for a 1.05x median, got ${r.dims.value}`);
  assert(r.dims.consistency !== null && r.dims.consistency <= 2.2, 'consistency gated by value');
  assert(r.allDimensionsScored, 'all five dimensions present');
  assert(r.finalScore < 10, `final score < 10, got ${r.finalScore}`);
});

Deno.test('value is gain-based on a log scale', () => {
  const at = (m: number) => dims(make(10, () => ({ peak_multiple: m }))).value;
  assert(at(1) === 0, '1x => 0');
  assert(near(at(2), 30.1), '2x => ~30');
  assert(at(10) === 100, '10x => 100');
  assert(at(500) === 100, 'capped at 100');
});

Deno.test('uniform flatline is not "consistent"', () => {
  const flat = dims(make(20, () => ({ peak_multiple: 1 })));
  assert(flat.consistency === 0, 'all 1x => consistency 0');
  const steady = dims(make(20, () => ({ peak_multiple: 5 })));
  assert(near(steady.consistency, 69.9), `uniform 5x => ~70, got ${steady.consistency}`);
  const erratic = dims(make(20, (i) => ({ peak_multiple: i % 2 ? 1 : 10 })));
  assert((erratic.consistency ?? 0) < (steady.consistency ?? 0), 'erratic scores lower than steady');
});

Deno.test('one huge outlier does not zero Consistency', () => {
  const d = dims(make(30, (i) => ({ peak_multiple: i === 0 ? 5000 : 3 })));
  const uniform = dims(make(30, () => ({ peak_multiple: 3 })));
  assert((d.consistency ?? 0) > 10, `outlier must not floor Consistency to 0, got ${d.consistency}`);
  assert((d.consistency ?? 0) < (uniform.consistency ?? 0), 'but it still scores below a uniform launchpad');
});

Deno.test('market health: no pool = zero, too few checked = n/a', () => {
  assert(dims(make(50, () => ({ liquidity_usd: null }))).marketHealth === 0, 'checked, no pools => 0');
  const unchecked = dims(make(50, () => ({ metrics_fetched_at: null })));
  assert(unchecked.marketHealth === null, 'nothing checked yet => n/a');
  assert(unchecked.quality === null, 'nothing checked yet => quality n/a');
  const deep = dims(make(50, () => ({ liquidity_usd: 1_000_000 })));
  assert(deep.marketHealth !== null && deep.marketHealth > 99, 'deep liquidity => ~100');
});

Deno.test('mechanism is capped at the measured share of its components', () => {
  assert(near(dims(make(20, () => ({ is_contract_verified: true }))).mechanism, 33.3), 'all verified => 33.3, not 100');
  assert(near(dims(make(20, (i) => ({ is_contract_verified: i % 2 === 0 }))).mechanism, 16.7), 'half verified => 16.7');
  assert(dims(make(20, () => ({ is_contract_verified: null }))).mechanism === null, 'unknown verification => n/a');
});

Deno.test('dimensions need MIN_DATA_POINTS launches with data', () => {
  const d = dims(make(4, () => ({ peak_multiple: 3, is_contract_verified: true })));
  assert(d.value === null && d.consistency === null && d.mechanism === null, 'under 5 => n/a');
});

// --- v1.6 ------------------------------------------------------------------

Deno.test('young tokens are not judged on Quality / Value / Consistency', () => {
  const d = dims(
    make(50, () => ({ launch_date: YOUNG, peak_multiple: 3, liquidity_usd: 5000, is_contract_verified: true })),
  );
  assert(d.quality === null, 'quality n/a for 12h-old tokens');
  assert(d.value === null && d.consistency === null, 'value + consistency n/a for 12h-old tokens');
  // Mechanism and Market Health describe the CURRENT state: all ages count.
  assert(d.mechanism !== null && d.marketHealth !== null, 'mechanism + market health still measured');
});

Deno.test('a mixed-age sample only judges the mature tokens', () => {
  const launches = [
    ...make(10, () => ({ launch_date: OLD, peak_multiple: 4 })),
    ...make(500, () => ({ launch_date: YOUNG, peak_multiple: 1 })),
  ];
  const d = dims(launches);
  assert(near(d.value, 60.2), `value from the 10 mature tokens only (4x => 60.2), got ${d.value}`);
});

Deno.test('Mobula "no price history" counts as 1.0x, "no evidence" is excluded', () => {
  // 10 tokens traded (2x); 10 are confirmed by Mobula to have no candles.
  const withChecked = dims([
    ...make(10, () => ({ peak_multiple: 2, peak_checked_at: '2026-09-24T00:00:00Z' })),
    ...make(10, () => ({ peak_multiple: null, peak_checked_at: '2026-09-24T00:00:00Z' })),
  ]);
  // median of ten 1.0 + ten 2.0 = 2.0 (upper median), but the flat half drags Consistency
  const onlyTraded = dims([
    ...make(10, () => ({ peak_multiple: 2, peak_checked_at: '2026-09-24T00:00:00Z' })),
    ...make(10, () => ({ peak_multiple: null, peak_checked_at: null })), // no Mobula evidence
  ]);
  assert((withChecked.consistency ?? 0) < (onlyTraded.consistency ?? 99), 'confirmed-flat tokens lower Consistency');
  assert(onlyTraded.value !== null, 'unknown tokens are simply left out, not counted');
  const allUnknown = dims(make(30, () => ({ peak_multiple: null, peak_checked_at: null })));
  assert(allUnknown.value === null, 'no Mobula evidence at all => Value n/a');
  const allFlat = dims(make(30, () => ({ peak_multiple: null, peak_checked_at: '2026-09-24T00:00:00Z' })));
  assert(allFlat.value === 0 && allFlat.consistency === 0, 'all confirmed-never-traded => Value 0, Consistency 0');
});

Deno.test('a composite needs at least 3 dimensions', () => {
  // Young sample: only Mechanism + Market Health are measurable => 2 dims.
  const young = make(100, () => ({ launch_date: YOUNG, is_contract_verified: true }));
  assert(scoreLaunches(young, NOW) === null, 'only 2 dimensions => no composite');
  // Same launchpad once the tokens are old enough: 3+ dims => a score.
  const mature = make(100, () => ({ launch_date: OLD, is_contract_verified: true }));
  const r = scoreLaunches(mature, NOW);
  assert(r !== null && r.dimensionsScored >= 3, 'mature sample => scored');
});

Deno.test('no measurable dimension => no score', () => {
  assert(scoreLaunches(make(30, () => ({ metrics_fetched_at: null })), NOW) === null, 'nothing checked => null');
});

// --- persistence: paging past PostgREST's 1000-row cap -------------------

function fakeSupabase(rows: LaunchRow[]) {
  const requests: [number, number][] = [];
  const upserts: Record<string, unknown>[] = [];
  let sampleUpdate: unknown = null;
  const client = {
    from(table: string) {
      if (table === 'launches') {
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          range: (from: number, to: number) => {
            requests.push([from, to]);
            // emulate PostgREST: never more than 1000 rows per request
            return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null });
          },
        };
        return q;
      }
      return {
        upsert: (p: Record<string, unknown>) => { upserts.push(p); return Promise.resolve({ error: null }); },
        update: (p: unknown) => ({ eq: () => { sampleUpdate = p; return Promise.resolve({ error: null }); } }),
      };
    },
  };
  return { client, requests, upserts, getSampleUpdate: () => sampleUpdate };
}

Deno.test('scoring reads every launch, not just the first 1000', async () => {
  const rows = make(2500, () => ({ is_contract_verified: true }));
  const fake = fakeSupabase(rows);
  const result = await computeAndStoreLaunchpadScore(fake.client, 'lp-1');
  assert(fake.requests.length === 3, `3 pages for 2500 rows, got ${fake.requests.length}`);
  assert(result !== null && result.sample_size === 2500, 'sample_size counts all 2500 rows');
  assert(fake.upserts[0].algorithm_version === 'v1.6', 'algorithm_version v1.6');
  assert((fake.getSampleUpdate() as { sample_size: number }).sample_size === 2500, 'launchpads.sample_size = 2500');
});
