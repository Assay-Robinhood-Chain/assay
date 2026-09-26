import { Launchpad, DimensionScores, Launch, ScoreHistoryPoint } from './types';
import {
  DIMENSION_WEIGHTS,
  MIN_SAMPLE_SIZE_FOR_CONFIDENCE,
  PROVISIONAL_STAR_CAP,
  SCORE_DISCLAIMER,
  TARGET_CHAIN,
} from './constants';
import { starsFromScore } from './scoring';

// This file stands in for GET /launchpads + GET /launchpads/:slug in the
// real system. Every launchpad below is built the same way the Scorer
// would: dimensions -> weighted composite -> clamped -> star thresholds
// -> confidence gate. The dashboard and the (not-yet-built) paid report
// would both read from this same shape, per section 1 of the brief.

const DAY_MS = 24 * 3600 * 1000;

function finalScoreFrom(dimensions: DimensionScores): number {
  const raw = (Object.keys(dimensions) as (keyof DimensionScores)[]).reduce(
    (sum, k) => sum + (dimensions[k] ?? 0) * DIMENSION_WEIGHTS[k],
    0,
  );
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

function buildScore(
  launchpadId: string,
  dimensions: DimensionScores,
  sampleSize: number,
  scoreDate: string,
) {
  const finalScore = finalScoreFrom(dimensions);
  const isProvisional = sampleSize < MIN_SAMPLE_SIZE_FOR_CONFIDENCE;
  const rawStars = starsFromScore(finalScore);
  const stars = isProvisional
    ? (Math.min(rawStars, PROVISIONAL_STAR_CAP) as 0 | 1)
    : rawStars;

  return {
    launchpadId,
    chain: TARGET_CHAIN,
    scoreDate,
    algorithmVersion: 'v1.3',
    finalScore,
    stars,
    isProvisional,
    sampleSize,
    dimensions,
    disclaimer: SCORE_DISCLAIMER,
  };
}

function history(base: number, days = 30, seed = 1): ScoreHistoryPoint[] {
  const points: ScoreHistoryPoint[] = [];
  let v = base - 6;
  for (let i = days; i >= 0; i -= 3) {
    const noise = Math.sin((i + seed * 7) / 4) * 3 + (seed % 3);
    v = Math.max(0, Math.min(100, base - i * 0.15 + noise));
    const d = new Date();
    d.setDate(d.getDate() - i);
    points.push({ date: d.toISOString(), finalScore: Math.round(v * 10) / 10 });
  }
  return points;
}

function launches(
  n: number,
  seed: number,
  rugRate: number,
  gradRate: number,
): Launch[] {
  const out: Launch[] = [];
  for (let i = 0; i < n; i++) {
    const r = ((i * 9301 + seed * 49297) % 233280) / 233280;
    const isConfirmedRugpull = r < rugRate;
    const isGraduated = !isConfirmedRugpull && r > 1 - gradRate;
    const d = new Date();
    d.setDate(d.getDate() - i * 2 - (seed % 5));
    out.push({
      tokenAddress: `0x${(seed * 1000 + i).toString(16).padStart(6, '0')}${'a'.repeat(34)}`,
      name: `${['Nova', 'Cinder', 'Vertex', 'Drift', 'Halcyon', 'Quill', 'Ember', 'Pallas'][i % 8]} ${i}`,
      symbol: `TK${seed}${i}`,
      launchDate: d.toISOString(),
      isGraduated,
      isConfirmedRugpull,
      peakMultiple: isConfirmedRugpull
        ? null
        : Math.round((1 + r * 18) * 100) / 100,
      liquidityUsd: isConfirmedRugpull ? null : Math.round(2000 + r * 480000),
      volume24hUsd: Math.round(500 + r * 900000),
      washTradingFlag: r > 0.85,
      excludedFromSample: false,
      metricsFetchedAt: d.toISOString(),
      isContractVerified: r > 0.15,
      peakCheckedAt: d.toISOString(),
    });
  }
  return out;
}

// The Robinhood Chain launchpad roster (Pons, StonkBrokers, Pools.trade,
// RobinPad, NOXA Fun, Flap, hood.fun, Openfair) — matching the Developer
// Brief, the third-party-indexer-integration.md discovery-source table,
// and the assay-web.html reference mockup's LAUNCHPADS_DATA. Discovery
// source follows section 2 of that doc: Bitquery documents Pons and
// Pools.trade; everything else (including the small long-tail names it
// calls out by name) falls back to RPC self-indexing.
const raw: Omit<Launchpad, 'score' | 'scoreHistory'>[] = [
  {
    id: 'lp_pons',
    slug: 'pons',
    discoverySource: 'bitquery',
    discoverySourceUrl: 'https://docs.bitquery.io',
    name: 'Pons',
    description:
      'Flagship autonomous bonding curve engine on Robinhood Chain. Featuring permanent LP locks and programmatic DEX graduation safeguards.',
    chain: TARGET_CHAIN,
    deployerAddresses: ['0x94f9...18fa'],
    websiteUrl: 'https://pons.fun',
    totalLaunchesUpstream: null,
    sampleSize: 1420,
    onboardedAt: '2026-06-01T00:00:00Z',
    lastSnapshotAt: '2026-09-21T00:00:00Z',
    lastResampleAt: new Date(Date.now() - 1.5 * DAY_MS).toISOString(),
    launches: launches(30, 1, 0, 0.41),
    badges: [
      {
        id: 'b_pons_1',
        name: 'LP Lock Verified',
        description: 'Liquidity locked permanently via automated factory hook.',
        awardedAt: '2026-08-10T00:00:00Z',
      },
      {
        id: 'b_pons_2',
        name: 'Verified Contracts',
        description: '100% of tracked launches use verified factory source.',
        awardedAt: '2026-08-01T00:00:00Z',
      },
    ],
  },
  {
    id: 'lp_stonkbrokers',
    slug: 'stonkbrokers',
    discoverySource: 'rpc_self_indexed',
    name: 'StonkBrokers',
    description:
      'Instant liquidity pool protocol for community tokens with embedded protections against wash-trading manipulation.',
    chain: TARGET_CHAIN,
    deployerAddresses: ['0x33b1...72ee'],
    totalLaunchesUpstream: null,
    sampleSize: 320,
    onboardedAt: '2026-06-15T00:00:00Z',
    lastSnapshotAt: new Date(Date.now() - 1.2 * 3600 * 1000).toISOString(),
    lastResampleAt: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    launches: launches(26, 2, 0, 0.385),
    badges: [
      {
        id: 'b_sb_1',
        name: 'Verified Contracts',
        description: '100% of tracked launches use verified source.',
        awardedAt: '2026-08-05T00:00:00Z',
      },
    ],
  },
  {
    id: 'lp_pools_trade',
    slug: 'pools-trade',
    discoverySource: 'bitquery',
    discoverySourceUrl: 'https://docs.bitquery.io',
    name: 'Pools.trade',
    description:
      'Exponential curve token deployer featuring automated DEX migration and anti-sniper tax protection.',
    chain: TARGET_CHAIN,
    deployerAddresses: ['0x88ea...09cd'],
    totalLaunchesUpstream: null,
    sampleSize: 96,
    onboardedAt: '2026-07-01T00:00:00Z',
    lastSnapshotAt: new Date(Date.now() - 2.4 * 3600 * 1000).toISOString(),
    lastResampleAt: null, // onboarded, but sample-resample hasn't run for it yet
    launches: launches(20, 3, 0, 0.333),
    badges: [
      {
        id: 'b_pt_1',
        name: 'LP Lock Verified',
        description: 'Multi-sig LP custody confirmed on-chain.',
        awardedAt: '2026-07-20T00:00:00Z',
      },
    ],
  },
  {
    id: 'lp_robinpad',
    slug: 'robinpad',
    discoverySource: 'rpc_self_indexed',
    name: 'RobinPad',
    description:
      'Decentralized community launchpad platform featuring liquidity fee revenue-sharing for early holders.',
    chain: TARGET_CHAIN,
    deployerAddresses: ['0x12fa...44aa'],
    totalLaunchesUpstream: null,
    sampleSize: 145,
    onboardedAt: '2026-06-20T00:00:00Z',
    lastSnapshotAt: new Date(Date.now() - 3.1 * 3600 * 1000).toISOString(),
    lastResampleAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    launches: launches(22, 4, 0.02, 0.29),
    badges: [
      {
        id: 'b_rp_1',
        name: 'LP Lock Verified',
        description: 'Liquidity locked via UniCrypt, confirmed on-chain.',
        awardedAt: '2026-07-10T00:00:00Z',
      },
    ],
  },
  {
    id: 'lp_noxa_fun',
    slug: 'noxa-fun',
    discoverySource: 'rpc_self_indexed',
    name: 'NOXA Fun',
    description:
      'High-frequency meme token deployer incorporating gamified buyback and burn mechanics.',
    chain: TARGET_CHAIN,
    deployerAddresses: ['0x55aa...33bb'],
    totalLaunchesUpstream: null,
    sampleSize: 610,
    onboardedAt: '2026-06-05T00:00:00Z',
    lastSnapshotAt: new Date(Date.now() - 0.6 * 3600 * 1000).toISOString(),
    lastResampleAt: new Date(Date.now() - 1.3 * DAY_MS).toISOString(),
    launches: launches(24, 5, 0.15, 0.19),
    badges: [],
  },
  {
    id: 'lp_flap',
    slug: 'flap',
    discoverySource: 'rpc_self_indexed',
    name: 'Flap',
    description:
      'Micro-token deployer with linear bonding curve mechanics for experimental community projects.',
    chain: TARGET_CHAIN,
    deployerAddresses: ['0x77bb...99cc'],
    totalLaunchesUpstream: null,
    sampleSize: 58,
    onboardedAt: '2026-08-01T00:00:00Z',
    lastSnapshotAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    lastResampleAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
    launches: launches(18, 6, 0, 0.224),
    badges: [],
  },
  {
    id: 'lp_hood_fun',
    slug: 'hood-fun',
    discoverySource: 'rpc_self_indexed',
    name: 'hood.fun',
    description:
      'Newly deployed experimental launchpad on Robinhood Chain. Currently held under provisional telemetry status.',
    chain: TARGET_CHAIN,
    deployerAddresses: ['0x99dd...22ee'],
    totalLaunchesUpstream: null,
    sampleSize: 12,
    onboardedAt: '2026-09-10T00:00:00Z',
    lastSnapshotAt: new Date(Date.now() - 0.3 * 3600 * 1000).toISOString(),
    lastResampleAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    launches: launches(12, 7, 0.05, 0.1),
    badges: [],
  },
  {
    id: 'lp_openfair',
    slug: 'openfair',
    discoverySource: 'rpc_self_indexed',
    name: 'Openfair',
    description:
      'Fair launch auction protocol recently deployed. Has not yet satisfied minimum empirical sample thresholds.',
    chain: TARGET_CHAIN,
    deployerAddresses: ['0x44ee...88ff'],
    totalLaunchesUpstream: null,
    sampleSize: 4,
    onboardedAt: '2026-09-18T00:00:00Z',
    lastSnapshotAt: new Date(Date.now() - 0.1 * 3600 * 1000).toISOString(),
    lastResampleAt: null, // just onboarded — first resample hasn't run yet
    launches: launches(4, 8, 0, 0.1),
    badges: [],
  },
];

// Dimension scores mirror the mockup's quality/mechanism/marketHealth/value
// figures exactly; consistency (not surfaced in the compact scanner card,
// but part of the real 5-dimension model in constants.ts) is set so each
// launchpad's weighted finalScore lands on the mockup's published score.
const dimensionsBySlug: Record<string, DimensionScores> = {
  pons: {
    quality: 90,
    mechanism: 85,
    marketHealth: 80,
    value: 78,
    consistency: 86,
  },
  stonkbrokers: {
    quality: 82,
    mechanism: 78,
    marketHealth: 74,
    value: 72,
    consistency: 71,
  },
  'pools-trade': {
    quality: 75,
    mechanism: 72,
    marketHealth: 70,
    value: 68,
    consistency: 68,
  },
  robinpad: {
    quality: 70,
    mechanism: 68,
    marketHealth: 64,
    value: 65,
    consistency: 64,
  },
  'noxa-fun': {
    quality: 55,
    mechanism: 54,
    marketHealth: 50,
    value: 49,
    consistency: 50,
  },
  flap: {
    quality: 46,
    mechanism: 45,
    marketHealth: 42,
    value: 43,
    consistency: 42,
  },
  'hood-fun': {
    quality: 30,
    mechanism: 28,
    marketHealth: 26,
    value: 28,
    consistency: 26,
  },
  openfair: {
    quality: 24,
    mechanism: 22,
    marketHealth: 20,
    value: 22,
    consistency: 20,
  },
};

const seedBySlug: Record<string, number> = {
  pons: 1,
  stonkbrokers: 2,
  'pools-trade': 3,
  robinpad: 4,
  'noxa-fun': 5,
  flap: 6,
  'hood-fun': 7,
  openfair: 8,
};

export const launchpads: Launchpad[] = raw.map((lp) => {
  const dims = dimensionsBySlug[lp.slug];
  const score = buildScore(
    lp.id,
    dims,
    lp.sampleSize,
    new Date().toISOString().slice(0, 10),
  );
  return {
    ...lp,
    score,
    scoreHistory: history(score.finalScore, 30, seedBySlug[lp.slug]),
  };
});

export function getLaunchpads(): Launchpad[] {
  return [...launchpads].sort(
    (a, b) => b.score.finalScore - a.score.finalScore,
  );
}

export function getLaunchpadBySlug(slug: string): Launchpad | undefined {
  return launchpads.find((lp) => lp.slug === slug);
}

export function getLaunchBySlugAndAddress(
  slug: string,
  tokenAddress: string,
): Launch | undefined {
  const lp = getLaunchpadBySlug(slug);
  return lp?.launches.find((l) => l.tokenAddress === tokenAddress);
}
