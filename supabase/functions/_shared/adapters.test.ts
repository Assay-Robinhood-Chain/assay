// supabase/functions/_shared/adapters.test.ts
//
// Run with:  deno test --allow-env supabase/functions/_shared/adapters.test.ts

import {
  mobulaAdapter,
  mobulaPeakMultiplesBatch,
  mobulaTokenDetailsBatch,
  parseMobulaTokenDetails,
  peakFromCandles,
  rpcSelfIndexedAdapter,
  sampleWithMinimumAge,
} from './adapters.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const realFetch = g.fetch;

Deno.test('parseMobulaTokenDetails maps the documented fields', () => {
  const r = parseMobulaTokenDetails({
    address: '0xAbC', name: ' Bag Coin ', symbol: 'BAG', priceUSD: 0.5,
    liquidityUSD: 1234.5, volume24hUSD: 99, bonded: true,
  })!;
  assert(r.address === '0xabc', 'address lower-cased');
  assert(r.details.name === 'Bag Coin' && r.details.symbol === 'BAG', 'name/symbol cleaned');
  assert(r.details.liquidityUsd === 1234.5 && r.details.volume24hUsd === 99, 'liquidity + volume');
  assert(r.details.bonded === true, 'bonded flag');
  assert(parseMobulaTokenDetails(null) === null, 'null entry => null');
  assert(parseMobulaTokenDetails({ name: 'x' }) === null, 'no address => null');
  const partial = parseMobulaTokenDetails({ address: '0x1', liquidityUSD: null, volume24hUSD: 'n/a', bonded: 'yes' })!;
  assert(partial.details.liquidityUsd === null && partial.details.volume24hUsd === null, 'non-numbers => null');
  assert(partial.details.bonded === false, 'only a real true counts as bonded');
});

Deno.test('details batch: chunks of 10, blockchain param, auth header, payload/data', async () => {
  g.Deno.env.set?.('MOBULA_API_KEY', ' "secret" ');
  g.Deno.env.set?.('MOBULA_CHAIN_ID', ' "evm:4663"');
  const calls: { url: string; init: RequestInit; body: { blockchain: string; address: string }[] }[] = [];
  g.fetch = (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, init, body });
    const payload = body.map((b: { address: string }) => ({ address: b.address, name: 'T' + b.address, liquidityUSD: 10, bonded: false }));
    // alternate the two documented response shapes
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(calls.length % 2 ? { payload } : { data: payload }) });
  };
  const addrs = Array.from({ length: 23 }, (_, i) => `0xAA${String(i).padStart(2, '0')}`);
  const r = await mobulaTokenDetailsBatch(addrs);
  g.fetch = realFetch;
  assert(calls.length === 3, `23 tokens => 3 requests, got ${calls.length}`);
  assert(calls.every((c) => c.body.length <= 10), 'at most 10 per request');
  assert(calls[0].url === 'https://api.mobula.io/api/2/token/details', 'POST /token/details');
  assert((calls[0].init.headers as Record<string, string>).Authorization === 'secret', 'key trimmed + unquoted');
  assert(calls[0].body[0].blockchain === 'evm:4663', 'blockchain param, quotes/space stripped');
  assert(r.details.size === 23 && r.error === null, 'all 23 parsed, no error');
  assert(r.details.get('0xaa05')?.name === 'T0xAA05', 'keyed by lower-cased address');
});

Deno.test('details batch: first failure stops further requests, keeps earlier results', async () => {
  let n = 0;
  g.fetch = (_u: string, init: RequestInit) => {
    n += 1;
    const body = JSON.parse(String(init.body));
    if (n === 2) return Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('slow down') });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ payload: body.map((b: { address: string }) => ({ address: b.address })) }) });
  };
  const addrs = Array.from({ length: 50 }, (_, i) => `0xBB${String(i).padStart(2, '0')}`);
  const r = await mobulaTokenDetailsBatch(addrs, undefined, 10, 1);
  g.fetch = realFetch;
  assert(/429/.test(r.error ?? ''), 'error reports the status');
  assert(n === 2, `stops scheduling after the failure (concurrency 1): ${n} requests`);
  assert(r.details.size === 10, 'keeps the first chunk');
});

Deno.test('details batch: no key => no request, no error', async () => {
  g.Deno.env.set?.('MOBULA_API_KEY', '');
  let called = false;
  g.fetch = () => { called = true; return Promise.reject(new Error('should not be called')); };
  const r = await mobulaTokenDetailsBatch(['0x1']);
  g.fetch = realFetch;
  assert(!called && r.details.size === 0 && r.error === null, 'silent when not configured');
});

Deno.test('peak adapter reports whether Mobula answered', async () => {
  g.Deno.env.set?.('MOBULA_API_KEY', 'k');
  g.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [] }) });
  const empty = await mobulaAdapter('0x1', '2026-09-20T00:00:00Z');
  assert(empty.peakMultiple === null && empty.answered === true, 'empty candles: answered, no peak');
  g.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: [{ t: 1, o: 2, h: 8 }, { t: 2, o: 3, h: 4 }] }) });
  const traded = await mobulaAdapter('0x1', '2026-09-20T00:00:00Z');
  assert(traded.peakMultiple === 4 && traded.answered === true, 'peak = 8 / first open 2 = 4x');
  g.Deno.env.set?.('MOBULA_API_KEY', '');
  const skipped = await mobulaAdapter('0x1', '2026-09-20T00:00:00Z');
  g.fetch = realFetch;
  assert(skipped.answered === false, 'no key: not asked');
});

Deno.test('peakFromCandles: highest high / first open', () => {
  const r = peakFromCandles([{ t: 2, o: 3, h: 4 }, { t: 1, o: 2, h: 8 }]);
  assert(r.peakMultiple === 4 && r.launchPriceUsd === 2 && r.peakPriceUsd === 8 && r.answered, '8 / 2 = 4x');
  assert(peakFromCandles([]).peakMultiple === null && peakFromCandles([]).answered, 'empty => answered, no peak');
  assert(peakFromCandles([{ t: 1, o: 0, h: 5 }]).peakMultiple === null, 'zero open => null');
});

Deno.test('peak batch: chunks of 10, per-item params, answers keyed by address', async () => {
  g.Deno.env.set?.('MOBULA_API_KEY', 'k');
  g.Deno.env.set?.('MOBULA_CHAIN_ID', 'evm:4663');
  const calls: { url: string; body: Record<string, unknown>[] }[] = [];
  g.fetch = (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url, body });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({
      data: body.map((b: { address: string }) =>
        b.address === '0xCC01'
          ? { address: b.address, chainId: 'evm:4663', ohlcv: [], error: 'No pool found for this token' }
          : b.address === '0xCC02'
            ? { address: b.address, chainId: 'evm:4663', ohlcv: [], error: 'internal boom' }
            : { address: b.address.toUpperCase().replace('0X', '0x'), chainId: 'evm:4663', ohlcv: [{ t: 1, o: 1, h: 6 }] }),
    }) });
  };
  const items = Array.from({ length: 12 }, (_, i) => ({
    tokenAddress: `0xCC${String(i).padStart(2, '0')}`, launchDate: '2026-09-20T00:00:00Z',
  }));
  const r = await mobulaPeakMultiplesBatch(items);
  g.fetch = realFetch;
  assert(calls.length === 2 && calls[0].body.length === 10 && calls[1].body.length === 2, '12 tokens => 10 + 2');
  assert(calls[0].url === 'https://api.mobula.io/api/2/token/ohlcv-history', 'POST /token/ohlcv-history');
  const item = calls[0].body[0] as Record<string, unknown>;
  assert(item.chainId === 'evm:4663' && item.period === '1h' && item.amount === 2000, 'chain, period, amount');
  assert(item.from === Date.parse('2026-09-20T00:00:00Z'), 'from = launch date (ms)');
  assert(r.peaks.get('0xcc00')?.peakMultiple === 6, 'peak 6x, keyed by lower-cased address');
  assert(r.peaks.get('0xcc01')?.peakMultiple === null && r.peaks.get('0xcc01')?.answered === true, '"no pool" => answered, no peak');
  assert(!r.peaks.has('0xcc02'), 'unknown per-token error => absent (retry later)');
  assert(r.error === null, 'no request error');
});

Deno.test('peak batch: failure stops, keeps earlier chunks; no key => silent', async () => {
  g.Deno.env.set?.('MOBULA_API_KEY', 'k');
  let n = 0;
  g.fetch = (_u: string, init: RequestInit) => {
    n += 1;
    const body = JSON.parse(String(init.body));
    if (n === 2) return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('bad key') });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: body.map((b: { address: string }) => ({ address: b.address, ohlcv: [{ t: 1, o: 1, h: 2 }] })) }) });
  };
  const items = Array.from({ length: 30 }, (_, i) => ({ tokenAddress: `0xDD${String(i).padStart(2, '0')}`, launchDate: '2026-09-20T00:00:00Z' }));
  const r = await mobulaPeakMultiplesBatch(items, undefined, 10, 1);
  assert(/401/.test(r.error ?? '') && r.peaks.size === 10 && n === 2, 'stops after the 401, keeps chunk 1');
  g.Deno.env.set?.('MOBULA_API_KEY', '');
  let called = false;
  g.fetch = () => { called = true; return Promise.reject(new Error('no')); };
  const none = await mobulaPeakMultiplesBatch(items);
  g.fetch = realFetch;
  assert(!called && none.peaks.size === 0 && none.error === null, 'no key => no request, no error');
});

Deno.test('sampleWithMinimumAge: guarantees >=10% older than 72h when available', () => {
  const now = Date.parse('2026-09-24T00:00:00Z');
  const hour = 3_600_000;
  // 80 "recent" items (1h old) + 20 "old" items (200h old) = 100-item pool.
  const recent = Array.from({ length: 80 }, (_, i) => ({
    id: `recent-${i}`,
    launchDate: new Date(now - 1 * hour).toISOString(),
  }));
  const old = Array.from({ length: 20 }, (_, i) => ({
    id: `old-${i}`,
    launchDate: new Date(now - 200 * hour).toISOString(),
  }));
  const pool = [...recent, ...old];

  const result = sampleWithMinimumAge(pool, 50, { now });
  assert(result.length === 50, 'returns exactly `sample` items');
  const oldCount = result.filter((r) => r.id.startsWith('old-')).length;
  assert(oldCount >= 5, `>=10% of 50 must be old, got ${oldCount}`);

  // Not deterministic which recent items are chosen — but calling it twice
  // should not always return the identical set (i.e. it's not silently
  // falling back to "the first N" / "the newest N").
  const again = sampleWithMinimumAge(pool, 50, { now });
  const same = result.every((r, i) => r.id === again[i].id);
  assert(!same, 'two calls should not produce the exact same order/set every time');
});

Deno.test('sampleWithMinimumAge: pool smaller than sample returns everything', () => {
  const now = Date.parse('2026-09-24T00:00:00Z');
  const pool = Array.from({ length: 5 }, (_, i) => ({
    id: `x-${i}`,
    launchDate: new Date(now).toISOString(),
  }));
  const result = sampleWithMinimumAge(pool, 20, { now });
  assert(result.length === 5, 'cannot return more than the pool has');
});

Deno.test('sampleWithMinimumAge: caps the old floor at how many old items actually exist', () => {
  const now = Date.parse('2026-09-24T00:00:00Z');
  const hour = 3_600_000;
  const recent = Array.from({ length: 95 }, (_, i) => ({
    id: `recent-${i}`,
    launchDate: new Date(now - 1 * hour).toISOString(),
  }));
  const old = [{ id: 'old-0', launchDate: new Date(now - 200 * hour).toISOString() }];
  const result = sampleWithMinimumAge([...recent, ...old], 50, { now });
  assert(result.length === 50, 'still returns the full sample size');
  // Only one old item exists in the whole pool, so at most one can appear —
  // this must not throw or hang trying to find 5 old items that don't exist.
  const oldCount = result.filter((r) => r.id === 'old-0').length;
  assert(oldCount <= 1, 'cannot manufacture old items that are not in the pool');
});

Deno.test('rpcSelfIndexedAdapter: returns the raw pool it found — no sort, no sampling', async () => {
  g.Deno.env.set?.('BLOCKSCOUT_API_KEY', 'k');
  const items = Array.from({ length: 8 }, (_, i) => ({
    decoded: {
      method_call: 'TokenLaunched',
      parameters: [{ type: 'address', value: `0xAA${String(i).padStart(2, '0')}` }],
    },
    block_timestamp: new Date(Date.now() - i * 3_600_000).toISOString(),
  }));
  g.fetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items, next_page_params: null }),
    });
  // poolTarget (5) is smaller than what one page actually contains (8) —
  // the function should still hand back everything it found in that page,
  // not truncate down to poolTarget (that would be sampling, which this
  // function deliberately no longer does itself).
  const pool = await rpcSelfIndexedAdapter(['0xFactory'], 5, 'https://blockscout.example');
  g.fetch = realFetch;
  g.Deno.env.set?.('BLOCKSCOUT_API_KEY', '');
  assert(pool.length === 8, `expected all 8 launch-shaped logs back, got ${pool.length}`);
  const addrs = new Set(pool.map((p) => p.tokenAddress.toLowerCase()));
  assert(addrs.size === 8, 'all 8 unique addresses present, none dropped');
});
