import { createServerSupabaseClient, isSupabaseConfigured } from './server';
import { shortAddress, formatUsd } from '@/lib/scoring';
import {
  getLaunchpads as getMockLaunchpads,
  getLaunchpadBySlug as getMockLaunchpadBySlug,
  getLaunchBySlugAndAddress as getMockLaunchBySlugAndAddress,
} from '@/lib/data';
import {
  Launchpad,
  LaunchpadScore,
  Launch,
  LaunchpadBadge,
  ScoreHistoryPoint,
  DimensionScores,
} from '@/lib/types';

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
  logo_url: string | null;
  discovery_source: Launchpad['discoverySource'];
  discovery_source_url: string | null;
  total_launches_upstream: number | null;
  sample_size: number;
  onboarded_at: string;
  last_snapshot_at: string | null;
  last_resample_at: string | null;
}

interface ScoreRow {
  score_date: string;
  algorithm_version: string;
  final_score: number;
  stars: 0 | 1 | 2 | 3;
  is_provisional: boolean;
  sample_size: number;
  quality: number | null;
  mechanism: number | null;
  market_health: number | null;
  value: number | null;
  consistency: number | null;
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
  excluded_from_sample: boolean;
  metrics_fetched_at: string | null;
  is_contract_verified: boolean | null;
  peak_checked_at: string | null;
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
      chain: 'Robinhood Chain',
      scoreDate: new Date().toISOString().slice(0, 10),
      algorithmVersion: '—',
      finalScore: 0,
      stars: 0,
      isProvisional: true,
      sampleSize: 0,
      dimensions: {
        quality: null,
        mechanism: null,
        marketHealth: null,
        value: null,
        consistency: null,
      },
      disclaimer: '',
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
    chain: 'Robinhood Chain',
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
    excludedFromSample: row.excluded_from_sample,
    metricsFetchedAt: row.metrics_fetched_at,
    isContractVerified: row.is_contract_verified,
    peakCheckedAt: row.peak_checked_at,
  };
}

function mapBadge(row: BadgeRow): LaunchpadBadge {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    awardedAt: row.awarded_at,
  };
}

function mapLaunchpad(
  row: LaunchpadRow,
  score: LaunchpadScore,
  launches: Launch[],
  badges: LaunchpadBadge[],
  scoreHistory: ScoreHistoryPoint[],
): Launchpad {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    chain: 'Robinhood Chain',
    deployerAddresses: row.deployer_addresses,
    websiteUrl: row.website_url ?? undefined,
    logoUrl: row.logo_url ?? null,
    discoverySource: row.discovery_source,
    discoverySourceUrl: row.discovery_source_url ?? undefined,
    totalLaunchesUpstream: row.total_launches_upstream,
    sampleSize: row.sample_size,
    onboardedAt: row.onboarded_at,
    lastSnapshotAt: row.last_snapshot_at ?? row.onboarded_at,
    lastResampleAt: row.last_resample_at ?? null,
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
    .from('launchpads')
    .select('*')
    .order('name');

  if (error || !launchpads) {
    console.error(
      'getLaunchpads() failed, falling back to mock data:',
      error?.message,
    );
    return getMockLaunchpads();
  }

  const results: Launchpad[] = [];
  for (const row of launchpads as LaunchpadRow[]) {
    const { data: scoreRow } = await supabase
      .from('launchpad_scores')
      .select('*')
      .eq('launchpad_id', row.id)
      .order('score_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    results.push(
      mapLaunchpad(
        row,
        mapScore(row.id, scoreRow as ScoreRow | null),
        [],
        [],
        [],
      ),
    );
  }

  return results.sort((a, b) => b.score.finalScore - a.score.finalScore);
}

/** Every launch of one launchpad, newest first. PostgREST caps a single
 * request at 1000 rows and truncates silently, so this pages through with
 * .range() — a launchpad with a larger sample would otherwise show only its
 * newest 1000 launches next to a sample count that says more. */
// deno-lint-ignore no-explicit-any
async function fetchAllLaunchRows(supabase: any, launchpadId: string) {
  const PAGE = 1000;
  // deno-lint-ignore no-explicit-any
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('launches')
      .select('*')
      .eq('launchpad_id', launchpadId)
      .order('launch_date', { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) return { data: rows.length > 0 ? rows : null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: rows, error: null };
}

/** Detail view: full launchpad, including launches, badges, and
 * 30-day score history — used by app/launchpad/[slug]/page.tsx. */
export async function getLaunchpadBySlug(
  slug: string,
): Promise<Launchpad | undefined> {
  if (!isSupabaseConfigured()) return getMockLaunchpadBySlug(slug);

  const supabase = await createServerSupabaseClient();
  const { data: row, error } = await supabase
    .from('launchpads')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !row) {
    console.error(
      `getLaunchpadBySlug(${slug}) failed, falling back to mock data:`,
      error?.message,
    );
    return getMockLaunchpadBySlug(slug);
  }

  const [
    { data: scoreRow },
    { data: historyRows },
    { data: launchRows },
    { data: badgeRows },
  ] = await Promise.all([
    supabase
      .from('launchpad_scores')
      .select('*')
      .eq('launchpad_id', row.id)
      .order('score_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Newest 90 days, then flipped to chronological below. (Ordering
    // ascending + limit would return the OLDEST 90 and freeze the chart
    // after three months.)
    supabase
      .from('launchpad_scores')
      .select('score_date, final_score')
      .eq('launchpad_id', row.id)
      .order('score_date', { ascending: false })
      .limit(90),
    fetchAllLaunchRows(supabase, row.id),
    supabase.from('launchpad_badges').select('*').eq('launchpad_id', row.id),
  ]);

  const scoreHistory: ScoreHistoryPoint[] = (historyRows ?? [])
    .slice()
    .reverse()
    .map((r) => ({
      date: r.score_date,
      finalScore: r.final_score,
    }));

  return mapLaunchpad(
    row as LaunchpadRow,
    mapScore(row.id, scoreRow as ScoreRow | null),
    (launchRows ?? []).map(mapLaunch),
    (badgeRows ?? []).map(mapBadge),
    scoreHistory,
  );
}

/** Token detail view: one launch, by its launchpad slug + address —
 * used by app/launchpad/[slug]/[tokenAddress]/page.tsx. Reuses
 * getLaunchpadBySlug() rather than querying `launches` directly, so
 * the mock-data fallback and error handling stay in one place. */
export async function getLaunchBySlugAndAddress(
  slug: string,
  tokenAddress: string,
): Promise<Launch | undefined> {
  if (!isSupabaseConfigured())
    return getMockLaunchBySlugAndAddress(slug, tokenAddress);

  const lp = await getLaunchpadBySlug(slug);
  return lp?.launches.find((l) => l.tokenAddress === tokenAddress);
}

export interface CronJobStatus {
  jobName: string;
  schedule: string;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunStatus: string | null;
}

interface CronJobStatusRow {
  jobname: string;
  schedule: string;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_run_status: string | null;
}

/** Real pg_cron status for the ingestion-rotation and scoring-sweep jobs
 * (used by app/coverage/page.tsx), read through the
 * public.get_cron_status() SECURITY DEFINER function — see
 * supabase/migrations/0015_cron_status.sql. The `cron` schema itself is
 * never queried directly from the app (PostgREST doesn't expose it, and
 * anon has no grants there either way).
 *
 * Returns [] — never mock/fabricated data — when Supabase isn't
 * configured or the RPC fails, so the Coverage page can fall back to a
 * schedule-only display rather than inventing a "last run" time. */
export async function getCronStatus(): Promise<CronJobStatus[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('get_cron_status');

  if (error || !data) {
    console.error('getCronStatus() failed:', error?.message);
    return [];
  }

  return (data as CronJobStatusRow[]).map((row) => ({
    jobName: row.jobname,
    schedule: row.schedule,
    lastRunStartedAt: row.last_run_started_at,
    lastRunFinishedAt: row.last_run_finished_at,
    lastRunStatus: row.last_run_status,
  }));
}

export type ActivityEventType = 'discovery' | 'metrics_sync' | 'score_sweep';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string;
  launchpadName: string;
  launchpadSlug: string;
  detail: string;
}

/** Real recent-activity feed for the Coverage page's "Live feed" panel —
 * this replaces what used to be a client-side `Math.random()` simulation.
 * There's no discrete event-log table (see supabase/migrations/*.sql: no
 * `ingestion_events` or similar), so this reconstructs activity from the
 * timestamped rows that already exist: newly-inserted launches
 * ("discovery"), newly-inserted metric snapshots ("metrics_sync"), and
 * newly-computed scores ("score_sweep") — merged and sorted by their real
 * timestamp. No "+NNms" latency or [VERIFY] step is shown because nothing
 * in the schema records those; fabricating them was exactly the problem
 * with the old version.
 *
 * Returns [] — never mock data — when Supabase isn't configured or a
 * query fails, matching getCronStatus(). */
export async function getRecentActivity(limit = 40): Promise<ActivityEvent[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createServerSupabaseClient();
  const perStream = Math.max(limit, 15);

  const [lpRes, launchRes, snapshotRes, scoreRes] = await Promise.all([
    supabase.from('launchpads').select('id, slug, name'),
    supabase
      .from('launches')
      .select('id, launchpad_id, token_address, name, symbol, created_at')
      .order('created_at', { ascending: false })
      .limit(perStream),
    supabase
      .from('launch_metrics_snapshot')
      .select(
        'launch_id, snapshot_at, liquidity_usd, volume_24h_usd, data_source',
      )
      .order('snapshot_at', { ascending: false })
      .limit(perStream),
    supabase
      .from('launchpad_scores')
      .select('launchpad_id, created_at, algorithm_version, final_score')
      .order('created_at', { ascending: false })
      .limit(perStream),
  ]);

  if (lpRes.error || !lpRes.data) {
    console.error('getRecentActivity() failed:', lpRes.error?.message);
    return [];
  }

  const lpById = new Map(
    lpRes.data.map((lp) => [
      lp.id as string,
      lp as { slug: string; name: string },
    ]),
  );

  interface LaunchRow {
    id: string;
    launchpad_id: string;
    token_address: string;
    name: string;
    symbol: string;
    created_at: string;
  }
  const launchById = new Map<string, LaunchRow>(
    !launchRes.error && launchRes.data
      ? (launchRes.data as LaunchRow[]).map((l) => [l.id, l])
      : [],
  );

  const events: ActivityEvent[] = [];

  if (!launchRes.error && launchRes.data) {
    for (const l of launchRes.data as LaunchRow[]) {
      const lp = lpById.get(l.launchpad_id);
      if (!lp) continue;
      events.push({
        id: `discovery-${l.id}`,
        type: 'discovery',
        timestamp: l.created_at,
        launchpadName: lp.name,
        launchpadSlug: lp.slug,
        detail: `New launch decoded${l.symbol ? ` · ${l.symbol}` : ''} · ${shortAddress(l.token_address)}`,
      });
    }
  }

  if (!snapshotRes.error && snapshotRes.data) {
    interface SnapshotRow {
      launch_id: string;
      snapshot_at: string;
      liquidity_usd: number | null;
      volume_24h_usd: number | null;
      data_source: string;
    }
    for (const s of snapshotRes.data as SnapshotRow[]) {
      const l = launchById.get(s.launch_id);
      const lp = l && lpById.get(l.launchpad_id);
      if (!l || !lp) continue;
      const amount = s.liquidity_usd ?? s.volume_24h_usd;
      events.push({
        id: `snapshot-${l.id}-${s.snapshot_at}`,
        type: 'metrics_sync',
        timestamp: s.snapshot_at,
        launchpadName: lp.name,
        launchpadSlug: lp.slug,
        detail: `Liquidity/volume snapshot updated${
          amount != null ? ` · ${formatUsd(amount)}` : ''
        } · via ${s.data_source}`,
      });
    }
  }

  if (!scoreRes.error && scoreRes.data) {
    interface ScoreRowActivity {
      launchpad_id: string;
      created_at: string;
      algorithm_version: string;
      final_score: number;
    }
    for (const s of scoreRes.data as ScoreRowActivity[]) {
      const lp = lpById.get(s.launchpad_id);
      if (!lp) continue;
      events.push({
        id: `score-${s.launchpad_id}-${s.created_at}`,
        type: 'score_sweep',
        timestamp: s.created_at,
        launchpadName: lp.name,
        launchpadSlug: lp.slug,
        detail: `Composite recomputed · ${s.final_score.toFixed(1)} · algorithm_version ${s.algorithm_version}`,
      });
    }
  }

  return events
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, limit);
}
