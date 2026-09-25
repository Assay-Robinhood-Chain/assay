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
    glow: 'hover:shadow-[0_18px_40px_-20px_var(--cobalt)]',
    bar: 'bg-cobalt',
  },
  gold: {
    text: 'text-gold',
    badgeBg: 'bg-gold-soft',
    ring: 'hover:border-gold/50',
    glow: 'hover:shadow-[0_18px_40px_-20px_var(--gold)]',
    bar: 'bg-gold',
  },
  up: {
    text: 'text-up',
    badgeBg: 'bg-up-soft',
    ring: 'hover:border-up/50',
    glow: 'hover:shadow-[0_18px_40px_-20px_var(--up)]',
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

const FLOW_BAR: Record<Accent, string> = {
  cobalt: 'bg-cobalt',
  gold: 'bg-gold',
  up: 'bg-up',
  faint: 'bg-faint',
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
              className={`flow-step group relative rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-1 ${a.ring} ${a.glow}`}
              style={{ marginTop: s.offset }}
            >
              <span
                className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 rounded-t-xl transition-transform duration-300 group-hover:scale-x-100 ${FLOW_BAR[s.accent]}`}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-night-soft">
                    {s.n}
                  </span>
                  <span className="text-sm font-medium text-night-ink">
                    {s.title}
                  </span>
                </div>
                <span
                  className={`pipeline-badge pipeline-badge-${s.accent} hidden h-7 w-7 shrink-0 place-items-center rounded-md lg:grid`}
                >
                  <PipelineIcon kind={s.icon} />
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-night-ink">
                {s.desc}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
