import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getLaunchpadBySlug,
  getLaunchpads,
  getLaunchBySlugAndAddress,
} from '@/lib/supabase/queries';
import { formatDate, formatMultiple, formatUsd } from '@/lib/scoring';
import Reveal from '@/components/Reveal';
import { PageIcon } from '@/components/icons/PageIcon';

export async function generateStaticParams() {
  return (await getLaunchpads()).flatMap((lp) =>
    lp.launches.map((l) => ({ slug: lp.slug, tokenAddress: l.tokenAddress })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; tokenAddress: string }>;
}): Promise<Metadata> {
  const { slug, tokenAddress } = await params;
  const [launch, lp] = await Promise.all([
    getLaunchBySlugAndAddress(slug, tokenAddress),
    getLaunchpadBySlug(slug),
  ]);
  if (!launch || !lp) return {};
  return {
    title: `${launch.name} (${launch.symbol}) — ${lp.name} — Assay`,
    description: `Launch telemetry for ${launch.name}, launched on ${lp.name}.`,
  };
}

export default async function TokenDetailPage({
  params,
}: {
  params: Promise<{ slug: string; tokenAddress: string }>;
}) {
  const { slug, tokenAddress } = await params;
  const [lp, launch] = await Promise.all([
    getLaunchpadBySlug(slug),
    getLaunchBySlugAndAddress(slug, tokenAddress),
  ]);
  if (!lp || !launch) notFound();

  const status = launch.isConfirmedRugpull
    ? { label: 'Confirmed rug', tone: 'down' as const }
    : launch.isGraduated
      ? { label: 'Graduated', tone: 'up' as const }
      : { label: 'Active', tone: 'muted' as const };

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href={`/launchpad/${lp.slug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        ← Back to {lp.name}
      </Link>

      <Reveal>
        <div className="card-hover rounded-2xl border border-line bg-card p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
                Token · launched on {lp.name}
              </p>
              <h1 className="mt-1.5 text-xl font-semibold text-ink sm:text-2xl">
                {launch.name}
                <span className="ml-2 text-base font-normal text-muted">
                  {launch.symbol}
                </span>
              </h1>
              <p className="mt-1.5 break-all font-mono text-[12px] text-faint">
                {launch.tokenAddress} · {lp.chain}
              </p>
            </div>
            <Flag tone={status.tone}>{status.label}</Flag>
          </div>
        </div>
      </Reveal>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: 'Peak multiple',
            value: formatMultiple(launch.peakMultiple),
          },
          { label: 'Liquidity', value: formatUsd(launch.liquidityUsd) },
          { label: '24h volume', value: formatUsd(launch.volume24hUsd) },
          { label: 'Launched', value: formatDate(launch.launchDate) },
        ].map((s, i) => (
          <Reveal
            key={s.label}
            delay={0.05 + i * 0.04}
            className={i % 2 === 1 ? 'sm:mt-3' : ''}
          >
            <StatCell label={s.label} value={s.value} />
          </Reveal>
        ))}
      </div>

      <Reveal delay={0.25} className="mt-6">
        <div className="card-hover rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-faint">
            <span className="icon-chip grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cobalt-soft text-cobalt">
              <PageIcon kind="flag" size={14} />
            </span>
            Status &amp; flags
          </h2>
          <dl className="divide-y divide-line-soft text-[13px]">
            <KvRow k="DEX graduation">
              {launch.isGraduated ? 'Graduated' : 'Not yet graduated'}
            </KvRow>
            <KvRow k="Confirmed rugpull">
              {launch.isConfirmedRugpull ? 'Yes' : 'No'}
            </KvRow>
            <KvRow k="Wash-trading flag">
              {launch.washTradingFlag
                ? 'Flagged — elevated volume/trader ratio'
                : 'None'}
            </KvRow>
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {!launch.washTradingFlag && (
              <Flag tone="up">✓ no wash-trading flags</Flag>
            )}
            {launch.washTradingFlag && (
              <Flag tone="gold">Wash-trading flag</Flag>
            )}
          </div>
        </div>
      </Reveal>

      <p className="mt-6 text-[12px] leading-relaxed text-faint">
        Data synchronized from Dexscreener &amp; Blockscout, refreshed on the
        latest hourly ingestion epoch.
      </p>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-hover rounded-xl border border-line bg-card p-4 text-center">
      <div className="font-mono text-lg font-semibold text-ink">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-faint">
        {label}
      </div>
    </div>
  );
}

function KvRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-faint">{k}</dt>
      <dd className="font-medium text-ink-soft">{children}</dd>
    </div>
  );
}

function Flag({
  tone,
  children,
}: {
  tone: 'up' | 'down' | 'gold' | 'muted';
  children: React.ReactNode;
}) {
  const cls = {
    up: 'bg-up-soft text-up',
    down: 'bg-down-soft text-down',
    gold: 'bg-gold-soft text-gold',
    muted: 'bg-line-soft text-muted',
  }[tone];
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}
