// Run with:  deno test --allow-env supabase/functions/_shared/enrichment.test.ts
// (mocks fetch and Supabase; makes no network calls)

import { enrichLaunchesBatch, enrichOneLaunch, type EnrichableLaunch } from './enrichment.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

// deno-lint-ignore no-explicit-any
const g = globalThis as any;
const realFetch = g.fetch;

const URLS = {
  dexscreenerBaseUrl: 'https://dex.test',
  blockscoutBaseUrl: 'https://bs.test',
  mobulaBaseUrl: 'https://mobula.test/api/2',
  concurrency: 4,
};

type Json = Record<string, unknown>;
const ok = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve('') });

interface Mocks {
  dex?: (addr: string) => Json;
  details?: (addr: string) => Json | null;
  ohlcv?: (addr: string) => Json;
}

function install(m: Mocks) {
  const calls: string[] = [];
  const ohlcvBodies: { address: string }[][] = [];
  g.Deno.env.set('BLOCKSCOUT_API_KEY', 'bk');
  g.Deno.env.set('MOBULA_API_KEY', 'mk');
  g.fetch = (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (url.includes('/latest/dex/tokens/')) {
      const addr = url.split('/').pop()!;
      return ok((m.dex ?? (() => ({ pairs: null })))(addr));
    }
    if (url.includes('/api/v2/addresses/')) {
      return ok({ is_verified: true, token: { name: 'BS Name', symbol: 'BSN' } });
    }
    if (url.endsWith('/token/details')) {
      const body = JSON.parse(String(init?.body)) as { address: string }[];
      const payload = body
        .map((b) => (m.details ?? (() => null))(b.address.toLowerCase()))
        .filter((x) => x !== null);
      return ok({ payload });
    }
    if (url.endsWith('/token/ohlcv-history')) {
      const body = JSON.parse(String(init?.body)) as { address: string }[];
      ohlcvBodies.push(body);
      return ok({ data: body.map((b) => (m.ohlcv ?? ((a: string) => ({ address: a, ohlcv: [] })))(b.address)) });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  };
  return { calls, ohlcvBodies };
}

function fakeSupabase() {
  const updates: Json[] = [];
  const snapshots: Json[] = [];
  const client = {
    from(table: string) {
      if (table === 'launch_metrics_snapshot') {
        return { insert: (p: Json) => { snapshots.push(p); return Promise.resolve({ error: null }); } };
      }
      return { update: (p: Json) => ({ eq: () => { updates.push(p); return Promise.resolve({ error: null }); } }) };
    },
  };
  return { client, updates, snapshots };
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const launch = (over: Partial<EnrichableLaunch> = {}): EnrichableLaunch => ({
  id: 'L1', token_address: '0xAAA1', launchpad_id: 'LP', launch_date: hoursAgo(5), ...over,
});

Deno.test('Blockscout is skipped once verification + name are known', async () => {
  const net = install({});
  const db = fakeSupabase();
  await enrichOneLaunch(db.client, launch({ name: 'Known', symbol: 'KN', is_contract_verified: true }), URLS);
  g.fetch = realFetch;
  assert(!net.calls.some((c) => c.includes('/api/v2/addresses/')), 'no Blockscout call');
  assert(!('name' in db.updates[0]) && !('is_contract_verified' in db.updates[0]), 'static fields untouched');
});

Deno.test('Blockscout is asked while name or verification is unknown; names never overwritten', async () => {
  let net = install({});
  let db = fakeSupabase();
  await enrichOneLaunch(db.client, launch({ name: '', is_contract_verified: null }), URLS);
  assert(net.calls.some((c) => c.includes('/api/v2/addresses/')), 'Blockscout called');
  assert(db.updates[0].name === 'BS Name' && db.updates[0].symbol === 'BSN', 'name/symbol filled');
  assert(db.updates[0].is_contract_verified === true, 'verification stored');

  net = install({});
  db = fakeSupabase();
  await enrichOneLaunch(db.client, launch({ name: 'Existing', symbol: 'EX', is_contract_verified: null }), URLS);
  g.fetch = realFetch;
  assert(!('name' in db.updates[0]) && !('symbol' in db.updates[0]), 'existing name/symbol not overwritten');
  assert(db.updates[0].is_contract_verified === true, 'but verification still filled');
});

Deno.test('Mobula fills liquidity/volume/graduation when Dexscreener has no pool', async () => {
  install({ details: (a) => ({ address: a, liquidityUSD: 500, volume24hUSD: 40, priceUSD: 0.1, bonded: true }) });
  const db = fakeSupabase();
  await enrichLaunchesBatch(db.client, [launch()], URLS);
  g.fetch = realFetch;
  assert(db.updates[0].liquidity_usd === 500 && db.updates[0].volume_24h_usd === 40, 'Mobula liquidity + volume');
  assert(db.updates[0].is_graduated === true, 'bonded => graduated');
  assert(db.snapshots[0].data_source === 'mobula', 'snapshot labelled mobula');
});

Deno.test('Dexscreener wins when it has a pool', async () => {
  install({
    dex: () => ({ pairs: [{ priceUsd: '2', liquidity: { usd: 9000 }, volume: { h24: 70 } }] }),
    details: (a) => ({ address: a, liquidityUSD: 500, volume24hUSD: 40 }),
  });
  const db = fakeSupabase();
  await enrichLaunchesBatch(db.client, [launch()], URLS);
  g.fetch = realFetch;
  assert(db.updates[0].liquidity_usd === 9000 && db.updates[0].volume_24h_usd === 70, 'DEX numbers');
  assert(db.snapshots[0].data_source === 'dexscreener', 'snapshot labelled dexscreener');
});

Deno.test('peak is only requested for launches that are due', async () => {
  const net = install({
    ohlcv: (a) => ({ address: a, ohlcv: [{ t: 1, o: 1, h: 3 }] }),
    details: (a) => ({ address: a }),
  });
  const db = fakeSupabase();
  const launches = [
    launch({ id: 'A', token_address: '0xA001', peak_attempted_at: null }), // never asked => due
    launch({ id: 'B', token_address: '0xB001', launch_date: hoursAgo(50), peak_attempted_at: hoursAgo(1) }), // asked 1h ago => not due
    launch({ id: 'C', token_address: '0xC001', launch_date: hoursAgo(72), peak_attempted_at: hoursAgo(30) }), // young, 30h => due
  ];
  const r = await enrichLaunchesBatch(db.client, launches, URLS);
  g.fetch = realFetch;
  const asked = net.ohlcvBodies.flat().map((b) => b.address).sort();
  assert(JSON.stringify(asked) === JSON.stringify(['0xA001', '0xC001']), `only A and C asked, got ${asked}`);
  assert(net.ohlcvBodies.length === 1, 'one batched request, not one per token');
  assert(r.mobulaPeakRequested === 2 && r.mobulaPeakAnswered === 2, 'counters');
  const byId = Object.fromEntries(db.updates.map((u, i) => [launches[i].id, u]));
  assert(byId.A.peak_multiple === 3 && typeof byId.A.peak_attempted_at === 'string', 'A gets peak + attempted');
  assert(!('peak_multiple' in byId.B) && !('peak_attempted_at' in byId.B), 'B untouched');
});

Deno.test('peak evidence: no candles + Mobula knows the token => checked; unknown token => not checked', async () => {
  install({
    ohlcv: (a) => ({ address: a, ohlcv: [], error: 'No pool found for this token' }),
    details: (a) => (a === '0xd001' ? { address: a, name: 'Known to Mobula' } : null),
  });
  const db = fakeSupabase();
  const launches = [
    launch({ id: 'D', token_address: '0xD001' }), // Mobula has a details record
    launch({ id: 'E', token_address: '0xE001' }), // Mobula knows nothing
  ];
  await enrichLaunchesBatch(db.client, launches, URLS);
  g.fetch = realFetch;
  const [d, e] = db.updates;
  assert(!('peak_multiple' in d) && typeof d.peak_checked_at === 'string', 'D: evidence, never traded');
  assert(!('peak_checked_at' in e) && typeof e.peak_attempted_at === 'string', 'E: asked, but no evidence');
});

Deno.test('a Mobula outage never blocks the Dexscreener write', async () => {
  install({ dex: () => ({ pairs: [{ priceUsd: '1', liquidity: { usd: 4000 }, volume: { h24: 5 } }] }) });
  g.fetch = ((orig) => (url: string, init?: RequestInit) =>
    url.includes('mobula.test')
      ? Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('slow down'), json: () => Promise.resolve({}) })
      : orig(url, init))(g.fetch);
  const db = fakeSupabase();
  const r = await enrichLaunchesBatch(db.client, [launch()], URLS);
  g.fetch = realFetch;
  assert(r.enriched === 1 && r.failed === 0, 'launch still enriched');
  assert(db.updates[0].liquidity_usd === 4000 && typeof db.updates[0].metrics_fetched_at === 'string', 'DEX data written');
  assert(!('peak_attempted_at' in db.updates[0]), 'peak left for a retry');
  assert(/429/.test(r.mobulaDetailsError ?? '') && /429/.test(r.mobulaPeakError ?? ''), 'errors surfaced');
});
