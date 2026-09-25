'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { computeBackfillSample } from '@/lib/scoring';
import {
  MIN_BACKFILL_FULL_THRESHOLD,
  BACKFILL_SAMPLE_RATIO,
  BACKFILL_SAMPLE_CAP,
} from '@/lib/constants';

const PRESETS = [12, 99, 100, 500, 4_999, 5_000, 167_000];

export default function BackfillCalculator() {
  const [total, setTotal] = useState<number | ''>(500);
  const numericTotal = total === '' ? 0 : total;
  const sample = computeBackfillSample(numericTotal);
  const pct = numericTotal > 0 ? Math.round((sample / numericTotal) * 100) : 0;

  return (
    <div className="rounded-xl border border-[#302f2a] bg-[#1b1b18] p-5 sm:p-6">
      <label
        className="mb-1.5 block text-[12.5px] font-medium text-[#b5b2a6]"
        htmlFor="total-launches"
      >
        Launchpad&rsquo;s total launches at onboarding
      </label>
      <input
        id="total-launches"
        type="number"
        min={0}
        value={total}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            setTotal('');
            return;
          }
          const n = Number(raw);
          setTotal(Number.isNaN(n) ? '' : Math.max(0, n));
        }}
        style={{ outline: 'none' }}
        className="w-full rounded-lg border border-[#302f2a] bg-[#141413] px-3 py-2 font-mono text-sm text-[#f3f1ea] [appearance:textfield] focus:border-[#7a9cff] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0"
      />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setTotal(p)}
            className="rounded-full border border-[#141413] bg-[#e8e402] px-2.5 py-1 font-mono text-[11px] font-bold text-[#141413] transition-colors hover:bg-[#d4d002]"
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
        className="mt-5 grid grid-cols-2 gap-4 border-t border-[#302f2a] pt-4"
      >
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[#6e6c63]">
            Sample taken
          </div>
          <div className="font-mono text-2xl font-semibold text-[#7a9cff]">
            {sample.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[#6e6c63]">
            Coverage
          </div>
          <div className="font-mono text-2xl font-semibold text-[#f3f1ea]">
            {pct}%
          </div>
        </div>
      </motion.div>

      <p className="mt-4 text-[12px] leading-relaxed text-[#6e6c63]">
        {numericTotal < MIN_BACKFILL_FULL_THRESHOLD ? (
          <>
            Below the {MIN_BACKFILL_FULL_THRESHOLD}-launch floor — every launch
            is sampled, no rule needed at this size.
          </>
        ) : (
          <>
            At or above the {MIN_BACKFILL_FULL_THRESHOLD}-launch floor: take{' '}
            {BACKFILL_SAMPLE_RATIO * 100}% of total, most-recent-first, capped
            at {BACKFILL_SAMPLE_CAP.toLocaleString()}
            {Math.ceil(numericTotal * BACKFILL_SAMPLE_RATIO) >
            BACKFILL_SAMPLE_CAP
              ? ` (20% would be ${Math.ceil(numericTotal * BACKFILL_SAMPLE_RATIO).toLocaleString()} — the cap applies here)`
              : ''}
            .
          </>
        )}
      </p>
    </div>
  );
}
