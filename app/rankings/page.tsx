import type { Metadata } from 'next';
import DirectoryTable from '@/components/DirectoryTable';
import Reveal from '@/components/Reveal';
import { PageIcon, type PageIconKind } from '@/components/icons/PageIcon';
import { getLaunchpads } from '@/lib/supabase/queries';
import { SCORE_DISCLAIMER, TARGET_CHAIN } from '@/lib/constants';
import { hasScore } from '@/lib/scoring';

/** Same accent treatment as the homepage's "method" dimension cards —
 * border tint + glow shadow on hover, plus a top bar that wipes in. */
const ACCENT: Record<
  'cobalt' | 'up' | 'gold',
  { border: string; glow: string; bar: string }
> = {
  cobalt: {
    border: 'hover:border-cobalt/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--cobalt)]',
    bar: 'bg-cobalt',
  },
  up: {
    border: 'hover:border-up/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--up)]',
    bar: 'bg-up',
  },
  gold: {
    border: 'hover:border-gold/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--gold)]',
    bar: 'bg-gold',
  },
};

export const metadata: Metadata = {
  title: 'Rankings — Assay',
  description: `Every launchpad tracked on ${TARGET_CHAIN}, ranked by final score. Nothing gated, nothing sponsored.`,
};

export default async function RankingsPage() {
  const launchpads = await getLaunchpads();

  const scored = launchpads.filter(
    (lp) => lp.sampleSize > 0 && hasScore(lp.score),
  );
  const avgScore = scored.length
    ? Math.round(
        scored.reduce((sum, lp) => sum + lp.score.finalScore, 0) /
          scored.length,
      )
    : 0;
  const threeStar = launchpads.filter((lp) => lp.score.stars === 3).length;
  const provisional = launchpads.filter((lp) => lp.score.isProvisional).length;

  const stats: {
    icon: PageIconKind;
    label: string;
    value: string;
    tone: 'cobalt' | 'up' | 'gold';
  }[] = [
    {
      icon: 'grid',
      label: 'Tracked total',
      value: String(launchpads.length),
      tone: 'cobalt',
    },
    {
      icon: 'trend',
      label: 'Avg. score',
      value: scored.length ? String(avgScore) : '—',
      tone: 'cobalt',
    },
    { icon: 'crown', label: '3★ rated', value: String(threeStar), tone: 'up' },
    {
      icon: 'flag',
      label: 'Provisional',
      value: String(provisional),
      tone: 'gold',
    },
  ];

  const toneCls = {
    cobalt: 'bg-cobalt-soft text-cobalt',
    up: 'bg-up-soft text-up',
    gold: 'bg-gold-soft text-gold',
  };

  return (
    <div className="rank-page mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Reveal>
        <p className="mb-3 flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-cobalt">
          <PageIcon kind="list" size={13} />
          Full directory
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Rankings
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          Every launchpad Assay tracks on {TARGET_CHAIN}, sorted by final score.
          Filters run entirely client-side against data already fetched —
          nothing here triggers a new request.
        </p>
      </Reveal>

      {/* Stat strip — staggered entrance, level grid (aligned with Get Listed's strip).
       * Cards are a fixed dark fill (bg-[#141413], same hex as the homepage's
       * "See the Measurements" button) regardless of site theme. The border
       * is the only part that reacts to theme: thin/black at rest, and — via
       * .rank-stat-card in globals.css — white and thicker in dark theme, so
       * the card doesn't blend into an equally-dark page. */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s, i) => {
          const accent = ACCENT[s.tone];
          return (
            <Reveal key={s.label} delay={0.05 + i * 0.05}>
              <div
                className={`rank-stat-card group relative overflow-hidden rounded-xl border bg-[#141413] p-4 transition-all duration-300 ease-out hover:-translate-y-1.5 ${accent.border} ${accent.glow}`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
                />
                <div
                  className={`icon-chip grid h-7 w-7 place-items-center rounded-lg ${toneCls[s.tone]}`}
                >
                  <PageIcon kind={s.icon} size={14} />
                </div>
                <div className="mt-3 font-mono text-xl font-bold text-[#f3f1ea]">
                  {s.value}
                </div>
                <div className="mt-0.5 text-[12px] tracking-normal text-[#b5b2a6]">
                  {s.label}
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal delay={0.25} className="mt-8">
        <div className="card-surface">
          <DirectoryTable launchpads={launchpads} />
        </div>
      </Reveal>

      <p className="mt-8 max-w-2xl text-[12px] leading-relaxed text-faint">
        {SCORE_DISCLAIMER}
      </p>
    </div>
  );
}
