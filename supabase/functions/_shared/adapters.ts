// supabase/functions/_shared/adapters.ts
//
// One function per source, matching the Collectors layer in the main
// brief (section 4). Each adapter's only job is to fetch + normalise —
// it never writes to the database itself.

import { MIN_TOKEN_AGE_HOURS } from './constants.ts';

export interface DexscreenerMetrics {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  // Only set when a pair was found. Used as a fallback source for the
  // token's name/symbol when Blockscout has none.
  name?: string | null;
  symbol?: string | null;
}

/** Token names/symbols are chosen by whoever deployed the token, so treat
 * them as untrusted text: strings only, control characters stripped,
 * trimmed and length-capped. Returns null when nothing usable is left. */
export function cleanTokenText(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null;
  const cleaned = v
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLen);
  return cleaned === '' ? null : cleaned;
}

// Per-request timeout so one hung upstream call can't stall a whole run.
const FETCH_TIMEOUT_MS = 10_000;

/** Dexscreener — public API, no key required.
 * Docs: https://docs.dexscreener.com/api/reference */
export async function dexscreenerAdapter(
  tokenAddress: string,
  baseUrl = 'https://api.dexscreener.com',
): Promise<DexscreenerMetrics> {
  const res = await fetch(`${baseUrl}/latest/dex/tokens/${tokenAddress}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Rate limits and server errors are FAILURES, not "this token has no
    // market". Throw so the caller leaves the launch in the queue and
    // retries later — returning nulls here would be recorded as "checked,
    // nothing found" and permanently skew graduation / market-health data.
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`Dexscreener ${res.status} for ${tokenAddress}`);
    }
    // Any other 4xx: Dexscreener answered, there is simply no pair.
    return { priceUsd: null, liquidityUsd: null, volume24hUsd: null };
  }
  const data = await res.json();
  // A token can trade in several pools. Use the deepest one so price,
  // liquidity and volume all come from the same, most representative pair
  // (pairs[0] is not guaranteed to be the deepest).
  const pairs: Record<string, any>[] = Array.isArray(data?.pairs)
    ? data.pairs
    : [];
  const pair = pairs.reduce<Record<string, any> | null>(
    (best, p) =>
      best === null || (p?.liquidity?.usd ?? 0) > (best?.liquidity?.usd ?? 0)
        ? p
        : best,
    null,
  );
  if (!pair) return { priceUsd: null, liquidityUsd: null, volume24hUsd: null };

  return {
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
    name: cleanTokenText(pair.baseToken?.name, 64),
    symbol: cleanTokenText(pair.baseToken?.symbol, 32),
  };
}

export interface MobulaPeakMultiple {
  // peak (highest candle high) ÷ launch (first candle open) price, i.e.
  // the "peak-vs-launch multiple" the Value/Consistency dimensions in
  // scoring.ts have been waiting on peak_multiple to be populated with —
  // see the "no data source provides yet" comment there, now fixed.
  peakMultiple: number | null;
  launchPriceUsd: number | null;
  peakPriceUsd: number | null;
  // true when Mobula actually ANSWERED (candles, or an HTTP reply without
  // any). false when the call was skipped (no key / bad launch date). The
  // caller uses it to tell "Mobula has no price history for this token"
  // from "we never asked".
  answered: boolean;
}

/** Mobula chain id, "evm:<chainId>". MOBULA_CHAIN_ID wins; the fallback is
 * built from the Blockscout chain id. Whitespace and surrounding quotes are
 * stripped, because a `.env` line like `MOBULA_CHAIN_ID= "evm:4663"` (space,
 * quotes) can reach the function as a literal value with those characters. */
function mobulaChainId(): string {
  const raw = Deno.env.get('MOBULA_CHAIN_ID');
  const cleaned = raw ? raw.trim().replace(/^["']+|["']+$/g, '').trim() : '';
  return cleaned || `evm:${blockscoutChainId()}`;
}

function mobulaApiKey(): string | null {
  const raw = Deno.env.get('MOBULA_API_KEY');
  const cleaned = raw ? raw.trim().replace(/^["']+|["']+$/g, '').trim() : '';
  return cleaned || null;
}

const MOBULA_CANDLE_PERIOD = '1h';
// Statuses already warned about by this function instance (see mobulaAdapter).
const warnedMobulaStatuses = new Set<number>();
const MOBULA_MAX_CANDLES = 2000; // Mobula's own per-request cap

/** Mobula — OHLCV candle history, used to derive each launch's
 * peak-vs-launch multiple (Value/Consistency dimensions).
 * Docs: https://docs.mobula.io/rest-api-reference/endpoint/token-ohlcv-history
 *
 * Requires MOBULA_API_KEY (free tier at https://admin.mobula.io). Sent
 * as a bare `Authorization: <key>` header — NOT `Bearer <key>`, that
 * prefix is only for Mobula's separate short-lived-token flow.
 *
 * chainId: Mobula's docs give named chains ("ethereum", "base",
 * "solana") as examples; Robinhood Chain isn't one of the documented
 * examples, so this defaults to the same numeric chain id (4663) the
 * Blockscout PRO API uses and lets MOBULA_CHAIN_ID override it — verify
 * against a real Robinhood Chain token that this returns real candles
 * before trusting it for a flagship launchpad, same spot-check caveat
 * as the other adapters in this file.
 *
 * Missing key / no candle data are NOT failures (return nulls, same
 * "never fabricate" convention as the rest of this file) — only a
 * 429/5xx throws, so the caller can retry later rather than recording
 * "checked, no peak yet" permanently. */
export async function mobulaAdapter(
  tokenAddress: string,
  launchDateIso: string,
  baseUrl = 'https://api.mobula.io/api/2',
): Promise<MobulaPeakMultiple> {
  const NOT_ASKED = {
    peakMultiple: null,
    launchPriceUsd: null,
    peakPriceUsd: null,
    answered: false,
  };
  const NO_DATA = { ...NOT_ASKED, answered: true };
  const apiKey = mobulaApiKey();
  if (!apiKey) {
    console.warn(
      'mobulaAdapter: MOBULA_API_KEY not set — skipping peak multiple.',
    );
    return NOT_ASKED;
  }
  const fromMs = new Date(launchDateIso).getTime();
  if (Number.isNaN(fromMs)) return NOT_ASKED;

  const chainId = mobulaChainId();
  const params = new URLSearchParams({
    address: tokenAddress,
    chainId,
    period: MOBULA_CANDLE_PERIOD,
    from: String(fromMs),
    amount: String(MOBULA_MAX_CANDLES),
  });

  const res = await fetch(
    `${baseUrl}/token/ohlcv-history?${params.toString()}`,
    {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`Mobula ${res.status} for ${tokenAddress}`);
    }
    // A rejected key is a CONFIGURATION error. Returning "no data" here
    // would make it indistinguishable from "this token has no candles" —
    // every peak would just silently stay a dash — so fail loudly.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Mobula auth failed (${res.status}) — check MOBULA_API_KEY`,
      );
    }
    // Other 4xx (no pool, unknown token, or a wrong chainId): Mobula
    // answered without candles. Log each distinct status ONCE per function
    // instance with the response body, so a bad MOBULA_CHAIN_ID shows up
    // in the logs without one warning per token.
    if (!warnedMobulaStatuses.has(res.status)) {
      warnedMobulaStatuses.add(res.status);
      const body = await res.text().catch(() => '');
      console.warn(
        `mobulaAdapter: HTTP ${res.status} (chainId=${chainId}), treating as no data. First occurrence: ${tokenAddress} — ${body.slice(0, 200)}`,
      );
    }
    return NO_DATA;
  }

  const data = await res.json();
  const candles: Record<string, any>[] = Array.isArray(data?.data)
    ? data.data
    : [];
  return peakFromCandles(candles);
}

/** Candles -> peak-vs-launch multiple: highest candle high divided by the
 * first candle's open. `answered` is always true (Mobula replied). Pure —
 * exported for tests. */
export function peakFromCandles(
  candles: Record<string, any>[],
): MobulaPeakMultiple {
  const NO_DATA: MobulaPeakMultiple = {
    peakMultiple: null,
    launchPriceUsd: null,
    peakPriceUsd: null,
    answered: true,
  };
  if (candles.length === 0) return NO_DATA;

  const sorted = [...candles].sort((a, b) => (a?.t ?? 0) - (b?.t ?? 0));
  const launchPrice = Number(sorted[0]?.o ?? sorted[0]?.c ?? NaN);
  const peakPrice = sorted.reduce(
    (max, c) => Math.max(max, Number(c?.h ?? c?.c ?? 0)),
    0,
  );

  if (!Number.isFinite(launchPrice) || launchPrice <= 0 || peakPrice <= 0) {
    return {
      peakMultiple: null,
      launchPriceUsd: Number.isFinite(launchPrice) ? launchPrice : null,
      peakPriceUsd: peakPrice > 0 ? peakPrice : null,
      answered: true,
    };
  }

  return {
    peakMultiple: peakPrice / launchPrice,
    launchPriceUsd: launchPrice,
    peakPriceUsd: peakPrice,
    answered: true,
  };
}

export interface MobulaPeakBatchResult {
  /** Keyed by lower-cased token address. Absent = no answer yet (request
   * failed, or a per-token error other than "no pool"): leave it queued. */
  peaks: Map<string, MobulaPeakMultiple>;
  /** First request failure, if any. The adapter stops scheduling new
   * requests after it and returns what it already has. */
  error: string | null;
}

/** Batched variant of mobulaAdapter: POST /token/ohlcv-history takes up to
 * 10 tokens per request (10 credits) instead of one 5-credit GET per token,
 * so the same peak data costs about a fifth. Response shape per the docs:
 * { data: [ { ohlcv: [...], address, chainId, error? } ] } — a token with no
 * pool comes back with error "No pool found for this token" and an empty
 * ohlcv, which is a real answer ("no price history"), not a failure. */
export async function mobulaPeakMultiplesBatch(
  items: { tokenAddress: string; launchDate: string }[],
  baseUrl = 'https://api.mobula.io/api/2',
  batchSize = 10,
  concurrency = 4,
): Promise<MobulaPeakBatchResult> {
  const peaks = new Map<string, MobulaPeakMultiple>();
  const valid = items.filter((i) => !Number.isNaN(Date.parse(i.launchDate)));
  if (valid.length === 0) return { peaks, error: null };

  const apiKey = mobulaApiKey();
  if (!apiKey) {
    console.warn(
      'mobulaPeakMultiplesBatch: MOBULA_API_KEY not set — skipping peak multiple.',
    );
    return { peaks, error: null };
  }

  const chainId = mobulaChainId();
  const chunks: { tokenAddress: string; launchDate: string }[][] = [];
  for (let i = 0; i < valid.length; i += batchSize) {
    chunks.push(valid.slice(i, i + batchSize));
  }

  let error: string | null = null;
  let next = 0;
  async function worker() {
    while (error === null && next < chunks.length) {
      const chunk = chunks[next];
      next += 1;
      try {
        const res = await fetch(`${baseUrl}/token/ohlcv-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: apiKey! },
          body: JSON.stringify(
            chunk.map((it) => ({
              address: it.tokenAddress,
              chainId,
              period: MOBULA_CANDLE_PERIOD,
              from: Date.parse(it.launchDate),
              amount: MOBULA_MAX_CANDLES,
            })),
          ),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 3),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          error = `Mobula ohlcv-history ${res.status} (chainId=${chainId}): ${text.slice(0, 200)}`;
          return;
        }
        const json = await res.json();
        const entries: Record<string, any>[] = Array.isArray(json?.data)
          ? json.data
          : [];
        entries.forEach((entry, k) => {
          const address = String(
            entry?.address ?? chunk[k]?.tokenAddress ?? '',
          ).toLowerCase();
          if (!address) return;
          // "No pool found" is an answer; any other per-token error is
          // unknown — leave it out so it is retried.
          if (entry?.error && !/no pool/i.test(String(entry.error))) return;
          const candles: Record<string, any>[] = Array.isArray(entry?.ohlcv)
            ? entry.ohlcv
            : [];
          peaks.set(address, peakFromCandles(candles));
        });
      } catch (err) {
        error = `Mobula ohlcv-history request failed: ${err instanceof Error ? err.message : String(err)}`;
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, chunks.length)) }, worker),
  );
  return { peaks, error };
}

// ---------------------------------------------------------------------
// Mobula — token details (metadata + liquidity + volume + bonding status)
// Docs: https://docs.mobula.io/rest-api-reference/endpoint/token-details
//
// Dexscreener only sees DEX pools, so a token that is still on its
// launchpad's bonding curve has no liquidity, volume, or (often) name
// there. Mobula indexes bonding-curve tokens too and reports whether the
// curve has completed (`bonded`). Fetched in batches (POST) — one request
// per MOBULA_DETAILS_BATCH_SIZE tokens instead of one per token.
// ---------------------------------------------------------------------

export interface MobulaTokenDetails {
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  // true once the bonding curve has completed and the token migrated to a
  // regular DEX pool.
  bonded: boolean;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Maps one token/details record to what Assay uses. Pure — exported for
 * tests. Returns null for anything that is not an object with an address. */
export function parseMobulaTokenDetails(
  entry: Record<string, any> | null | undefined,
): { address: string; details: MobulaTokenDetails } | null {
  if (!entry || typeof entry !== 'object' || typeof entry.address !== 'string') {
    return null;
  }
  return {
    address: entry.address.toLowerCase(),
    details: {
      name: cleanTokenText(entry.name, 64),
      symbol: cleanTokenText(entry.symbol, 32),
      priceUsd: finiteOrNull(entry.priceUSD),
      liquidityUsd: finiteOrNull(entry.liquidityUSD),
      volume24hUsd: finiteOrNull(entry.volume24hUSD),
      bonded: entry.bonded === true,
    },
  };
}

export interface MobulaDetailsResult {
  /** Keyed by lower-cased token address. Absent = Mobula returned nothing
   * for that token (unknown to Mobula, or the request failed). */
  details: Map<string, MobulaTokenDetails>;
  /** First request failure, if any. The adapter stops scheduling new
   * requests after it and returns what it already has — details are
   * best-effort and must never block the Dexscreener/Blockscout write. */
  error: string | null;
}

export async function mobulaTokenDetailsBatch(
  tokenAddresses: string[],
  baseUrl = 'https://api.mobula.io/api/2',
  batchSize = 10,
  concurrency = 4,
): Promise<MobulaDetailsResult> {
  const details = new Map<string, MobulaTokenDetails>();
  const apiKey = mobulaApiKey();
  // Not configured is not an error here — mobulaAdapter already warns.
  if (!apiKey || tokenAddresses.length === 0) return { details, error: null };

  const blockchain = mobulaChainId();
  const chunks: string[][] = [];
  for (let i = 0; i < tokenAddresses.length; i += batchSize) {
    chunks.push(tokenAddresses.slice(i, i + batchSize));
  }

  let error: string | null = null;
  let next = 0;
  async function worker() {
    while (error === null && next < chunks.length) {
      const chunk = chunks[next];
      next += 1;
      try {
        const res = await fetch(`${baseUrl}/token/details`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: apiKey! },
          body: JSON.stringify(
            chunk.map((address) => ({ blockchain, address })),
          ),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS * 3),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          error = `Mobula token/details ${res.status} (blockchain=${blockchain}): ${text.slice(0, 200)}`;
          return;
        }
        const json = await res.json();
        // The batch response is documented as `payload`; the single-token
        // response as `data`. Accept either so a docs mismatch doesn't
        // silently drop everything.
        const entries: unknown[] = Array.isArray(json?.payload)
          ? json.payload
          : Array.isArray(json?.data)
            ? json.data
            : [];
        for (const entry of entries) {
          const parsed = parseMobulaTokenDetails(entry as Record<string, any>);
          if (parsed) details.set(parsed.address, parsed.details);
        }
      } catch (err) {
        error = `Mobula token/details request failed: ${err instanceof Error ? err.message : String(err)}`;
        return;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, chunks.length)) }, worker),
  );
  return { details, error };
}

export interface BlockscoutInfo {
  isVerified: boolean | null;
  txCount: number | null;
  // From the `token` object Blockscout attaches to a token contract's
  // address response. null/undefined = Blockscout has no token metadata.
  tokenName?: string | null;
  tokenSymbol?: string | null;
}

// Robinhood Chain's numeric chain ID, needed as a path segment on every
// Blockscout PRO API call. Override via BLOCKSCOUT_CHAIN_ID if this ever
// needs to point at a different chain (e.g. a testnet).
// See https://docs.blockscout.com/robinhood-api.
const DEFAULT_BLOCKSCOUT_CHAIN_ID = '4663';

function blockscoutChainId(): string {
  return Deno.env.get('BLOCKSCOUT_CHAIN_ID') ?? DEFAULT_BLOCKSCOUT_CHAIN_ID;
}

/** Blockscout — PRO API v2.
 *
 * IMPORTANT (confirmed against https://docs.blockscout.com/robinhood-api,
 * checked live): the old no-key per-instance endpoints this used to call
 * (`{instance}/api/v2/addresses/{addr}`) are deprecated in favor of the
 * PRO API, which requires BOTH a chain-id path segment AND an `apikey`
 * query param — even on Robinhood Chain's free tier. Get a free key at
 * https://dev.blockscout.com and set it as BLOCKSCOUT_API_KEY.
 * `baseUrl` must be the PRO API host (https://api.blockscout.com), NOT
 * the per-chain explorer URL (robinhoodchain.blockscout.com) — those are
 * two different hosts now. */
export async function blockscoutAdapter(
  contractAddress: string,
  baseUrl: string,
): Promise<BlockscoutInfo> {
  const apiKey = Deno.env.get('BLOCKSCOUT_API_KEY');
  if (!apiKey) {
    console.warn('BLOCKSCOUT_API_KEY not set — skipping Blockscout lookup.');
    return { isVerified: null, txCount: null };
  }
  try {
    const url = `${baseUrl}/${blockscoutChainId()}/api/v2/addresses/${contractAddress}?apikey=${apiKey}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { isVerified: null, txCount: null };
    const data = await res.json();
    return {
      isVerified: data?.is_verified ?? null,
      txCount: data?.tx_count != null ? Number(data.tx_count) : null,
      tokenName: cleanTokenText(data?.token?.name, 64),
      tokenSymbol: cleanTokenText(data?.token?.symbol, 32),
    };
  } catch {
    // Collector failures degrade gracefully — never throw and take
    // down the whole ingestion cycle for one bad address.
    return { isVerified: null, txCount: null };
  }
}

/** Blockscout — used at onboarding to size the backfill
 * (backfill-sampling-policy.md's countUpstreamLaunches()).
 * Same PRO API / apikey requirement as blockscoutAdapter() above —
 * see that function's doc comment for the deprecation details.
 * NOTE: `transactions_count` on the factory is still a rough proxy for
 * "how many times has this factory been called", not a confirmed exact
 * contract — spot-check against a manual count before trusting it for
 * a flagship launchpad, per third-party-indexer-integration.md section 4.
 *
 * Returns `{ total, reason }` instead of a bare `number | null` so the
 * CALLER (onboarding-backfill/index.ts) can put the real cause of a
 * null result into the 422 it sends back — which the admin UI already
 * displays verbatim in the onboarding notice banner
 * (describeOnboarding() in app/admin/moderation/page.tsx). Before this,
 * every failure mode (no factory address, no apikey, 401/403/404/429
 * from Blockscout, missing transactions_count) produced the exact same
 * generic banner text, which is why it kept looking like "the same
 * error" across genuinely different causes. */
export async function countUpstreamLaunchesViaBlockscout(
  factoryAddress: string,
  baseUrl: string,
): Promise<{ total: number | null; reason: string | null }> {
  const apiKey = Deno.env.get('BLOCKSCOUT_API_KEY');
  if (!apiKey) {
    const reason = 'BLOCKSCOUT_API_KEY is not set on the server.';
    console.warn(`countUpstreamLaunchesViaBlockscout: ${reason}`);
    return { total: null, reason };
  }

  const url = `${baseUrl}/${blockscoutChainId()}/api/v2/addresses/${factoryAddress}/counters?apikey=${apiKey}`;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url);

      // Blockscout's free/PRO-trial tier rate-limits aggressively during
      // repeated onboarding tests — retry a 429 with backoff instead of
      // failing the whole onboarding on what's usually a transient state.
      if (res.status === 429 && attempt < maxAttempts) {
        const waitMs = 800 * attempt;
        console.warn(
          `countUpstreamLaunchesViaBlockscout: 429 rate-limited (attempt ${attempt}/${maxAttempts}), retrying in ${waitMs}ms.`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        // Log status + body so a 401/403/404/429 shows up in the Edge
        // Function logs AND in the reason returned to the caller —
        // that's the whole reason countUpstreamLaunches() was opaque
        // to debug from the outside.
        const bodyText = await res.text().catch(() => '<no body>');
        const reason = `Blockscout returned ${res.status} for ${factoryAddress}${
          res.status === 404
            ? " — this address likely isn't a contract on this chain (wrong address, or wrong network)."
            : res.status === 401 || res.status === 403
              ? ' — BLOCKSCOUT_API_KEY looks invalid or lacks access.'
              : res.status === 429
                ? ' — still rate-limited after retries. Wait a bit and re-run.'
                : ` (${bodyText.slice(0, 200)}).`
        }`;
        console.error(
          `countUpstreamLaunchesViaBlockscout: ${res.status} from ${url.replace(apiKey, '***')} — ${bodyText}`,
        );
        return { total: null, reason };
      }

      const data = await res.json();
      if (data?.transactions_count == null) {
        const reason = `Blockscout returned 200 for ${factoryAddress} but no "transactions_count" field — response shape may have changed.`;
        console.warn(
          `countUpstreamLaunchesViaBlockscout: 200 OK but no transactions_count field. Raw response: ${JSON.stringify(data)}`,
        );
        return { total: null, reason };
      }
      return { total: Number(data.transactions_count), reason: null };
    } catch (err) {
      const reason = `Request to Blockscout threw: ${err instanceof Error ? err.message : String(err)}`;
      console.error(
        `countUpstreamLaunchesViaBlockscout: fetch threw for ${url.replace(apiKey, '***')} — ${err instanceof Error ? err.message : String(err)}`,
      );
      return { total: null, reason };
    }
  }

  return { total: null, reason: 'Still rate-limited (429) after all retries.' };
}

/** Fisher–Yates shuffle, in place, and returned for chaining. Used by
 * sampleWithMinimumAge so "random" actually means random, not
 * insertion-order-with-extra-steps. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Picks `sample` items at random from `pool` instead of "the newest
 * `sample`" — and guarantees at least `minOldFraction` of the result is
 * older than `minAgeHours`, when the pool has enough old items to cover
 * that.
 *
 * Why this exists: MIN_TOKEN_AGE_HOURS (constants.ts, currently 72h) gates
 * Quality/Value/Consistency scoring — only launches at least that old are
 * counted. A discovery adapter that always keeps "the most recent N"
 * launches (the old behaviour here, and still what fetchRecentLaunches'
 * ORDER BY launch_date DESC contract describes) can end up with a sample
 * that is almost entirely younger than the age gate, so those dimensions
 * stay "Not yet scored" for far longer than necessary even though older
 * launches exist upstream and were simply never sampled. Randomizing the
 * whole sample, with a floor on how much of it must already clear the age
 * gate, fixes both: no permanent bias toward "just launched" tokens, and
 * a working set of mature launches from day one. See
 * backfill-sampling-policy.md. */
export function sampleWithMinimumAge<T extends { launchDate: string }>(
  pool: T[],
  sample: number,
  opts: { minAgeHours?: number; minOldFraction?: number; now?: number } = {},
): T[] {
  const minAgeHours = opts.minAgeHours ?? MIN_TOKEN_AGE_HOURS;
  const minOldFraction = opts.minOldFraction ?? 0.1;
  const now = opts.now ?? Date.now();
  const cutoffMs = now - minAgeHours * 3_600_000;

  if (pool.length <= sample) {
    // Nothing to actually choose between — take everything, but still
    // shuffle it so nothing downstream can assume a most-recent-first (or
    // any other) order just because this path happened to return early.
    return shuffle([...pool]);
  }

  const old = pool.filter((p) => new Date(p.launchDate).getTime() <= cutoffMs);
  const recent = pool.filter(
    (p) => new Date(p.launchDate).getTime() > cutoffMs,
  );

  // Cap at old.length: if the upstream pool simply doesn't have enough
  // >72h-old launches yet (e.g. a brand-new launchpad), we take every old
  // one we've got rather than failing the whole backfill.
  const minOldCount = Math.min(old.length, Math.ceil(sample * minOldFraction));

  const shuffledOld = shuffle([...old]);
  const shuffledRecent = shuffle([...recent]);

  const chosenOld = shuffledOld.slice(0, minOldCount);
  // Everything not already chosen — old leftovers and recent alike — goes
  // into one pool and the rest of the sample is drawn from it at random,
  // so the >72h slice is a floor, not a ceiling: an all-old sample is just
  // as valid an outcome as one that's exactly 10% old.
  const remainingPool = shuffle([
    ...shuffledOld.slice(minOldCount),
    ...shuffledRecent,
  ]);
  const chosenRest = remainingPool.slice(
    0,
    Math.max(0, sample - chosenOld.length),
  );

  return shuffle([...chosenOld, ...chosenRest]);
}

/** RPC self-indexing — the "fully Assay-independent" path
 * (third-party-indexer-integration.md section 4), used for
 * `discovery_source: 'rpc_self_indexed'` (the default for every
 * newly-approved launchpad — see app/api/admin/moderation/route.ts).
 *
 * Deliberately does NOT hardcode one launch-event ABI/signature: the
 * event a factory emits when it deploys a new token differs per
 * launchpad, and guessing one would either throw away every log (safe
 * but useless) or — worse — decode the wrong parameter as a token
 * address and silently insert garbage into `launches`. Neither is
 * acceptable per this file's own "never fabricate, return null/[]
 * instead" convention (see countUpstreamLaunchesViaBlockscout above).
 *
 * Instead this reuses Blockscout's own ABI-aware `.../logs` endpoint
 * (same PRO API host/apikey/chain-id as the other Blockscout calls in
 * this file), which decodes each log against the contract's verified
 * ABI when one is on file. We then keep only logs whose decoded event
 * name looks launch-shaped (created/launched/deployed) AND that carry
 * an address-typed parameter — that parameter becomes the token
 * address, the log's block timestamp becomes launch_date. Anything
 * that doesn't decode, or decodes but doesn't match, is skipped.
 *
 * This is a heuristic, not a guarantee — same caveat as txCount above:
 * spot-check the event name that shows up in the "found N launch logs
 * via event ..." log line against the real launch mechanism before
 * trusting this for a flagship launchpad. Requires the factory to be
 * verified on Blockscout; unverified factories fall back to `[]` with
 * a clear warning rather than an empty-but-silent result.
 *
 * `poolTarget` is how many launch-shaped logs to try to gather, NOT how
 * many to return — this function does no sampling itself, it just pages
 * until it has ~`poolTarget` (or runs out of pages) and hands back
 * everything found, in whatever order Blockscout returned it (do not
 * assume newest-first). Two different callers ask for a pool for two
 * different reasons:
 *   - onboarding-backfill (first-time sample): asks for a pool a few
 *     times bigger than the sample it actually wants, then calls
 *     sampleWithMinimumAge(pool, sample) itself.
 *   - upstream-discovery (daily re-check for NEW launches on an
 *     already-onboarded launchpad): asks for a smaller recent-activity
 *     pool, diffs it against token_addresses already in `launches`, and
 *     inserts whatever is new — no sampling, since sample-resample is
 *     what later decides which known launches are in the active sample. */
export async function rpcSelfIndexedAdapter(
  factoryAddresses: string[],
  poolTarget: number,
  baseUrl: string,
  /** Optional cursor (ISO timestamp). When set, paging stops once a page
   * reaches logs older than this, and only launches at/after it are
   * returned. Assumes Blockscout returns logs newest-first, which is how
   * its /addresses/{addr}/logs endpoint is documented to behave. */
  sinceIso?: string,
): Promise<{ tokenAddress: string; launchDate: string }[]> {
  const apiKey = Deno.env.get('BLOCKSCOUT_API_KEY');
  if (!apiKey) {
    console.warn(
      'rpcSelfIndexedAdapter: BLOCKSCOUT_API_KEY not set — skipping.',
    );
    return [];
  }
  const factoryAddress = factoryAddresses?.[0];
  if (!factoryAddress) {
    console.warn('rpcSelfIndexedAdapter: no factory address — skipping.');
    return [];
  }

  // Widen this if your factory's real event is named something else —
  // the warning below prints the actual decoded event names seen so
  // you know what to add.
  const LAUNCH_NAME_RE = /(created|launch|deploy)/i;
  // Keyed by lower-cased token address: one launch can emit several
  // launch-shaped logs, and the same address must never be returned
  // twice (the upsert in onboarding-backfill rejects duplicates within
  // one chunk). If a token shows up more than once, keep the EARLIEST
  // date — that is when it actually launched.
  const byToken = new Map<
    string,
    { tokenAddress: string; launchDate: string }
  >();
  const seenEventNames = new Set<string>();

  try {
    let query = '';
    let pages = 0;
    const sinceMs = sinceIso ? new Date(sinceIso).getTime() : NaN;
    const hasSince = Number.isFinite(sinceMs);
    // Blockscout paginates (~50 logs per page). We page until we've
    // collected ~`poolTarget` results or run out of pages — it is the
    // caller's job to decide how big a pool it needs (see the doc
    // comment above); this function just fills it. The page cap scales
    // with the pool target (x2 margin, because not every log a factory
    // emits is a launch event) so this is never silently truncated by a
    // fixed page limit — it is still a cap, so one weird factory can't
    // loop forever.
    const LOGS_PER_PAGE_ESTIMATE = 50;
    const maxPages = Math.ceil(poolTarget / LOGS_PER_PAGE_ESTIMATE) * 2 + 5;
    while (byToken.size < poolTarget && pages < maxPages) {
      const url = `${baseUrl}/${blockscoutChainId()}/api/v2/addresses/${factoryAddress}/logs?apikey=${apiKey}${query}`;
      const res = await fetch(url);
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '<no body>');
        console.error(
          `rpcSelfIndexedAdapter: ${res.status} from ${url.replace(apiKey, '***')} — ${bodyText}`,
        );
        break;
      }
      const data = await res.json();
      const items: unknown[] = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) break;

      let reachedCursor = false;
      for (const item of items as Record<string, any>[]) {
        if (hasSince) {
          const ts = item?.block_timestamp ?? item?.timestamp ?? null;
          const ms = ts ? new Date(ts).getTime() : NaN;
          if (Number.isFinite(ms) && ms < sinceMs) {
            // Older than the cursor: nothing here is new.
            reachedCursor = true;
            continue;
          }
        }
        const decoded = item?.decoded;
        const eventName: string | undefined = decoded?.method_call;
        if (!eventName || !Array.isArray(decoded?.parameters)) continue;
        seenEventNames.add(eventName);
        if (!LAUNCH_NAME_RE.test(eventName)) continue;

        const addressParam = decoded.parameters.find(
          (p: Record<string, any>) =>
            typeof p?.type === 'string' && p.type.startsWith('address'),
        );
        const timestamp = item?.block_timestamp ?? item?.timestamp ?? null;
        if (!addressParam?.value || !timestamp) continue;

        const launchDate = new Date(timestamp);
        if (Number.isNaN(launchDate.getTime())) continue;

        const tokenAddress = String(addressParam.value);
        const key = tokenAddress.toLowerCase();
        const iso = launchDate.toISOString();
        const existing = byToken.get(key);
        if (!existing || iso < existing.launchDate) {
          byToken.set(key, { tokenAddress, launchDate: iso });
        }
      }

      if (reachedCursor) break;
      const nextPageParams = data?.next_page_params;
      if (!nextPageParams) break;
      query = '&' + new URLSearchParams(nextPageParams).toString();
      pages += 1;
    }
    if (hasSince && byToken.size >= poolTarget) {
      console.warn(
        `rpcSelfIndexedAdapter: hit poolTarget (${poolTarget}) before reaching the discovery cursor for ${factoryAddress} — some launches between the cursor and the oldest fetched log may be missed.`,
      );
    }
  } catch (err) {
    console.error(
      `rpcSelfIndexedAdapter: fetch threw for ${factoryAddress} — ${err instanceof Error ? err.message : String(err)}`,
    );
    // Fall through and return whatever we already collected rather
    // than throwing away partial results.
  }

  const results = [...byToken.values()];

  if (results.length === 0) {
    console.warn(
      `rpcSelfIndexedAdapter: 0 launch-shaped logs for ${factoryAddress}. ` +
        (seenEventNames.size > 0
          ? `Decoded event names actually seen: ${[...seenEventNames].join(', ')} — none matched /${LAUNCH_NAME_RE.source}/i. Widen LAUNCH_NAME_RE in adapters.ts if one of these is the real launch event.`
          : `No decoded events at all — the factory contract is likely NOT verified on Blockscout, or has emitted no logs yet.`),
    );
  } else {
    console.log(
      `rpcSelfIndexedAdapter: found ${results.length} launch log(s) for ${factoryAddress} via event name(s): ${[...seenEventNames].filter((n) => LAUNCH_NAME_RE.test(n)).join(', ')}`,
    );
  }

  // Raw pool — deliberately NOT sorted or sampled here. See the doc
  // comment above: what happens to this pool (random-sample it down with
  // sampleWithMinimumAge, or diff it against known token_addresses) is the
  // caller's decision, because onboarding-backfill and upstream-discovery
  // need different things from the same pool-gathering logic.
  return results;
}

/** Bitquery — documented factory discovery for flagship launchpads.
 * TODO: fill in the exact GraphQL query against
 * DOCUMENTED_LAUNCHPAD_REGISTRY's factory address once confirmed —
 * see third-party-indexer-integration.md section 2 for the fields
 * Bitquery is known to expose (decoded TokenLaunched events, etc).
 * Stubbed here so the calling code (onboarding-backfill) has a
 * stable interface to build against. */
export async function bitqueryAdapter(
  factoryAddresses: string[],
  poolTarget: number,
): Promise<{ tokenAddress: string; launchDate: string }[]> {
  const apiKey = Deno.env.get('BITQUERY_API_KEY');
  if (!apiKey) {
    console.warn('BITQUERY_API_KEY not set — skipping Bitquery discovery.');
    return [];
  }
  // Placeholder — replace with the real GraphQL query + endpoint
  // (https://streaming.bitquery.io/graphql) once the exact schema
  // for Robinhood Chain factory events is confirmed.
  //
  // Same contract as rpcSelfIndexedAdapter: return the raw pool of up to
  // ~`poolTarget` launches found (no sorting, no sampling) and let the
  // caller (onboarding-backfill or upstream-discovery) decide what to do
  // with it — do not sort-and-slice by launch_date DESC, that reintroduces
  // the "always the newest" bias.
  console.warn(
    `bitqueryAdapter is a stub — would discover up to ${poolTarget} launches for factories: ${factoryAddresses.join(', ')}`,
  );
  return [];
}
