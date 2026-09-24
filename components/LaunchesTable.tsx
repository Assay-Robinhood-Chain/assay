'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Launch } from '@/lib/types';
import {
  formatDate,
  formatMultiple,
  formatUsd,
  shortAddress,
} from '@/lib/scoring';

type SortKey = 'launchDate' | 'peakMultiple' | 'liquidityUsd' | 'volume24hUsd';

export default function LaunchesTable({
  launches,
  launchpadSlug,
}: {
  launches: Launch[];
  launchpadSlug: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('launchDate');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const rows = useMemo(() => {
    const dir = sortDir;
    return [...launches].sort((a, b) => {
      switch (sortKey) {
        case 'peakMultiple':
          return dir * ((a.peakMultiple ?? -1) - (b.peakMultiple ?? -1));
        case 'liquidityUsd':
          return dir * ((a.liquidityUsd ?? -1) - (b.liquidityUsd ?? -1));
        case 'volume24hUsd':
          return dir * ((a.volume24hUsd ?? -1) - (b.volume24hUsd ?? -1));
        default:
          return (
            dir *
            (new Date(a.launchDate).getTime() -
              new Date(b.launchDate).getTime())
          );
      }
    });
  }, [launches, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  const th = (key: SortKey, label: string) => (
    <th className="px-4 py-2.5 text-left">
      <button
        onClick={() => toggleSort(key)}
        className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-faint hover:text-ink"
      >
        {label}
        {sortKey === key && (
          <span className="text-cobalt">{sortDir === -1 ? '↓' : '↑'}</span>
        )}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-panel">
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-faint">
              Token
            </th>
            {th('launchDate', 'Launched')}
            <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-faint">
              Status
            </th>
            {th('peakMultiple', 'Peak multiple')}
            {th('liquidityUsd', 'Liquidity')}
            {th('volume24hUsd', '24h volume')}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr
              key={l.tokenAddress}
              role="link"
              tabIndex={0}
              onClick={() =>
                router.push(`/launchpad/${launchpadSlug}/${l.tokenAddress}`)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter')
                  router.push(`/launchpad/${launchpadSlug}/${l.tokenAddress}`);
              }}
              className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-panel/50 focus-visible:bg-panel/50"
            >
              <td className="px-4 py-2.5">
                <div className="font-medium text-ink">
                  {l.name || (
                    <span className="font-mono">
                      {shortAddress(l.tokenAddress)}
                    </span>
                  )}
                </div>
                {l.symbol && (
                  <div className="font-mono text-[11px] text-faint">
                    {l.symbol}
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5 text-ink-soft">
                {formatDate(l.launchDate)}
              </td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {l.isConfirmedRugpull && (
                    <Flag tone="down">Confirmed rug</Flag>
                  )}
                  {l.isGraduated && !l.isConfirmedRugpull && (
                    <Flag tone="up">Graduated</Flag>
                  )}
                  {!l.isGraduated && !l.isConfirmedRugpull && (
                    <Flag tone="muted">Active</Flag>
                  )}
                  {l.washTradingFlag && (
                    <Flag tone="gold">Wash-trading flag</Flag>
                  )}
                </div>
              </td>
              <td className="px-4 py-2.5 font-mono text-ink-soft">
                {formatMultiple(l.peakMultiple)}
              </td>
              <td className="px-4 py-2.5 font-mono text-ink-soft">
                {formatUsd(l.liquidityUsd)}
              </td>
              <td className="px-4 py-2.5 font-mono text-ink-soft">
                {formatUsd(l.volume24hUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Flag({
  tone,
  children,
}: {
  tone: 'up' | 'down' | 'gold' | 'muted';
  children: React.ReactNode;
}) {
  const cls = {
    up: 'bg-up-soft text-up',
    down: 'bg-down-soft text-down',
    gold: 'bg-gold-soft text-gold',
    muted: 'bg-line-soft text-muted',
  }[tone];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}
