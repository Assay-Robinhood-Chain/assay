import { Launchpad } from "./types";
import { MIN_SAMPLE_SIZE_FOR_CONFIDENCE } from "./constants";

export type ConfidenceFloor = "high" | "med" | "low";

/** Rough, display-only confidence banding for the coverage table — NOT
 * the scoring engine's confidence gate (that's binary: is_provisional).
 * This is a coarser, three-way read on how much a reader should trust
 * the sample size alone, independent of what the score came out to. */
export function confidenceFloor(sampleSize: number): ConfidenceFloor {
  if (sampleSize >= MIN_SAMPLE_SIZE_FOR_CONFIDENCE * 5) return "high";
  if (sampleSize >= MIN_SAMPLE_SIZE_FOR_CONFIDENCE) return "med";
  return "low";
}

export interface Collector {
  name: string;
  provides: string;
  status: "online" | "degraded" | "offline";
  role: "discovery" | "metrics" | "verification" | "fallback";
}

// Mirrors main brief section 6 + third-party-indexer-integration.md.
export const COLLECTORS: Collector[] = [
  {
    name: "Dexscreener",
    provides: "Price, 24h volume, liquidity",
    status: "online",
    role: "metrics",
  },
  {
    name: "Blockscout",
    provides: "Contract verification, holder distribution, transfers",
    status: "online",
    role: "verification",
  },
  {
    name: "Bitquery",
    provides: "Documented factory addresses, decoded launch events, live trades",
    status: "online",
    role: "discovery",
  },
  {
    name: "Mobula",
    provides: "Contract addresses, ABI reference, bonding/graduation logic (docs)",
    status: "online",
    role: "discovery",
  },
  {
    name: "Chain RPC watcher",
    provides: "Self-indexed deploy/graduation events — the fallback with no third party in the loop",
    status: "online",
    role: "fallback",
  },
];

export interface CoverageRow {
  launchpad: Launchpad;
  confidenceFloor: ConfidenceFloor;
}

export function buildCoverageRows(launchpads: Launchpad[]): CoverageRow[] {
  return launchpads
    .map((lp) => ({ launchpad: lp, confidenceFloor: confidenceFloor(lp.sampleSize) }))
    .sort((a, b) => b.launchpad.sampleSize - a.launchpad.sampleSize);
}
