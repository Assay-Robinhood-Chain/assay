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

Deno.test('v1.9: Mechanism/Market Health still need MIN_DATA_POINTS; Quality/Value/Consistency no longer do', () => {
  // Only 4 data points — under 5, but none graduated and none mature
  // (default launch_date is OLD, i.e. mature), so tier 2 (mature) still
  // picks all 4 up for Quality/Value/Consistency.
  const d = dims(make(4, () => ({ peak_multiple: 3, is_contract_verified: true })));
  assert(d.mechanism === null, 'mechanism still needs >=5 data points, got ' + d.mechanism);
  assert(
    d.value !== null && d.consistency !== null,
    'v1.9: value/consistency score off a tiered pool of any size, got ' + JSON.stringify(d),
  );
});

// --- v1.9 (supersedes v1.6/v1.7 below) --------------------------------------
// v1.6 excluded young, non-graduated tokens from Quality/Value/Consistency
// until they passed MIN_TOKEN_AGE_HOURS, and required >=5 to count at all.
// v1.7 let an already-graduated young token count immediately, merged
// together with any mature tokens in one combined pool.
// v1.9 replaces that combined pool with a strict PRIORITY: graduated
// launches win outright when any exist (mature-but-not-graduated ones are
// then excluded, not merged in); else mature launches win; else the whole
// (young, unproven) pool is used rather than reporting "not yet scored".
// None of these three tiers requires MIN_DATA_POINTS_PER_DIMENSION anymore.

Deno.test('v1.9: with no graduates and nothing past 72h, the whole young sample is used (tier 3)', () => {
  const d = dims(
    make(50, () => ({ launch_date: YOUNG, peak_multiple: 3, liquidity_usd: 5000, is_contract_verified: true })),
  );
  assert(near(d.quality, 0), `all-active, none graduated/mature => quality 0 (not n/a), got ${d.quality}`);
  assert(near(d.value, 47.7), `value from the whole young pool (median 3x), got ${d.value}`);
  assert(d.consistency !== null, 'consistency also falls back to the whole pool');
  // Mechanism and Market Health describe the CURRENT state and were never
  // gated by this — unaffected either way.
  assert(d.mechanism !== null && d.marketHealth !== null, 'mechanism + market health still measured');
});

Deno.test('v1.9: a graduated launch wins outright — mature-but-not-graduated ones are excluded, not merged', () => {
  // 10 already graduated (2x peaks) + 10 merely mature, never graduated,
  // and doing MUCH better (10x peaks). The old v1.7 rule would have
  // merged all 20 into one pool. v1.9 must NOT: once any graduated launch
  // exists, only graduated launches count toward Quality/Value/Consistency.
  const launches = [
    ...make(10, () => ({ is_graduated: true, peak_multiple: 2, peak_checked_at: '2026-09-24T00:00:00Z' })),
    ...make(10, () => ({ is_graduated: false, peak_multiple: 10, peak_checked_at: '2026-09-24T00:00:00Z' })),
  ];
  const d = dims(launches);
  // n=10, 100% graduation rate, Bayesian prior (weight 10) pulls it to 75.
  assert(near(d.quality, 75), `quality from the 10 graduated only, got ${d.quality}`);
  // If the 10x-peak mature tokens had been merged in, value would hit the
  // 100 cap (10x = 100). Getting 30.1 instead proves they were excluded.
  assert(near(d.value, 30.1), `value from the 10 graduated 2x peaks ONLY, got ${d.value}`);
});

Deno.test('v1.9: no graduates, none mature either => the whole (young) sample is scored, not n/a', () => {
  const d = dims(make(20, () => ({ launch_date: YOUNG, peak_multiple: 5 })));
  assert(near(d.quality, 0), `no graduates + all young => quality 0 (tier 3), got ${d.quality}`);
  assert(near(d.value, 69.9), `value off the whole young pool (5x median), got ${d.value}`);
});

Deno.test('a mixed-age sample with no graduates only judges the mature tokens (tier 2)', () => {
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
  // v1.9: Quality is measurable off as few as 1 checked launch (no floor),
  // so isolating "only 2 dims" now means keeping Market Health (which
  // still needs >=5 checked) out, not keeping Quality out. Mechanism
  // (100 verified) + Quality (3 checked, mature by default) = 2 dims;
  // Value/Consistency stay null (no peak data anywhere in either sample).
  const twoDims = [
    ...make(3, () => ({ is_contract_verified: true })),
    ...make(97, () => ({ is_contract_verified: true, metrics_fetched_at: null })),
  ];
  assert(scoreLaunches(twoDims, NOW) === null, 'only 2 dimensions => no composite');
  // Bump checked past 5 and Market Health joins in => 3 dims => scored.
  const threeDims = [
    ...make(10, () => ({ is_contract_verified: true })),
    ...make(90, () => ({ is_contract_verified: true, metrics_fetched_at: null })),
  ];
  const r = scoreLaunches(threeDims, NOW);
  assert(r !== null && r.dimensionsScored >= 3, '>=5 checked adds Market Health => 3 dims => scored');
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
  assert(fake.upserts[0].algorithm_version === 'v1.9', 'algorithm_version v1.9');
  assert((fake.getSampleUpdate() as { sample_size: number }).sample_size === 2500, 'launchpads.sample_size = 2500');
});
