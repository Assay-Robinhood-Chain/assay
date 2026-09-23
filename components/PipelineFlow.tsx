'use client';

import { motion } from 'framer-motion';
import { PipelineIcon, type PipelineKind } from '@/components/icons/SourceIcon';

type Accent = 'cobalt' | 'gold' | 'up' | 'faint';

const ACCENT: Record<
  Accent,
  { text: string; badgeBg: string; ring: string; glow: string; bar: string }
> = {
  cobalt: {
    text: 'text-cobalt',
    badgeBg: 'bg-cobalt-soft',
    ring: 'hover:border-cobalt/50',
    glow: 'hover:shadow-[0_16px_36px_-18px_var(--cobalt)]',
    bar: 'bg-cobalt',
  },
  gold: {
    text: 'text-gold',
    badgeBg: 'bg-gold-soft',
    ring: 'hover:border-gold/50',
    glow: 'hover:shadow-[0_16px_36px_-18px_var(--gold)]',
    bar: 'bg-gold',
  },
  up: {
    text: 'text-up',
    badgeBg: 'bg-up-soft',
    ring: 'hover:border-up/50',
    glow: 'hover:shadow-[0_16px_36px_-18px_var(--up)]',
    bar: 'bg-up',
  },
  faint: {
    text: 'text-faint',
    badgeBg: 'bg-panel',
    ring: 'hover:border-line',
    glow: '',
    bar: 'bg-faint',
  },
};

const STEPS: {
  n: string;
  title: string;
  desc: string;
  icon: PipelineKind;
  accent: Accent;
  /** vertical stagger in px, alternating the cards along the flow */
  offset: number;
}[] = [
  {
    n: '01',
    title: 'Collectors',
    desc: 'One adapter per source — Dexscreener, Blockscout, Bitquery/Mobula for documented launchpads, RPC watcher as fallback. Fetch, tag with data_source, push to queue.',
    icon: 'intake',
    accent: 'cobalt',
    offset: 0,
  },
  {
    n: '02',
    title: 'Normaliser',
    desc: "Maps each source's payload into the canonical snapshot row, resolves disagreements between sources, writes it, then triggers a recompute.",
    icon: 'merge',
    accent: 'gold',
    offset: 14,
  },
  {
    n: '03',
    title: 'Metrics Engine',
    desc: 'Pure function over snapshot history — graduation status, wash-trading flag, holder concentration. Does not decide a score.',
    icon: 'gauge',
    accent: 'up',
    offset: 0,
  },
  {
    n: '04',
    title: 'Scorer',
    desc: 'Deterministic composite formula across 5 dimensions. Reproducible: same inputs and algorithm_version, same output, every time.',
    icon: 'seal',
    accent: 'cobalt',
    offset: 14,
  },
  {
    n: '05',
    title: 'Web / API',
    desc: 'Stateless, reads only from Postgres. Stays up even if every collector is down — serves stale-but-labeled data instead.',
    icon: 'server',
    accent: 'faint',
    offset: 0,
  },
];

export default function PipelineFlow() {
  return (
    <div className="relative">
      {/* connecting track running behind the staggered cards */}
      <div className="pointer-events-none absolute left-0 right-0 top-[52px] hidden h-px bg-line-soft sm:block" />

      <div className="grid gap-3 sm:grid-cols-5">
        {STEPS.map((s, i) => {
          const a = ACCENT[s.accent];
          return (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className={`group relative rounded-xl border border-line bg-card p-4 transition-shadow duration-300 hover:-translate-y-0.5 ${a.ring} ${a.glow}`}
              style={{ marginTop: s.offset }}
            >
              <span
                className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 rounded-t-xl transition-transform duration-300 group-hover:scale-x-100 ${a.bar}`}
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-faint">{s.n}</span>
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${a.badgeBg} ${a.text}`}
                >
                  <PipelineIcon kind={s.icon} />
                </span>
              </div>
              <div className="mt-2 text-sm font-medium text-ink">{s.title}</div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                {s.desc}
              </p>

              {i < STEPS.length - 1 && (
                <span
                  className={`pointer-events-none absolute -right-[11px] top-[30px] hidden font-mono text-[13px] sm:block ${a.text}`}
                >
                  →
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
