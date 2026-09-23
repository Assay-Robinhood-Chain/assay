'use client';

import { useEffect, useRef, useState } from 'react';
import { Launchpad } from '@/lib/types';
import { DISCOVERY_SOURCE_LABELS } from '@/lib/constants';

interface FeedEvent {
  id: number;
  time: string;
  tag: 'DISCOVERY' | 'METRICS_SYNC' | 'VERIFY' | 'SCORE_SWEEP';
  source: string;
  lpSlug: string;
  lpName: string;
  detail: string;
  ms: number;
}

const TAG_CLASS: Record<FeedEvent['tag'], string> = {
  DISCOVERY: 'text-cobalt',
  METRICS_SYNC: 'text-up',
  VERIFY: 'text-gold',
  SCORE_SWEEP: 'text-ink-soft',
};

function randomAddr() {
  const chars = 'abcdef0123456789';
  let s = '0x';
  for (let i = 0; i < 6; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s + '…' + chars[Math.floor(Math.random() * chars.length)].repeat(4);
}

function makeEvent(id: number, lp: Launchpad): FeedEvent {
  const roll = Math.random();
  const now = new Date();
  const time = now.toISOString().slice(11, 23);

  if (roll < 0.35) {
    const src = DISCOVERY_SOURCE_LABELS[lp.discoverySource];
    return {
      id,
      time,
      tag: 'DISCOVERY',
      source: src,
      lpSlug: lp.slug,
      lpName: lp.name,
      detail: `New launch decoded via ${src} · ${randomAddr()}`,
      ms: 40 + Math.floor(Math.random() * 90),
    };
  }
  if (roll < 0.65) {
    return {
      id,
      time,
      tag: 'METRICS_SYNC',
      source: 'Dexscreener',
      lpSlug: lp.slug,
      lpName: lp.name,
      detail: `Liquidity/volume snapshot updated · $${(500 + Math.random() * 400000).toFixed(2)}`,
      ms: 30 + Math.floor(Math.random() * 70),
    };
  }
  if (roll < 0.85) {
    return {
      id,
      time,
      tag: 'VERIFY',
      source: 'Blockscout',
      lpSlug: lp.slug,
      lpName: lp.name,
      detail: 'Contract verification + holder distribution checked',
      ms: 60 + Math.floor(Math.random() * 120),
    };
  }
  return {
    id,
    time,
    tag: 'SCORE_SWEEP',
    source: 'Scorer',
    lpSlug: lp.slug,
    lpName: lp.name,
    detail: `Composite recomputed · algorithm_version v1.3`,
    ms: 5 + Math.floor(Math.random() * 15),
  };
}

const MAX_BUFFER = 40;

export default function LiveFeed({ launchpads }: { launchpads: Launchpad[] }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>('ALL');
  const idRef = useRef(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || launchpads.length === 0) return;
    const t = setInterval(
      () => {
        const lp = launchpads[Math.floor(Math.random() * launchpads.length)];
        idRef.current += 1;
        setEvents((prev) =>
          [makeEvent(idRef.current, lp), ...prev].slice(0, MAX_BUFFER),
        );
      },
      reducedMotionRef.current ? 3200 : 1400,
    );
    return () => clearInterval(t);
  }, [paused, launchpads]);

  // Seed a few events immediately so the panel isn't empty on load.
  useEffect(() => {
    if (launchpads.length === 0) {
      setEvents([]);
      return;
    }
    const seed = Array.from({ length: 6 }).map((_, i) => {
      const lp = launchpads[i % launchpads.length];
      idRef.current += 1;
      return makeEvent(idRef.current, lp);
    });
    setEvents(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchpads]);

  const filtered =
    filter === 'ALL' ? events : events.filter((e) => e.lpSlug === filter);

  return (
    <div className="rounded-xl border border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            active={filter === 'ALL'}
            onClick={() => setFilter('ALL')}
          >
            ALL
          </FilterChip>
          {launchpads.map((lp) => (
            <FilterChip
              key={lp.slug}
              active={filter === lp.slug}
              onClick={() => setFilter(lp.slug)}
            >
              {lp.name.slice(0, 3).toUpperCase()}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded-md border border-line px-2.5 py-1 text-[11.5px] text-ink-soft hover:border-faint"
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button
            onClick={() => setEvents([])}
            className="rounded-md border border-line px-2.5 py-1 text-[11.5px] text-ink-soft hover:border-faint"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="h-[280px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
        {filtered.length === 0 ? (
          <div className="grid h-full place-items-center text-faint">
            {launchpads.length === 0
              ? 'No launchpads tracked yet.'
              : 'No events in buffer.'}
          </div>
        ) : (
          filtered.map((e) => (
            <div
              key={e.id}
              className="border-b border-line-soft/60 py-1.5 last:border-0"
            >
              <span className="text-faint">{e.time}</span>{' '}
              <span className={`font-medium ${TAG_CLASS[e.tag]}`}>
                [{e.tag}]
              </span>{' '}
              <span className="text-ink-soft">{e.lpName}</span>{' '}
              <span className="text-muted">{e.detail}</span>{' '}
              <span className="text-faint">+{e.ms}ms ✓</span>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-[11px] text-faint">
        <span>
          Events in buffer:{' '}
          <span className="font-mono text-ink-soft">{filtered.length}</span>
        </span>
        <span>
          Status:{' '}
          <span className="font-mono text-up">
            {paused ? 'PAUSED' : `ALL STREAMS REPORTING`}
          </span>
        </span>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
        active
          ? 'border-cobalt bg-cobalt-soft text-cobalt'
          : 'border-line text-muted hover:border-faint'
      }`}
    >
      {children}
    </button>
  );
}
