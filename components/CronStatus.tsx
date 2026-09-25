'use client';

import { useEffect, useState } from 'react';
import {
  INGESTION_INTERVAL_HOURS,
  SCORING_SWEEP_INTERVAL_HOURS,
} from '@/lib/constants';
import type { CronJobStatus } from '@/lib/supabase/queries';

// Matches supabase/migrations/0002_cron_schedule.sql. Only used as a
// label/next-run fallback for a job the DB hasn't returned a row for yet
// (RPC unreachable, or pg_cron simply hasn't run once). The *schedule*
// itself is a known constant either way — it's the real run history that
// may be missing, never fabricated.
const FALLBACK_SCHEDULE: Record<string, string> = {
  'ingestion-rotation': '0 * * * *',
  'scoring-sweep': '0 3 * * *',
};

/** Parses the "minute hour * * *" cron expressions this project actually
 * uses (see 0002_cron_schedule.sql) and returns the next UTC occurrence
 * after `now`. Deliberately narrow — not a general cron parser — since
 * it only ever has to understand the two schedules Assay schedules. */
function nextCronRun(schedule: string, now: Date): Date | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const minute = Number(parts[0]);
  const hourField = parts[1];
  if (Number.isNaN(minute)) return null;

  const next = new Date(now);
  next.setUTCSeconds(0, 0);

  if (hourField === '*') {
    // Every hour, at :minute.
    next.setUTCMinutes(minute);
    if (next.getTime() <= now.getTime()) {
      next.setUTCHours(next.getUTCHours() + 1);
    }
    return next;
  }

  const hour = Number(hourField);
  if (Number.isNaN(hour)) return null;
  next.setUTCHours(hour, minute);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'due now';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function formatAgo(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m ago`;
  const s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s ago` : `${s}s ago`;
}

const STATUS_TONE: Record<string, { dot: string; text: string }> = {
  succeeded: { dot: 'bg-up', text: 'text-up' },
  failed: { dot: 'bg-down', text: 'text-down' },
  running: { dot: 'bg-gold', text: 'text-gold' },
};

export default function CronStatus({ jobs }: { jobs: CronJobStatus[] }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const find = (name: string) => jobs.find((j) => j.jobName === name);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CronCard
        label="Ingestion rotation"
        cadence={`Every ${INGESTION_INTERVAL_HOURS}h`}
        detail="Collectors + Normaliser: refreshes metrics for tracked launches, polls the <24h new-launch fast path."
        job={find('ingestion-rotation')}
        fallbackSchedule={FALLBACK_SCHEDULE['ingestion-rotation']}
        now={now}
      />
      <CronCard
        label="Scoring sweep"
        cadence={`Every ${SCORING_SWEEP_INTERVAL_HOURS}h`}
        detail="Scorer recomputes launchpad_scores for the day; drift checks run alongside it."
        job={find('scoring-sweep')}
        fallbackSchedule={FALLBACK_SCHEDULE['scoring-sweep']}
        now={now}
      />
    </div>
  );
}

function CronCard({
  label,
  cadence,
  detail,
  job,
  fallbackSchedule,
  now,
}: {
  label: string;
  cadence: string;
  detail: string;
  job: CronJobStatus | undefined;
  fallbackSchedule: string;
  now: Date | null;
}) {
  const schedule = job?.schedule ?? fallbackSchedule;
  const next = now ? nextCronRun(schedule, now) : null;
  const remaining =
    now && next ? formatCountdown(next.getTime() - now.getTime()) : '—';

  const tone = (job?.lastRunStatus && STATUS_TONE[job.lastRunStatus]) || {
    dot: 'bg-faint',
    text: 'text-faint',
  };

  return (
    <div className="flow-step group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-1 hover:border-[#e8e402]/50 hover:shadow-[0_18px_40px_-20px_#e8e402]">
      <span className="bg-[#e8e402] absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none ${tone.dot}`}
            />
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${tone.dot}`}
            />
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
        <span className="text-[11.5px] text-night-faint">Last run</span>
        <span className={`font-mono text-[12px] font-medium ${tone.text}`}>
          {job?.lastRunStartedAt && now
            ? `${formatAgo(job.lastRunStartedAt, now)}${
                job.lastRunStatus ? ` · ${job.lastRunStatus}` : ''
              }`
            : 'No runs recorded yet'}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[11.5px] text-night-faint">Next run in</span>
        <span className="font-mono text-sm font-semibold text-night-ink">
          {remaining}
        </span>
      </div>
    </div>
  );
}
