'use client';

import Link from 'next/link';
import { motion, type Variants, type Easing } from 'framer-motion';

const EASE: Easing = [0.22, 1, 0.36, 1];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};

const word: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

function RevealHeadline({ text }: { text: string }) {
  return (
    <motion.h1
      variants={container}
      initial="hidden"
      animate="show"
      className="text-balance text-[clamp(1.9rem,4.8vw,3.1rem)] font-semibold leading-[1.08] tracking-tight text-ink"
    >
      {text.split(' ').map((w, i) => (
        <motion.span
          key={i}
          variants={word}
          className="mr-[0.28em] inline-block"
        >
          {w}
        </motion.span>
      ))}
    </motion.h1>
  );
}

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.25fr_0.95fr] lg:items-center lg:gap-16">
        {/* Copy */}
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint"
          >
            <span className="text-gold">—</span> Robinhood Chain · On-chain
            measurement
          </motion.p>

          <RevealHeadline text="We don't cover launchpads. We audit them." />

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft"
          >
            Robinhood Chain turned three months old and already buried one
            launchpad that lasted ten days. Nobody saw it coming because nobody
            was looking at the right numbers.
            <br />
            <br />
            Assay looks at the right numbers. Every score is built from what the
            chain itself will admit to — never from what a launchpad says about
            itself — and republished before the ink on yesterday&apos;s is dry.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <a
              href="#top-rated"
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
            >
              See the Measurements ↓
            </a>
            <Link
              href="/methodology"
              className="inline-flex items-center rounded-full border border-line bg-card px-5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:border-ink/30"
            >
              How the Ledger is Read
            </Link>
            <span className="ml-1 inline-flex items-center gap-2 font-mono text-[11px] text-faint">
              <span className="relative flex h-[7px] w-[7px]">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60" />
                <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-up" />
              </span>
              measured, not marketed · updated continuously
            </span>
          </motion.div>
        </div>

        {/* Emblem / audit seal */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.55 }}
          className="mx-auto w-full max-w-[340px] lg:max-w-[420px]"
        >
          <div className="relative flex flex-col items-center rounded-[20px] border border-line bg-card px-7 py-8 text-center shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)]">
            <div className="relative mb-[18px] flex h-[140px] w-[140px] items-center justify-center">
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
                className="absolute inset-0 rounded-full border-2 border-dashed border-line"
              />
              <motion.span
                animate={{ scale: [0.9, 1.3, 0.9], opacity: [0.7, 1, 0.7] }}
                transition={{
                  duration: 3,
                  ease: 'easeInOut',
                  repeat: Infinity,
                }}
                className="absolute left-5 top-3.5 h-2.5 w-2.5 rounded-full bg-cobalt shadow-[0_0_10px_var(--cobalt)]"
              />
              <div className="flex h-24 w-24 items-center justify-center rounded-full border border-gold bg-[radial-gradient(circle,var(--gold-soft)_0%,transparent_70%)] text-gold shadow-[0_8px_24px_-6px_rgba(163,115,14,0.25)]">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 100 100"
                  fill="currentColor"
                >
                  <g transform="translate(50, 38)">
                    <circle
                      cx="0"
                      cy="0"
                      r="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4.5"
                    />
                    <circle cx="0" cy="0" r="6" fill="currentColor" />
                    <circle cx="0" cy="-22" r="3" fill="currentColor" />
                    <circle cx="22" cy="0" r="3" fill="currentColor" />
                    <circle cx="0" cy="22" r="3" fill="currentColor" />
                    <circle cx="-22" cy="0" r="3" fill="currentColor" />
                  </g>
                  <rect x="47" y="52" width="6" height="34" rx="2" />
                  <path d="M53 66 h 12 v 5 h -6 v 4 h 6 v 5 h -12 Z" />
                </svg>
              </div>
            </div>

            <div className="mb-1 text-lg font-semibold tracking-tight text-ink">
              Assay Audit Seal
            </div>
            <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
              Nothing here is a compliment. It&apos;s a measurement.
            </p>

            <div className="flex w-full items-center justify-between rounded-[10px] border border-line-soft bg-panel px-3.5 py-2.5 font-mono text-[11.5px]">
              <span className="text-faint">DIRECT LEDGER AUDIT</span>
              <span className="text-up">● MEASURED, NOT MARKETED</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
