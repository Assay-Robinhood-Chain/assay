'use client';

import { motion, type Easing } from 'framer-motion';
import { rampColor } from '@/lib/scoring';

const EASE: Easing = [0.22, 1, 0.36, 1];

const BAR_COLOR: Record<string, string> = {
  green: 'bg-up',
  amber: 'bg-gold',
  red: 'bg-down',
};

export default function DimensionBar({
  label,
  value,
  weight,
  description,
  basis,
  reason,
  delay = 0,
}: {
  label: string;
  /** null = not enough data to measure this dimension yet. */
  value: number | null;
  weight: number;
  description?: string;
  /** What is actually being measured today (may be narrower than `description`). */
  basis?: string;
  /** Only shown when value is null — e.g. "2 of 5 minimum sampled
   * launches are ≥72h old with price history." */
  reason?: string | null;
  delay?: number;
}) {
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink">{label}</span>
          <span className="font-mono text-[11px] text-faint">
            ×{weight.toFixed(2)}
          </span>
        </div>
        <span
          className={`font-mono text-sm ${value === null ? 'text-faint' : 'text-ink-soft'}`}
          title={
            value === null
              ? 'Not enough data yet — excluded from the composite score'
              : undefined
          }
        >
          {value === null ? 'n/a' : value.toFixed(0)}
        </span>
      </div>
      {value === null ? (
        <div className="h-2 w-full rounded-full border border-dashed border-line-soft" />
      ) : (
        <div className="h-2 w-full overflow-hidden rounded-full bg-line-soft">
          <motion.div
            className={`h-full rounded-full ${BAR_COLOR[rampColor(value)]}`}
            initial={{ width: 0 }}
            whileInView={{ width: `${value}%` }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.7, delay, ease: EASE }}
          />
        </div>
      )}
      {value === null && reason && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-gold">
          Not enough data yet — {reason}
        </p>
      )}
      {description && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          {description}
        </p>
      )}
      {basis && (
        <p className="mt-1 text-[11.5px] leading-relaxed text-faint">{basis}</p>
      )}
    </div>
  );
}
