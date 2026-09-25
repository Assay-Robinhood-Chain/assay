import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLaunchpadBySlug, getLaunchpads } from '@/lib/supabase/queries';
import {
  isStale,
  formatDate,
  hasScore,
  rampColor,
  dimensionGapReason,
} from '@/lib/scoring';
import {
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  DIMENSION_BASIS,
  DIMENSION_WEIGHTS,
} from '@/lib/constants';
import ScoreBadge from '@/components/ScoreBadge';
import DimensionBar from '@/components/DimensionBar';
import BackfillNote from '@/components/BackfillNote';
import ScoreHistoryChart from '@/components/ScoreHistoryChart';
import LaunchesTable from '@/components/LaunchesTable';
import {
  StaleLabel,
  ProvisionalNote,
  NotYetScored,
} from '@/components/StatusLabels';
import Reveal from '@/components/Reveal';
import { PageIcon, type PageIconKind } from '@/components/icons/PageIcon';
import { DimensionKey } from '@/lib/types';

/** Same accent treatment used on Rankings/Coverage/the homepage's top-ranked
 * cards: fixed dark card (bg-[#141413]) regardless of site theme, a border +
 * glow tint on hover, and a top bar that wipes in. Cycled per section so
 * neighbours never repeat the same accent. */
type Accent = 'cobalt' | 'up' | 'gold' | 'down';
const ACCENT: Record<
  Accent,
  { text: string; border: string; glow: string; bar: string }
> = {
  cobalt: {
    text: 'text-cobalt',
    border: 'hover:border-cobalt/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--cobalt)]',
    bar: 'bg-cobalt',
  },
  up: {
    text: 'text-up',
    border: 'hover:border-up/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--up)]',
    bar: 'bg-up',
  },
  gold: {
    text: 'text-gold',
    border: 'hover:border-gold/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--gold)]',
    bar: 'bg-gold',
  },
  down: {
    text: 'text-down',
    border: 'hover:border-down/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--down)]',
    bar: 'bg-down',
  },
};

const RAMP_ACCENT: Record<'green' | 'amber' | 'red', Accent> = {
  green: 'up',
  amber: 'gold',
  red: 'down',
};

/** Unified brand-yellow accent for the section panels below (Score
 * breakdown, Sample & onboarding, Score history, Active badges, Tracked
 * launches) — these are purely decorative, unlike the header card above
 * whose color reflects the launchpad's actual score ramp (green/amber/red)
 * and must keep its own meaning. */
const DECOR_ACCENT: {
  text: string;
  border: string;
  glow: string;
  bar: string;
} = {
  text: 'text-[#e8e402]',
  border: 'hover:border-[#e8e402]/50',
  glow: 'hover:shadow-[0_14px_36px_-16px_#e8e402]',
  bar: 'bg-[#e8e402]',
};

export async function generateStaticParams() {
  return (await getLaunchpads()).map((lp) => ({ slug: lp.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lp = await getLaunchpadBySlug(slug);
  if (!lp) return {};
  return {
    title: `${lp.name} — Assay`,
    description: lp.description,
  };
}

export default async function LaunchpadDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const lp = await getLaunchpadBySlug(slug);
  if (!lp) notFound();

  const stale = isStale(lp.lastSnapshotAt);
  const dimensionKeys = Object.keys(DIMENSION_LABELS) as DimensionKey[];
  const isScored = lp.sampleSize > 0 && hasScore(lp.score);
  const headerAccent = isScored
    ? ACCENT[RAMP_ACCENT[rampColor(lp.score.finalScore)]]
    : ACCENT.cobalt;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        ← Directory
      </Link>

      {/* Header card — always-dark identity card, same treatment as the
       * homepage's top-ranked cards, accented by this launchpad's score
       * ramp color (up/gold/down), or cobalt when not yet scored. */}
      <Reveal>
        <div
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${headerAccent.border} ${headerAccent.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${headerAccent.bar}`}
          />
          <div className="night-surface flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-line bg-panel font-mono text-lg text-faint">
                {lp.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold text-ink sm:text-2xl">
                    {lp.name}
                  </h1>
                  <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-faint">
                    {lp.chain}
                  </span>
                </div>
                <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">
                  {lp.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {stale && <StaleLabel lastSnapshotAt={lp.lastSnapshotAt} />}
                  {lp.websiteUrl && (
                    <a
                      href={lp.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-[12.5px] text-cobalt hover:underline"
                    >
                      Website ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {lp.sampleSize === 0 || !hasScore(lp.score) ? null : (
              <ScoreBadge
                score={lp.score.finalScore}
                stars={lp.score.stars}
                isProvisional={lp.score.isProvisional}
                sampleSize={lp.score.sampleSize}
                size="lg"
              />
            )}
          </div>

          {(lp.sampleSize === 0 || !hasScore(lp.score)) && (
            <div className="night-surface mt-6">
              <NotYetScored />
            </div>
          )}
          {hasScore(lp.score) && lp.score.isProvisional && (
            <div className="night-surface mt-5">
              <ProvisionalNote
                sampleSize={lp.score.sampleSize}
                missingDimensions={
                  Object.values(lp.score.dimensions).filter((v) => v === null)
                    .length
                }
              />
            </div>
          )}
        </div>
      </Reveal>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        {/* Dimension breakdown */}
        <Reveal delay={0.05}>
          <SectionPanel
            accent={DECOR_ACCENT}
            icon="bars"
            title="Score breakdown"
          >
            <div className="night-surface divide-y divide-line-soft">
              {dimensionKeys.map((key, i) => (
                <DimensionBar
                  key={key}
                  label={DIMENSION_LABELS[key]}
                  value={lp.score.dimensions[key]}
                  weight={DIMENSION_WEIGHTS[key]}
                  description={DIMENSION_DESCRIPTIONS[key]}
                  basis={DIMENSION_BASIS[key]}
                  reason={
                    lp.score.dimensions[key] === null
                      ? dimensionGapReason(key, lp.launches)
                      : null
                  }
                  delay={i * 0.05}
                />
              ))}
            </div>
          </SectionPanel>
        </Reveal>

        {/* Backfill + meta */}
        <Reveal delay={0.1} className="lg:mt-6">
          <SectionPanel
            accent={DECOR_ACCENT}
            icon="archive"
            title="Sample & onboarding"
            className="flex h-full flex-col gap-5"
          >
            <div className="night-surface">
              <BackfillNote
                totalUpstream={lp.totalLaunchesUpstream}
                sampleSize={lp.sampleSize}
                onboardedAt={lp.onboardedAt}
              />
            </div>
            <dl className="night-surface grid grid-cols-2 gap-y-3 text-[12.5px]">
              <dt className="text-faint">Algorithm version</dt>
              <dd className="text-right font-mono text-ink-soft">
                {lp.score.algorithmVersion}
              </dd>
              <dt className="text-faint">Score date</dt>
              <dd className="text-right font-mono text-ink-soft">
                {formatDate(lp.score.scoreDate)}
              </dd>
              <dt className="text-faint">Last snapshot</dt>
              <dd className="text-right font-mono text-ink-soft">
                {formatDate(lp.lastSnapshotAt)}
              </dd>
              <dt className="text-faint">Deployer address</dt>
              <dd className="truncate text-right font-mono text-ink-soft">
                {lp.deployerAddresses[0]}
              </dd>
            </dl>
          </SectionPanel>
        </Reveal>
      </div>

      {/* Score history */}
      <Reveal delay={0.05} className="mt-8">
        <SectionPanel
          accent={DECOR_ACCENT}
          icon="timeline"
          title="Score history"
        >
          <div className="night-surface">
            <ScoreHistoryChart points={lp.scoreHistory} />
          </div>
        </SectionPanel>
      </Reveal>

      {/* Badges */}
      {lp.badges.length > 0 && (
        <Reveal delay={0.05} className="mt-8">
          <SectionPanel
            accent={DECOR_ACCENT}
            icon="medal"
            title="Active badges"
          >
            <div className="night-surface flex flex-wrap gap-3">
              {lp.badges.map((b, i) => (
                <div
                  key={b.id}
                  className={`card-hover max-w-xs rounded-xl border border-line bg-panel px-4 py-3 ${i % 2 === 1 ? 'sm:mt-2' : ''}`}
                >
                  <div className="text-[13px] font-medium text-ink">
                    {b.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">
                    {b.description}
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-faint">
                    awarded {formatDate(b.awardedAt)}
                  </div>
                </div>
              ))}
            </div>
          </SectionPanel>
        </Reveal>
      )}

      {/* Launches */}
      <Reveal delay={0.05} className="mt-8">
        <SectionPanel
          accent={DECOR_ACCENT}
          icon="list"
          title="Tracked launches"
          headerExtra={
            <span className="font-mono text-[11px] text-[#6e6c63]">
              {lp.launches.length} shown
            </span>
          }
        >
          <div className="night-surface">
            <p className="mb-3 text-[12px] text-faint">
              Every launch we know about. Rows marked{' '}
              <span className="rounded-full border border-dashed border-line px-1.5 py-0.5 text-[10.5px]">
                Not sampled
              </span>{' '}
              are known but not counted toward the score above only the active
              sample is.
            </p>
            <LaunchesTable launches={lp.launches} launchpadSlug={lp.slug} />
          </div>
        </SectionPanel>
      </Reveal>

      <p className="mt-10 max-w-2xl text-[12px] leading-relaxed text-faint">
        {lp.score.disclaimer}
      </p>
    </div>
  );
}

/** Reusable always-dark section wrapper: dark-card fill, accent border/glow
 * on hover, top bar that wipes in, and a pill-style header — same pattern as
 * Coverage's flow panels. Children should be wrapped in `.night-surface`
 * (locally remaps --card/--line/--ink/etc. to their dark-theme values) so
 * existing theme-token components like DimensionBar or LaunchesTable render
 * correctly without any changes of their own. */
function SectionPanel({
  accent,
  icon,
  title,
  headerExtra,
  className = '',
  children,
}: {
  accent: { border: string; glow: string; bar: string };
  icon: PageIconKind;
  title: string;
  headerExtra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${accent.border} ${accent.glow} ${className}`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
      />
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="flow-title-pill inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
          <PageIcon kind={icon} size={13} />
          {title}
        </h2>
        {headerExtra}
      </div>
      {children}
    </div>
  );
}
