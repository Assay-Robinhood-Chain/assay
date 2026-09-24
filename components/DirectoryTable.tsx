'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Launchpad } from '@/lib/types';
import { rampColor } from '@/lib/scoring';
import { TARGET_CHAIN, MOBILE_BREAKPOINT_PX } from '@/lib/constants';
import DirectorySkeleton from './DirectorySkeleton';

type SortKey = 'score' | 'quality' | 'marketHealth' | 'sample' | 'name';

const RAMP_BG: Record<string, string> = {
  green: 'bg-up',
  amber: 'bg-gold',
  red: 'bg-down',
};

export default function DirectoryTable({
  launchpads,
}: {
  launchpads: Launchpad[];
}) {
  const [loading, setLoading] = useState(true);
  const [minStars, setMinStars] = useState(0);
  const [includeProvisional, setIncludeProvisional] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  // Skeleton mirrors the real fetch: this data is already resolved
  // server-side, but the brief specifies a layout-matching skeleton
  // state distinct from a spinner, so we simulate the client hydration
  // beat honestly rather than skip it.
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(t);
  }, []);

  const rows = useMemo(() => {
    let list = launchpads.filter((lp) => lp.score.stars >= minStars);
    if (!includeProvisional)
      list = list.filter((lp) => !lp.score.isProvisional);

    // Client-side sort ONLY on already-fetched data — never triggers a
    // new request (brief, 11.2: avoid hammering /launchpads on click).
    const dir = sortDir;
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'quality':
          return (
            dir *
            ((a.score.dimensions.quality ?? -1) -
              (b.score.dimensions.quality ?? -1))
          );
        case 'marketHealth':
          return (
            dir *
            ((a.score.dimensions.marketHealth ?? -1) -
              (b.score.dimensions.marketHealth ?? -1))
          );
        case 'sample':
          return dir * (a.sampleSize - b.sampleSize);
        default:
          return dir * (a.score.finalScore - b.score.finalScore);
      }
    });
    return list;
  }, [launchpads, minStars, includeProvisional, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === -1 ? 1 : -1));
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const headerBtn = (key: SortKey, label: string) => (
    <button
      onClick={() => toggleSort(key)}
      className="flex items-center gap-1 text-left text-[11px] font-medium uppercase tracking-wide text-faint transition-colors hover:text-ink"
    >
      {label}
      {sortKey === key && (
        <span className="text-cobalt">{sortDir === -1 ? '↓' : '↑'}</span>
      )}
    </button>
  );

  return (
    <div>
      {/* Filter tabs — client-side only, no API round trip */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[0, 1, 2, 3].map((s) => (
          <button
            key={s}
            onClick={() => setMinStars(s)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[12.5px] transition-colors ${
              minStars === s
                ? 'border-cobalt bg-cobalt-soft text-cobalt'
                : 'border-line bg-card text-muted hover:border-faint'
            }`}
          >
            {s === 0 ? 'All' : `${'★'.repeat(s)}+`}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <button
          onClick={() => setIncludeProvisional((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
            includeProvisional
              ? 'border-line bg-card text-muted hover:border-faint'
              : 'border-cobalt bg-cobalt-soft text-cobalt'
          }`}
        >
          {includeProvisional
            ? 'Including provisional'
            : 'Excluding provisional'}
        </button>
        <span className="ml-auto rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[12.5px] text-faint">
          chain: {TARGET_CHAIN}
        </span>
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="skeleton" exit={{ opacity: 0 }}>
            <DirectorySkeleton />
          </motion.div>
        ) : (
          <motion.div
            key="table"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            {/* Desktop table — becomes cards below MOBILE_BREAKPOINT_PX */}
            <div
              className="hidden overflow-hidden rounded-xl border border-line bg-card md:block"
              style={{ ['--bp' as string]: `${MOBILE_BREAKPOINT_PX}px` }}
            >
              <div className="grid grid-cols-[2.4fr_0.9fr_1fr_1fr_0.8fr] gap-4 border-b border-line bg-panel px-5 py-2.5">
                {headerBtn('name', 'Launchpad')}
                {headerBtn('score', 'Score')}
                {headerBtn('quality', 'Quality')}
                {headerBtn('marketHealth', 'Market health')}
                {headerBtn('sample', 'Sample')}
              </div>
              {rows.map((lp, i) => (
                <motion.div
                  key={lp.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: Math.min(i * 0.03, 0.3),
                  }}
                >
                  <Link
                    href={`/launchpad/${lp.slug}`}
                    className="grid grid-cols-[2.4fr_0.9fr_1fr_1fr_0.8fr] items-center gap-4 border-b border-line-soft px-5 py-3.5 last:border-0 hover:bg-panel/60"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-card font-mono text-[11px] text-faint">
                        {lp.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-ink">
                            {lp.name}
                          </span>
                          {lp.score.isProvisional && (
                            <span className="rounded-full border border-dashed border-faint px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-faint">
                              Provisional
                            </span>
                          )}
                        </div>
                        <span className="truncate font-mono text-[11px] text-faint">
                          {lp.sampleSize.toLocaleString()} of{' '}
                          {lp.totalLaunchesUpstream?.toLocaleString() ?? '—'}{' '}
                          launches tracked
                        </span>
                      </div>
                    </div>

                    <div className="flex items-baseline gap-1.5">
                      <span
                        className={`font-mono text-sm font-semibold ${
                          rampColor(lp.score.finalScore) === 'green'
                            ? 'text-up'
                            : rampColor(lp.score.finalScore) === 'amber'
                              ? 'text-gold'
                              : 'text-down'
                        }`}
                      >
                        {lp.score.finalScore.toFixed(1)}
                      </span>
                      <span className="font-mono text-[11px] text-faint">
                        {'★'.repeat(lp.score.stars)}
                      </span>
                    </div>

                    <DimCell value={lp.score.dimensions.quality} />
                    <DimCell value={lp.score.dimensions.marketHealth} />

                    <span className="font-mono text-[12.5px] text-ink-soft">
                      {lp.sampleSize}
                    </span>
                  </Link>
                </motion.div>
              ))}
              {rows.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted">
                  No launchpads match this filter.
                </div>
              )}
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {rows.map((lp, i) => (
                <motion.div
                  key={lp.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.25,
                    delay: Math.min(i * 0.03, 0.3),
                  }}
                >
                  <Link
                    href={`/launchpad/${lp.slug}`}
                    className="block rounded-xl border border-line bg-card p-4 active:bg-panel/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-panel font-mono text-[11px] text-faint">
                          {lp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">
                            {lp.name}
                          </div>
                          <div className="font-mono text-[11px] text-faint">
                            sample {lp.sampleSize}
                            {lp.score.isProvisional ? ' · provisional' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div
                          className={`font-mono text-base font-semibold ${
                            rampColor(lp.score.finalScore) === 'green'
                              ? 'text-up'
                              : rampColor(lp.score.finalScore) === 'amber'
                                ? 'text-gold'
                                : 'text-down'
                          }`}
                        >
                          {lp.score.finalScore.toFixed(1)}
                        </div>
                        <div className="font-mono text-[11px] text-faint">
                          {'★'.repeat(lp.score.stars)}
                          {'☆'.repeat(3 - lp.score.stars)}
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
              {rows.length === 0 && (
                <div className="rounded-xl border border-line-soft bg-panel px-4 py-8 text-center text-sm text-muted">
                  No launchpads match this filter.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DimCell({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <div className="flex items-center gap-2" title="Not enough data yet">
        <div className="h-1.5 w-full rounded-full border border-dashed border-line-soft" />
        <span className="w-6 shrink-0 text-right font-mono text-[11px] text-faint">
          n/a
        </span>
      </div>
    );
  }
  const color = rampColor(value);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
        <div
          className={`h-full rounded-full ${RAMP_BG[color]}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right font-mono text-[11px] text-faint">
        {value.toFixed(0)}
      </span>
    </div>
  );
}
