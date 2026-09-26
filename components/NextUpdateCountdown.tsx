'use client';

import { useEffect, useState } from 'react';
import { nextResampleAt } from '@/lib/coverage';

/** Same h/m/s countdown format as CronStatus's "Next run in" — kept
 * consistent across the two places the site counts down to a cron tick. */
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'due now';
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

/** Ticking countdown to this launchpad's next sample-resample cron run
 * (see lib/coverage.ts#nextResampleAt). `now` starts null and is only set
 * client-side after mount — same guard CronStatus uses — so the server-
 * rendered markup and the first client render match before the clock
 * starts ticking. */
export default function NextUpdateCountdown({
  lastResampleAt,
  sampleSize,
}: {
  lastResampleAt: string | null;
  sampleSize: number;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return <span>—</span>;

  const next = nextResampleAt(lastResampleAt, sampleSize, now);
  if (!next) return <span>—</span>;

  return <span>{formatCountdown(new Date(next).getTime() - now.getTime())}</span>;
}
