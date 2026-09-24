'use client';

import { motion, type Easing } from 'framer-motion';
import { ScoreHistoryPoint } from '@/lib/types';
import { formatDate } from '@/lib/scoring';
import { useId, useState } from 'react';

const EASE: Easing = [0.22, 1, 0.36, 1];

const WIDTH = 640;
const HEIGHT = 200;
const PAD = 24;

export default function ScoreHistoryChart({
  points,
}: {
  points: ScoreHistoryPoint[];
}) {
  const clipId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const yFor = (v: number) => HEIGHT - PAD - (v / 100) * (HEIGHT - PAD * 2);

  if (points.length === 0) {
    return (
      <div className="grid h-[200px] place-items-center rounded-lg border border-line-soft bg-panel text-sm text-muted">
        Not enough history yet
      </div>
    );
  }

  // One day recorded so far: a line needs two points, but today's score
  // is real and worth showing. Draw it as a single marker plus a caption.
  if (points.length === 1) {
    const only = points[0];
    return (
      <div>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-[200px] w-full"
          role="img"
          aria-label={`Score ${only.finalScore.toFixed(1)} on ${formatDate(only.date)}`}
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <line
              key={v}
              x1={PAD}
              x2={WIDTH - PAD}
              y1={yFor(v)}
              y2={yFor(v)}
              stroke="var(--line)"
              strokeWidth={1}
            />
          ))}
          <circle
            cx={WIDTH / 2}
            cy={yFor(only.finalScore)}
            r={11}
            fill="var(--cobalt)"
            opacity={0.18}
          />
          <circle
            cx={WIDTH / 2}
            cy={yFor(only.finalScore)}
            r={5}
            fill="var(--cobalt)"
          />
        </svg>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          <span className="font-mono font-medium text-ink">
            {only.finalScore.toFixed(1)}
          </span>
          <span className="ml-2 text-faint">{formatDate(only.date)}</span>
          <span className="ml-2">
            — only one day recorded so far. The trend line appears once a second
            daily score is saved.
          </span>
        </p>
      </div>
    );
  }

  const xFor = (i: number) =>
    PAD + (i / (points.length - 1)) * (WIDTH - PAD * 2);

  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.finalScore).toFixed(1)}`,
    )
    .join(' ');

  const areaD = `${d} L ${xFor(points.length - 1).toFixed(1)} ${HEIGHT - PAD} L ${xFor(0)} ${
    HEIGHT - PAD
  } Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[200px] w-full"
        role="img"
        aria-label="Score history over time"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={clipId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cobalt)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--cobalt)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((v) => (
          <line
            key={v}
            x1={PAD}
            x2={WIDTH - PAD}
            y1={yFor(v)}
            y2={yFor(v)}
            stroke="var(--line)"
            strokeWidth={1}
          />
        ))}

        <motion.path
          d={areaD}
          fill={`url(#${clipId})`}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        />

        <motion.path
          d={d}
          fill="none"
          stroke="var(--cobalt)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: EASE }}
        />

        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={xFor(i)}
            cy={yFor(p.finalScore)}
            r={hover === i ? 4 : 0}
            fill="var(--cobalt)"
            className="transition-all"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* invisible hit targets so hover works across the whole column */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={xFor(i) - WIDTH / points.length / 2}
            y={0}
            width={WIDTH / points.length}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>

      {hover !== null && (
        <div className="pointer-events-none absolute -top-1 left-0 rounded-md border border-line bg-card px-2.5 py-1.5 text-[11.5px] shadow-sm">
          <span className="font-mono font-medium text-ink">
            {points[hover].finalScore.toFixed(1)}
          </span>
          <span className="ml-2 text-faint">
            {formatDate(points[hover].date)}
          </span>
        </div>
      )}
    </div>
  );
}
