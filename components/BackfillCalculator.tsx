'use client';

import { useId, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { computeBackfillSample } from '@/lib/scoring';
import {
  MIN_BACKFILL_FULL_THRESHOLD,
  BACKFILL_SAMPLE_RATIO,
  BACKFILL_SAMPLE_CAP,
} from '@/lib/constants';

const PRESETS = [12, 99, 100, 500, 4_999, 5_000, 167_000];

// Chart domain — log-x (total launches) vs linear-y (sample size, 0–cap).
const CHART_MAX = 300_000;
const CAP_BREAKPOINT = BACKFILL_SAMPLE_CAP / BACKFILL_SAMPLE_RATIO; // 5,000
const CURVE_XS = [
  1,
  2,
  4,
  8,
  15,
  25,
  40,
  60,
  80,
  100,
  120,
  160,
  220,
  320,
  480,
  700,
  1_000,
  1_500,
  2_200,
  3_300,
  CAP_BREAKPOINT,
  7_500,
  11_000,
  17_000,
  26_000,
  40_000,
  62_000,
  95_000,
  150_000,
  230_000,
  CHART_MAX,
];

const W = 600;
const H = 172;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 28;
const PAD_B = 24;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const LOG_MAX = Math.log10(CHART_MAX);

function xToSvg(x: number) {
  const clamped = Math.min(Math.max(x, 1), CHART_MAX);
  return PAD_L + (Math.log10(clamped) / LOG_MAX) * PLOT_W;
}

function yToSvg(y: number) {
  const clamped = Math.min(Math.max(y, 0), BACKFILL_SAMPLE_CAP);
  return PAD_T + PLOT_H - (clamped / BACKFILL_SAMPLE_CAP) * PLOT_H;
}

function formatCompact(n: number) {
  if (n >= 1_000) return `${n / 1_000}K`;
  return n.toLocaleString();
}

type Regime = 'floor' | 'scaling' | 'capped';

function regimeOf(total: number): Regime {
  if (total < MIN_BACKFILL_FULL_THRESHOLD) return 'floor';
  if (total <= CAP_BREAKPOINT) return 'scaling';
  return 'capped';
}

const REGIME_META: Record<
  Regime,
  { label: string; color: string; dot: string }
> = {
  floor: {
    label: 'Below floor — full take',
    color: '#d7f900',
    dot: 'bg-[#d7f900]',
  },
  scaling: {
    label: '20% sample — scaling',
    color: '#7a9cff',
    dot: 'bg-[#7a9cff]',
  },
  capped: {
    label: 'Capped at 1,000',
    color: '#e0b04d',
    dot: 'bg-[#e0b04d]',
  },
};

export default function BackfillCalculator() {
  const gradId = useId();
  const glowId = useId();
  const [total, setTotal] = useState<number | ''>(500);
  const numericTotal = total === '' ? 0 : total;
  const sample = computeBackfillSample(numericTotal);
  const pct = numericTotal > 0 ? (sample / numericTotal) * 100 : 0;
  const pctDisplay = numericTotal > 0 ? Math.round(pct) : 0;
  const regime = regimeOf(numericTotal);
  const meta = REGIME_META[regime];

  const curvePoints = useMemo(
    () =>
      CURVE_XS.map((x) => ({
        sx: xToSvg(x),
        sy: yToSvg(computeBackfillSample(x)),
      })),
    [],
  );
  const curveD = curvePoints
    .map(
      (p, i) => `${i === 0 ? 'M' : 'L'} ${p.sx.toFixed(1)},${p.sy.toFixed(1)}`,
    )
    .join(' ');
  const areaD = `${curveD} L ${xToSvg(CHART_MAX).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L ${PAD_L},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  const floorX = xToSvg(MIN_BACKFILL_FULL_THRESHOLD);
  const capBreakX = xToSvg(CAP_BREAKPOINT);
  const rightEdge = PAD_L + PLOT_W;
  const capY = yToSvg(BACKFILL_SAMPLE_CAP);
  const baseY = PAD_T + PLOT_H;

  const markerX = xToSvg(
    Math.max(numericTotal, numericTotal > 0 ? numericTotal : 0),
  );
  const markerY = yToSvg(sample);
  const offScale = numericTotal > CHART_MAX;

  // Log-scale slider: 0–1000 maps onto 0…CHART_MAX, matching the chart's x-axis.
  const sliderValue =
    numericTotal <= 0
      ? 0
      : Math.round((Math.log10(Math.max(numericTotal, 1)) / LOG_MAX) * 1000);
  const handleSlider = (s: number) => {
    if (s <= 0) {
      setTotal(0);
      return;
    }
    setTotal(Math.round(Math.pow(10, (s / 1000) * LOG_MAX)));
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#302f2a] bg-[#1b1b18] p-5 sm:p-6">
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full opacity-[0.12] blur-3xl transition-colors duration-500"
        style={{ background: meta.color }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <label
          className="block text-[12.5px] font-medium text-[#b5b2a6]"
          htmlFor="total-launches"
        >
          Launchpad&rsquo;s total launches at onboarding
        </label>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#6e6c63]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#4ade9a] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#4ade9a]" />
          </span>
          Live
        </span>
      </div>

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
        className="mt-1.5 w-full rounded-lg border border-[#302f2a] bg-[#141413] px-3 py-2 font-mono text-sm text-[#f3f1ea] [appearance:textfield] focus:border-[#7a9cff] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0"
      />

      <input
        type="range"
        min={0}
        max={1000}
        value={sliderValue}
        onChange={(e) => handleSlider(Number(e.target.value))}
        aria-label="Total launches (log scale)"
        className="slider-track mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#302f2a] accent-[#7a9cff]"
      />
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6e6c63]">
        <span>0</span>
        <span>100</span>
        <span>5K</span>
        <span>300K</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = numericTotal === p;
          return (
            <button
              key={p}
              onClick={() => setTotal(p)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] font-bold transition-all ${
                active
                  ? 'border-[#e8e402] bg-[#e8e402] text-[#141413] shadow-[0_0_0_3px_rgba(232,228,2,0.18)]'
                  : 'border-[#302f2a] bg-transparent text-[#b5b2a6] hover:border-[#e8e402] hover:text-[#e8e402]'
              }`}
            >
              {p.toLocaleString()}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-[1fr_auto] items-center gap-4 border-t border-[#302f2a] pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6e6c63]">
              Sample taken
            </div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={sample}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="font-mono text-2xl font-semibold text-[#7a9cff] tabular-nums"
              >
                {sample.toLocaleString()}
              </motion.div>
            </AnimatePresence>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#6e6c63]">
              Coverage
            </div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={pctDisplay}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="font-mono text-2xl font-semibold text-[#f3f1ea] tabular-nums"
              >
                {pctDisplay}%
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <svg
          width="56"
          height="56"
          viewBox="0 0 56 56"
          className="shrink-0 -rotate-90"
        >
          <circle
            cx="28"
            cy="28"
            r="24"
            fill="none"
            stroke="#302f2a"
            strokeWidth="5"
          />
          <motion.circle
            cx="28"
            cy="28"
            r="24"
            fill="none"
            stroke={meta.color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 24}
            initial={false}
            animate={{
              strokeDashoffset:
                2 * Math.PI * 24 * (1 - Math.min(pct, 100) / 100),
            }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </svg>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <AnimatePresence mode="wait">
          <motion.span
            key={regime}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 4 }}
            transition={{ duration: 0.18 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#302f2a] bg-[#141413] px-2.5 py-1 font-mono text-[10.5px] font-semibold text-[#b5b2a6]"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Sampling curve: total launches (log scale) vs. backfilled sample */}
      <div className="mt-4 rounded-lg border border-[#302f2a] bg-[#141413] p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="Backfill sample as a function of total launches"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7a9cff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#7a9cff" stopOpacity="0" />
            </linearGradient>
            <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Zone bands */}
          <rect
            x={PAD_L}
            y={PAD_T}
            width={floorX - PAD_L}
            height={PLOT_H}
            fill="#d7f900"
            opacity={regime === 'floor' ? 0.1 : 0.04}
          />
          <rect
            x={floorX}
            y={PAD_T}
            width={capBreakX - floorX}
            height={PLOT_H}
            fill="#7a9cff"
            opacity={regime === 'scaling' ? 0.1 : 0.04}
          />
          <rect
            x={capBreakX}
            y={PAD_T}
            width={rightEdge - capBreakX}
            height={PLOT_H}
            fill="#e0b04d"
            opacity={regime === 'capped' ? 0.1 : 0.04}
          />

          {/* Cap line */}
          <line
            x1={PAD_L}
            y1={capY}
            x2={rightEdge}
            y2={capY}
            stroke="#e0b04d"
            strokeOpacity="0.4"
            strokeDasharray="3 4"
          />
          <text
            x={rightEdge}
            y={capY - 6}
            textAnchor="end"
            fontSize="9.5"
            fontFamily="ui-monospace, monospace"
            fill="#e0b04d"
            opacity="0.75"
          >
            cap 1,000
          </text>

          {/* Zone boundary lines */}
          <line
            x1={floorX}
            y1={PAD_T}
            x2={floorX}
            y2={baseY}
            stroke="#6e6c63"
            strokeOpacity="0.35"
            strokeDasharray="2 3"
          />
          <line
            x1={capBreakX}
            y1={PAD_T}
            x2={capBreakX}
            y2={baseY}
            stroke="#6e6c63"
            strokeOpacity="0.35"
            strokeDasharray="2 3"
          />

          {/* Area + curve */}
          <path d={areaD} fill={`url(#${gradId})`} />
          <path
            d={curveD}
            fill="none"
            stroke="#7a9cff"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Axis labels */}
          <text
            x={PAD_L}
            y={H - 6}
            fontSize="9.5"
            fontFamily="ui-monospace, monospace"
            fill="#6e6c63"
          >
            1
          </text>
          <text
            x={floorX}
            y={H - 6}
            textAnchor="middle"
            fontSize="9.5"
            fontFamily="ui-monospace, monospace"
            fill="#6e6c63"
          >
            {formatCompact(MIN_BACKFILL_FULL_THRESHOLD)}
          </text>
          <text
            x={capBreakX}
            y={H - 6}
            textAnchor="middle"
            fontSize="9.5"
            fontFamily="ui-monospace, monospace"
            fill="#6e6c63"
          >
            {formatCompact(CAP_BREAKPOINT)}
          </text>
          <text
            x={rightEdge}
            y={H - 6}
            textAnchor="end"
            fontSize="9.5"
            fontFamily="ui-monospace, monospace"
            fill="#6e6c63"
          >
            {formatCompact(CHART_MAX)}
          </text>

          {/* Current position crosshair + marker */}
          {numericTotal > 0 && (
            <g style={{ filter: `url(#${glowId})` }}>
              <line
                x1={markerX}
                y1={markerY}
                x2={markerX}
                y2={baseY}
                stroke={meta.color}
                strokeOpacity="0.5"
                strokeWidth="1.25"
              />
              <line
                x1={PAD_L}
                y1={markerY}
                x2={markerX}
                y2={markerY}
                stroke={meta.color}
                strokeOpacity="0.5"
                strokeWidth="1.25"
                strokeDasharray="2 3"
              />
              <motion.circle
                cx={markerX}
                cy={markerY}
                r="5"
                fill={meta.color}
                stroke="#141413"
                strokeWidth="1.5"
                initial={false}
                animate={{ cx: markerX, cy: markerY }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </g>
          )}
        </svg>
        {offScale && (
          <p className="mt-1 text-[10.5px] text-[#6e6c63]">
            {numericTotal.toLocaleString()} is off the right edge of this chart
            — the cap still applies.
          </p>
        )}
      </div>

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
