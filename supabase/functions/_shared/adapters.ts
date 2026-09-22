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
  baseUrl = "https://api.dexscreener.com"
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

/** Blockscout — public API v2, no key required for the base tier.
 * Docs: https://docs.blockscout.com/devs/apis/rest */
export async function blockscoutAdapter(
  contractAddress: string,
  baseUrl: string
): Promise<BlockscoutInfo> {
  try {
    const res = await fetch(`${baseUrl}/api/v2/addresses/${contractAddress}`);
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
 * NOTE: the exact endpoint depends on how a launchpad's factory
 * exposes creation count — this is a starting point, not a fixed
 * contract. Confirm against the live Blockscout instance for
 * Robinhood Chain before relying on it. */
export async function countUpstreamLaunchesViaBlockscout(
  factoryAddress: string,
  baseUrl: string
): Promise<number | null> {
  try {
    const res = await fetch(
      `${baseUrl}/api/v2/addresses/${factoryAddress}/counters`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // `transactions_count` on the factory is a rough proxy for
    // "how many times has this factory been called" — spot-check
    // against a manual count before trusting it for a flagship
    // launchpad, per third-party-indexer-integration.md section 4.
    return data?.transactions_count != null
      ? Number(data.transactions_count)
      : null;
  } catch {
    return null;
  }
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
  sample: number
): Promise<{ tokenAddress: string; launchDate: string }[]> {
  const apiKey = Deno.env.get("BITQUERY_API_KEY");
  if (!apiKey) {
    console.warn("BITQUERY_API_KEY not set — skipping Bitquery discovery.");
    return [];
  }
  // Placeholder — replace with the real GraphQL query + endpoint
  // (https://streaming.bitquery.io/graphql) once the exact schema
  // for Robinhood Chain factory events is confirmed.
  console.warn(
    `bitqueryAdapter is a stub — would discover up to ${sample} launches for factories: ${factoryAddresses.join(", ")}`
  );
  return [];
}
