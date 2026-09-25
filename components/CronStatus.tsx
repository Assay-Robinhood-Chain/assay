'use client';

import { useEffect, useState } from 'react';
import {
  INGESTION_INTERVAL_HOURS,
  SCORING_SWEEP_INTERVAL_HOURS,
} from '@/lib/constants';

function useCountdown(intervalHours: number, anchorMinutesAgo: number) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now)
    return {
      lastRun: null as Date | null,
      nextRun: null as Date | null,
      remaining: '—',
    };

  const intervalMs = intervalHours * 3600 * 1000;
  const lastRun = new Date(now.getTime() - anchorMinutesAgo * 60 * 1000);
  const elapsedSinceLast = now.getTime() - lastRun.getTime();
  const cyclesSince = Math.floor(elapsedSinceLast / intervalMs);
  const trueLastRun = new Date(lastRun.getTime() + cyclesSince * intervalMs);
  const nextRun = new Date(trueLastRun.getTime() + intervalMs);
  const remainingMs = nextRun.getTime() - now.getTime();

  const h = Math.floor(remainingMs / 3600000);
  const m = Math.floor((remainingMs % 3600000) / 60000);
  const s = Math.floor((remainingMs % 60000) / 1000);
  const remaining = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;

  return { lastRun: trueLastRun, nextRun, remaining };
}

export default function CronStatus() {
  const ingestion = useCountdown(INGESTION_INTERVAL_HOURS, 22);
  const scoring = useCountdown(SCORING_SWEEP_INTERVAL_HOURS, 340);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CronCard
        label="Ingestion rotation"
        cadence={`Every ${INGESTION_INTERVAL_HOURS}h`}
        remaining={ingestion.remaining}
        detail="Collectors + Normaliser: refreshes metrics for tracked launches, polls the <24h new-launch fast path."
      />
      <CronCard
        label="Scoring sweep"
        cadence={`Every ${SCORING_SWEEP_INTERVAL_HOURS}h`}
        remaining={scoring.remaining}
        detail="Scorer recomputes launchpad_scores for the day; drift checks run alongside it."
      />
    </div>
  );
}

function CronCard({
  label,
  cadence,
  remaining,
  detail,
}: {
  label: string;
  cadence: string;
  remaining: string;
  detail: string;
}) {
  return (
    <div className="flow-step group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-cobalt/50 hover:shadow-[0_18px_40px_-20px_var(--cobalt)]">
      <span className="bg-cobalt absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-up opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-up" />
          </span>
          <span className="text-sm font-medium text-night-ink">{label}</span>
        </div>
        <span className="font-mono text-[11px] text-night-faint">
          {cadence}
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-night-soft">
        {detail}
      </p>
      <div className="mt-3 flex items-baseline justify-between border-t border-line-soft pt-3">
        <span className="text-[11.5px] text-night-faint">Next run in</span>
        <span className="font-mono text-sm font-semibold text-night-ink">
          {remaining}
        </span>
      </div>
    </div>
  );
}
