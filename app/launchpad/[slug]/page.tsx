import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLaunchpadBySlug, getLaunchpads } from '@/lib/supabase/queries';
import { isStale, formatDate, hasScore } from '@/lib/scoring';
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
import { PageIcon } from '@/components/icons/PageIcon';
import { DimensionKey } from '@/lib/types';

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

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        ← Directory
      </Link>

      {/* Header card */}
      <Reveal>
        <div className="card-hover rounded-2xl border border-line bg-card p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-line bg-panel font-mono text-lg text-faint">
                {lp.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-ink sm:text-2xl">
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
            <div className="mt-6">
              <NotYetScored />
            </div>
          )}
          {hasScore(lp.score) && lp.score.isProvisional && (
            <div className="mt-5">
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
          <div className="card-hover rounded-2xl border border-line bg-card p-6 sm:p-8">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-faint">
              <span className="icon-chip grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cobalt-soft text-cobalt">
                <PageIcon kind="bars" size={14} />
              </span>
              Score breakdown
            </h2>
            <div className="mt-2 divide-y divide-line-soft">
              {dimensionKeys.map((key, i) => (
                <DimensionBar
                  key={key}
                  label={DIMENSION_LABELS[key]}
                  value={lp.score.dimensions[key]}
                  weight={DIMENSION_WEIGHTS[key]}
                  description={DIMENSION_DESCRIPTIONS[key]}
                  basis={DIMENSION_BASIS[key]}
                  delay={i * 0.05}
                />
              ))}
            </div>
          </div>
        </Reveal>

        {/* Backfill + meta */}
        <Reveal delay={0.1} className="lg:mt-6">
          <div className="card-hover flex h-full flex-col gap-5 rounded-2xl border border-line bg-card p-6 sm:p-8">
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-faint">
                <span className="icon-chip grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cobalt-soft text-cobalt">
                  <PageIcon kind="archive" size={14} />
                </span>
                Sample &amp; onboarding
              </h2>
              <BackfillNote
                totalUpstream={lp.totalLaunchesUpstream}
                sampleSize={lp.sampleSize}
                onboardedAt={lp.onboardedAt}
              />
            </div>
            <dl className="grid grid-cols-2 gap-y-3 text-[12.5px]">
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
          </div>
        </Reveal>
      </div>

      {/* Score history */}
      <Reveal delay={0.05} className="mt-8">
        <div className="card-hover rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-faint">
            <span className="icon-chip grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cobalt-soft text-cobalt">
              <PageIcon kind="timeline" size={14} />
            </span>
            Score history
          </h2>
          <ScoreHistoryChart points={lp.scoreHistory} />
        </div>
      </Reveal>

      {/* Badges */}
      {lp.badges.length > 0 && (
        <Reveal delay={0.05} className="mt-8">
          <div className="card-hover rounded-2xl border border-line bg-card p-6 sm:p-8">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-faint">
              <span className="icon-chip grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gold-soft text-gold">
                <PageIcon kind="medal" size={14} />
              </span>
              Active badges
            </h2>
            <div className="flex flex-wrap gap-3">
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
          </div>
        </Reveal>
      )}

      {/* Launches */}
      <Reveal delay={0.05} className="mt-8">
        <div>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-faint">
              <span className="icon-chip grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cobalt-soft text-cobalt">
                <PageIcon kind="list" size={14} />
              </span>
              Tracked launches
            </h2>
            <span className="font-mono text-[12px] text-faint">
              {lp.launches.length} shown
            </span>
          </div>
          <LaunchesTable launches={lp.launches} launchpadSlug={lp.slug} />
        </div>
      </Reveal>

      <p className="mt-10 max-w-2xl text-[12px] leading-relaxed text-faint">
        {lp.score.disclaimer}
      </p>
    </div>
  );
}
