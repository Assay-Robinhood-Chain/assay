"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { computeBackfillSample } from "@/lib/scoring";
import {
  MIN_BACKFILL_FULL_THRESHOLD,
  MAX_BACKFILL_SAMPLE,
  BACKFILL_SAMPLE_RATIO,
} from "@/lib/constants";

const PRESETS = [12, 99, 100, 300, 500, 600, 167_000];

export default function BackfillCalculator() {
  const [total, setTotal] = useState(500);
  const sample = computeBackfillSample(total);
  const pct = total > 0 ? Math.round((sample / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-line bg-card p-5 sm:p-6">
      <label className="mb-1.5 block text-[12.5px] font-medium text-ink-soft" htmlFor="total-launches">
        Launchpad&rsquo;s total launches at onboarding
      </label>
      <input
        id="total-launches"
        type="number"
        min={0}
        value={total}
        onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))}
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink outline-none focus-visible:border-cobalt"
      />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setTotal(p)}
            className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-muted hover:border-faint"
          >
            {p.toLocaleString()}
          </button>
        ))}
      </div>

      <motion.div
        key={sample}
        initial={{ opacity: 0.4, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mt-5 grid grid-cols-2 gap-4 border-t border-line-soft pt-4"
      >
        <div>
          <div className="text-[11px] uppercase tracking-wide text-faint">Sample taken</div>
          <div className="font-mono text-2xl font-semibold text-cobalt">
            {sample.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-faint">Coverage</div>
          <div className="font-mono text-2xl font-semibold text-ink">{pct}%</div>
        </div>
      </motion.div>

      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        {total < MIN_BACKFILL_FULL_THRESHOLD ? (
          <>Below the {MIN_BACKFILL_FULL_THRESHOLD}-launch floor — every launch is sampled, no rule needed at this size.</>
        ) : (
          <>
            At or above the {MIN_BACKFILL_FULL_THRESHOLD}-launch floor: take{" "}
            {BACKFILL_SAMPLE_RATIO * 100}% of total, capped at{" "}
            {MAX_BACKFILL_SAMPLE.toLocaleString()}, most-recent-first.
          </>
        )}
      </p>
    </div>
  );
}
