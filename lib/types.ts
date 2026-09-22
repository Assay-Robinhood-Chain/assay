export type DimensionKey =
  | "quality"
  | "mechanism"
  | "marketHealth"
  | "value"
  | "consistency";

export type DimensionScores = Record<DimensionKey, number>; // 0–100 each

export interface LaunchpadBadge {
  id: string;
  name: string;
  description: string;
  awardedAt: string; // ISO 8601
}

export interface LaunchpadScore {
  launchpadId: string;
  chain: typeof import("./constants").TARGET_CHAIN;
  scoreDate: string; // ISO 8601 date
  algorithmVersion: string; // e.g. "v1.3"
  finalScore: number; // 0–100, clamped
  stars: 0 | 1 | 2 | 3;
  isProvisional: boolean;
  sampleSize: number;
  dimensions: DimensionScores;
  disclaimer: string;
}

export interface Launch {
  tokenAddress: string;
  name: string;
  symbol: string;
  launchDate: string; // ISO 8601
  isGraduated: boolean;
  isConfirmedRugpull: boolean;
  peakMultiple: number | null; // null renders as em-dash, never 0
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  washTradingFlag: boolean;
}

export interface ScoreHistoryPoint {
  date: string; // ISO 8601 date
  finalScore: number;
}

// Where launch *discovery* comes from for this launchpad — see
// third-party-indexer-integration.md. This only changes how new token
// launches are found, never how their market metrics are measured
// (that's always Dexscreener + Blockscout, regardless of this field).
export type DiscoverySource = "bitquery" | "mobula" | "rpc_self_indexed";

export interface Launchpad {
  id: string;
  slug: string;
  name: string;
  description: string;
  chain: typeof import("./constants").TARGET_CHAIN;
  deployerAddresses: string[];
  websiteUrl?: string;
  discoverySource: DiscoverySource;
  discoverySourceUrl?: string; // traceability link into DOCUMENTED_LAUNCHPAD_REGISTRY
  // Backfill sampling policy fields (see backfill-sampling-policy.md, section 6
  // of the brief): both numbers are always surfaced together so a partial
  // sample never silently presents itself as the whole population.
  totalLaunchesUpstream: number | null; // null = source can't report a total
  sampleSize: number;
  onboardedAt: string; // ISO 8601 — when the one-time backfill ran
  lastSnapshotAt: string; // ISO 8601 — for the stale-data check
  score: LaunchpadScore;
  scoreHistory: ScoreHistoryPoint[];
  launches: Launch[];
  badges: LaunchpadBadge[];
}
