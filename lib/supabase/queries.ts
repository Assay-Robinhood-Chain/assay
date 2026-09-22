import { createServerSupabaseClient, isSupabaseConfigured } from "./server";
import { getLaunchpads as getMockLaunchpads, getLaunchpadBySlug as getMockLaunchpadBySlug } from "@/lib/data";
import { Launchpad, LaunchpadScore, Launch, LaunchpadBadge, ScoreHistoryPoint, DimensionScores } from "@/lib/types";

// ---------------------------------------------------------------
// Row shapes, snake_case as they come back from Postgres/PostgREST.
// ---------------------------------------------------------------
interface LaunchpadRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  chain: string;
  deployer_addresses: string[];
  website_url: string | null;
  discovery_source: Launchpad["discoverySource"];
  discovery_source_url: string | null;
  total_launches_upstream: number | null;
  sample_size: number;
  onboarded_at: string;
  last_snapshot_at: string | null;
}

interface ScoreRow {
  score_date: string;
  algorithm_version: string;
  final_score: number;
  stars: 0 | 1 | 2 | 3;
  is_provisional: boolean;
  sample_size: number;
  quality: number;
  mechanism: number;
  market_health: number;
  value: number;
  consistency: number;
  disclaimer: string;
}

interface LaunchRow {
  token_address: string;
  name: string;
  symbol: string;
  launch_date: string;
  is_graduated: boolean;
  is_confirmed_rugpull: boolean;
  peak_multiple: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  wash_trading_flag: boolean;
}

interface BadgeRow {
  id: string;
  name: string;
  description: string;
  awarded_at: string;
}

function mapScore(launchpadId: string, row: ScoreRow | null): LaunchpadScore {
  if (!row) {
    return {
      launchpadId,
      chain: "Robinhood Chain",
      scoreDate: new Date().toISOString().slice(0, 10),
      algorithmVersion: "—",
      finalScore: 0,
      stars: 0,
      isProvisional: true,
      sampleSize: 0,
      dimensions: { quality: 0, mechanism: 0, marketHealth: 0, value: 0, consistency: 0 },
      disclaimer: "",
    };
  }
  const dimensions: DimensionScores = {
    quality: row.quality,
    mechanism: row.mechanism,
    marketHealth: row.market_health,
    value: row.value,
    consistency: row.consistency,
  };
  return {
    launchpadId,
    chain: "Robinhood Chain",
    scoreDate: row.score_date,
    algorithmVersion: row.algorithm_version,
    finalScore: row.final_score,
    stars: row.stars,
    isProvisional: row.is_provisional,
    sampleSize: row.sample_size,
    dimensions,
    disclaimer: row.disclaimer,
  };
}

function mapLaunch(row: LaunchRow): Launch {
  return {
    tokenAddress: row.token_address,
    name: row.name,
    symbol: row.symbol,
    launchDate: row.launch_date,
    isGraduated: row.is_graduated,
    isConfirmedRugpull: row.is_confirmed_rugpull,
    peakMultiple: row.peak_multiple,
    liquidityUsd: row.liquidity_usd,
    volume24hUsd: row.volume_24h_usd,
    washTradingFlag: row.wash_trading_flag,
  };
}

function mapBadge(row: BadgeRow): LaunchpadBadge {
  return { id: row.id, name: row.name, description: row.description, awardedAt: row.awarded_at };
}

function mapLaunchpad(
  row: LaunchpadRow,
  score: LaunchpadScore,
  launches: Launch[],
  badges: LaunchpadBadge[],
  scoreHistory: ScoreHistoryPoint[]
): Launchpad {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    chain: "Robinhood Chain",
    deployerAddresses: row.deployer_addresses,
    websiteUrl: row.website_url ?? undefined,
    discoverySource: row.discovery_source,
    discoverySourceUrl: row.discovery_source_url ?? undefined,
    totalLaunchesUpstream: row.total_launches_upstream,
    sampleSize: row.sample_size,
    onboardedAt: row.onboarded_at,
    lastSnapshotAt: row.last_snapshot_at ?? row.onboarded_at,
    score,
    scoreHistory,
    launches,
    badges,
  };
}

// ---------------------------------------------------------------
// Public API — same signatures as lib/data.ts, so pages can switch
// from the mock dataset to Supabase by changing one import line.
// ---------------------------------------------------------------

/** List view: every launchpad + its latest score. Launches/badges/
 * history are left empty here on purpose (the directory table and
 * home-page previews never read them) to keep this one query cheap. */
export async function getLaunchpads(): Promise<Launchpad[]> {
  if (!isSupabaseConfigured()) return getMockLaunchpads();

  const supabase = await createServerSupabaseClient();
  const { data: launchpads, error } = await supabase
    .from("launchpads")
    .select("*")
    .order("name");

  if (error || !launchpads) {
    console.error("getLaunchpads() failed, falling back to mock data:", error?.message);
    return getMockLaunchpads();
  }

  const results: Launchpad[] = [];
  for (const row of launchpads as LaunchpadRow[]) {
    const { data: scoreRow } = await supabase
      .from("launchpad_scores")
      .select("*")
      .eq("launchpad_id", row.id)
      .order("score_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    results.push(mapLaunchpad(row, mapScore(row.id, scoreRow as ScoreRow | null), [], [], []));
  }

  return results.sort((a, b) => b.score.finalScore - a.score.finalScore);
}

/** Detail view: full launchpad, including launches, badges, and
 * 30-day score history — used by app/launchpad/[slug]/page.tsx. */
export async function getLaunchpadBySlug(slug: string): Promise<Launchpad | undefined> {
  if (!isSupabaseConfigured()) return getMockLaunchpadBySlug(slug);

  const supabase = await createServerSupabaseClient();
  const { data: row, error } = await supabase
    .from("launchpads")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !row) {
    console.error(`getLaunchpadBySlug(${slug}) failed, falling back to mock data:`, error?.message);
    return getMockLaunchpadBySlug(slug);
  }

  const [{ data: scoreRow }, { data: historyRows }, { data: launchRows }, { data: badgeRows }] =
    await Promise.all([
      supabase
        .from("launchpad_scores")
        .select("*")
        .eq("launchpad_id", row.id)
        .order("score_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("launchpad_scores")
        .select("score_date, final_score")
        .eq("launchpad_id", row.id)
        .order("score_date", { ascending: true })
        .limit(90),
      supabase
        .from("launches")
        .select("*")
        .eq("launchpad_id", row.id)
        .order("launch_date", { ascending: false }),
      supabase.from("launchpad_badges").select("*").eq("launchpad_id", row.id),
    ]);

  const scoreHistory: ScoreHistoryPoint[] = (historyRows ?? []).map((r) => ({
    date: r.score_date,
    finalScore: r.final_score,
  }));

  return mapLaunchpad(
    row as LaunchpadRow,
    mapScore(row.id, scoreRow as ScoreRow | null),
    (launchRows ?? []).map(mapLaunch),
    (badgeRows ?? []).map(mapBadge),
    scoreHistory
  );
}
