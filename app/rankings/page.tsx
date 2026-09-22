import type { Metadata } from "next";
import DirectoryTable from "@/components/DirectoryTable";
import Reveal from "@/components/Reveal";
import { getLaunchpads } from "@/lib/data";
import { SCORE_DISCLAIMER, TARGET_CHAIN } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Rankings — Assay",
  description: `Every launchpad tracked on ${TARGET_CHAIN}, ranked by final score. Nothing gated, nothing sponsored.`,
};

export default function RankingsPage() {
  const launchpads = getLaunchpads();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Reveal>
        <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.14em] text-cobalt">
          Full directory
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Rankings</h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          Every launchpad Assay tracks on {TARGET_CHAIN}, sorted by final score. Filters run
          entirely client-side against data already fetched — nothing here triggers a new
          request.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mt-8">
        <DirectoryTable launchpads={launchpads} />
      </Reveal>

      <p className="mt-8 max-w-2xl text-[12px] leading-relaxed text-faint">{SCORE_DISCLAIMER}</p>
    </div>
  );
}
