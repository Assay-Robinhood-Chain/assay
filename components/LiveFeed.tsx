'use client';

import type { ActivityEvent, ActivityEventType } from '@/lib/supabase/queries';

const TAG_LABEL: Record<ActivityEventType, string> = {
  discovery: 'DISCOVERY',
  metrics_sync: 'METRICS_SYNC',
  score_sweep: 'SCORE_SWEEP',
};

const TAG_CLASS: Record<ActivityEventType, string> = {
  discovery: 'text-cobalt',
  metrics_sync: 'text-up',
  score_sweep: 'text-ink-soft',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(11, 19) + ' UTC';
}

export default function LiveFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <div className="coverage-dark-surface rounded-xl border border-line bg-card">
      <div className="night-scroll h-[280px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
        {events.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-faint">
            No recent activity recorded yet.
          </div>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              className="border-b border-line-soft/60 py-1.5 last:border-0"
            >
              <span className="text-faint">{formatTime(e.timestamp)}</span>{' '}
              <span className={`font-medium ${TAG_CLASS[e.type]}`}>
                [{TAG_LABEL[e.type]}]
              </span>{' '}
              <span className="text-ink-soft">{e.launchpadName}</span>{' '}
              <span className="text-muted">{e.detail}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-[11px] text-faint">
        <span>
          Events shown:{' '}
          <span className="font-mono text-ink-soft">{events.length}</span>
        </span>
        <span>
          Source:{' '}
          <span className="font-mono text-ink-soft">
            launches · launch_metrics_snapshot · launchpad_scores
          </span>
        </span>
      </div>
    </div>
  );
}
