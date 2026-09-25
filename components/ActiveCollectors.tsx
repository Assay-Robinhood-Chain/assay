'use client';

import { motion } from 'framer-motion';
import { SourceIcon, type SourceKind } from '@/components/icons/SourceIcon';
import { COLLECTORS, type Collector } from '@/lib/coverage';

type Accent = 'cobalt' | 'gold' | 'up' | 'faint';

const ACCENT: Record<
  Accent,
  {
    text: string;
    badgeBg: string;
    ring: string;
    glow: string;
    bar: string;
    tagBorder: string;
  }
> = {
  cobalt: {
    text: 'text-cobalt',
    badgeBg: 'bg-cobalt-soft',
    ring: 'hover:border-cobalt/50',
    glow: 'hover:shadow-[0_18px_40px_-20px_var(--cobalt)]',
    bar: 'bg-cobalt',
    tagBorder: 'border-cobalt/25',
  },
  gold: {
    text: 'text-gold',
    badgeBg: 'bg-gold-soft',
    ring: 'hover:border-gold/50',
    glow: 'hover:shadow-[0_18px_40px_-20px_var(--gold)]',
    bar: 'bg-gold',
    tagBorder: 'border-gold/25',
  },
  up: {
    text: 'text-up',
    badgeBg: 'bg-up-soft',
    ring: 'hover:border-up/50',
    glow: 'hover:shadow-[0_18px_40px_-20px_var(--up)]',
    bar: 'bg-up',
    tagBorder: 'border-up/25',
  },
  faint: {
    text: 'text-faint',
    badgeBg: 'bg-panel',
    ring: 'hover:border-line',
    glow: '',
    bar: 'bg-faint',
    tagBorder: 'border-line',
  },
};

const ROLE_ACCENT: Record<Collector['role'], Accent> = {
  metrics: 'cobalt',
  verification: 'gold',
  discovery: 'up',
  fallback: 'faint',
};

const ROLE_ICON: Record<string, SourceKind> = {
  Dexscreener: 'telemetry',
  Blockscout: 'contract',
  Bitquery: 'discovery',
  Mobula: 'orbit',
  'Chain RPC watcher': 'signal',
};

/** Bento spans: the two primary metric/verification sources lead large,
 * the matched discovery pair sits below, and the fallback watcher spans
 * full width underneath — visually the foundation everything else sits on. */
const SPAN: Record<string, string> = {
  Dexscreener: 'sm:col-span-3',
  Blockscout: 'sm:col-span-3',
  Bitquery: 'sm:col-span-3',
  Mobula: 'sm:col-span-3',
  'Chain RPC watcher': 'sm:col-span-6',
};

export default function ActiveCollectors() {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      {COLLECTORS.map((c, i) => {
        const accent = ACCENT[ROLE_ACCENT[c.role]];
        const icon = ROLE_ICON[c.name] ?? 'telemetry';
        const isFallback = c.role === 'fallback';

        return (
          <motion.div
            key={c.name}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className={`flow-step group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-1 ${SPAN[c.name] ?? ''} ${
              isFallback ? 'border-dashed' : ''
            } ${accent.ring} ${accent.glow}`}
          >
            <span
              className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${accent.bar}`}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span
                  className={`pipeline-badge pipeline-badge-${ROLE_ACCENT[c.role]} grid h-8 w-8 shrink-0 place-items-center rounded-lg`}
                >
                  <SourceIcon kind={icon} />
                </span>
                <span className="text-sm font-medium text-night-ink">
                  {c.name}
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-night-up">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-night-up opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-night-up" />
                </span>
                online
              </span>
            </div>
            <p className="mt-2 max-w-md text-[12px] leading-relaxed text-night-ink">
              {c.provides}
            </p>
            <span
              className={`mt-2.5 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${accent.text} ${accent.tagBorder}`}
            >
              {c.role}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
