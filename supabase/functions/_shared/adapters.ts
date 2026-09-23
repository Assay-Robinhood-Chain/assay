// supabase/functions/_shared/adapters.ts
//
// One function per source, matching the Collectors layer in the main
// brief (section 4). Each adapter's only job is to fetch + normalise —
// it never writes to the database itself.

export interface DexscreenerMetrics {
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
}

/** Dexscreener — public API, no key required.
 * Docs: https://docs.dexscreener.com/api/reference */
export async function dexscreenerAdapter(
  tokenAddress: string,
  baseUrl = 'https://api.dexscreener.com',
): Promise<DexscreenerMetrics> {
  const res = await fetch(`${baseUrl}/latest/dex/tokens/${tokenAddress}`);
  if (!res.ok) {
    return { priceUsd: null, liquidityUsd: null, volume24hUsd: null };
  }
  const data = await res.json();
  const pair = data?.pairs?.[0];
  if (!pair) return { priceUsd: null, liquidityUsd: null, volume24hUsd: null };

  return {
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    volume24hUsd: pair.volume?.h24 ?? null,
  };
}

export interface BlockscoutInfo {
  isVerified: boolean | null;
  txCount: number | null;
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
    const res = await fetch(url);
    if (!res.ok) return { isVerified: null, txCount: null };
    const data = await res.json();
    return {
      isVerified: data?.is_verified ?? null,
      txCount: data?.tx_count != null ? Number(data.tx_count) : null,
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
 * a clear warning rather than an empty-but-silent result. */
export async function rpcSelfIndexedAdapter(
  factoryAddresses: string[],
  sample: number,
  baseUrl: string,
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
  const results: { tokenAddress: string; launchDate: string }[] = [];
  const seenEventNames = new Set<string>();

  try {
    let query = '';
    let pages = 0;
    // Blockscout paginates; stop once we have `sample` results or run
    // out of pages (capped so one weird factory can't loop forever).
    while (results.length < sample && pages < 10) {
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

      for (const item of items as Record<string, any>[]) {
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

        results.push({
          tokenAddress: String(addressParam.value),
          launchDate: launchDate.toISOString(),
        });
      }

      const nextPageParams = data?.next_page_params;
      if (!nextPageParams) break;
      query = '&' + new URLSearchParams(nextPageParams).toString();
      pages += 1;
    }
  } catch (err) {
    console.error(
      `rpcSelfIndexedAdapter: fetch threw for ${factoryAddress} — ${err instanceof Error ? err.message : String(err)}`,
    );
    // Fall through and return whatever we already collected rather
    // than throwing away partial results.
  }

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

  // Most recent first, matching fetchRecentLaunches' ORDER BY
  // launch_date DESC contract — don't rely on Blockscout's own order.
  results.sort((a, b) => (a.launchDate < b.launchDate ? 1 : -1));
  return results.slice(0, sample);
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
  sample: number,
): Promise<{ tokenAddress: string; launchDate: string }[]> {
  const apiKey = Deno.env.get('BITQUERY_API_KEY');
  if (!apiKey) {
    console.warn('BITQUERY_API_KEY not set — skipping Bitquery discovery.');
    return [];
  }
  // Placeholder — replace with the real GraphQL query + endpoint
  // (https://streaming.bitquery.io/graphql) once the exact schema
  // for Robinhood Chain factory events is confirmed.
  console.warn(
    `bitqueryAdapter is a stub — would discover up to ${sample} launches for factories: ${factoryAddresses.join(', ')}`,
  );
  return [];
}
