import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getLaunchpadBySlug,
  getLaunchpads,
  getLaunchBySlugAndAddress,
} from '@/lib/supabase/queries';
import {
  formatDate,
  formatMultiple,
  formatUsd,
  shortAddress,
} from '@/lib/scoring';
import Reveal from '@/components/Reveal';
import { PageIcon, type PageIconKind } from '@/components/icons/PageIcon';

/** Same accent treatment as Coverage/Rankings/the homepage's top-ranked
 * cards: fixed dark card (bg-[#141413]) regardless of site theme, a border +
 * glow tint on hover, and a top bar that wipes in. */
type Accent = 'cobalt' | 'up' | 'gold' | 'down';
const ACCENT: Record<Accent, { border: string; glow: string; bar: string }> = {
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
  down: {
    border: 'hover:border-down/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--down)]',
    bar: 'bg-down',
  },
};

const CELL_GLOW: Record<Accent, string> = {
  cobalt: 'hover:shadow-[0_18px_40px_-20px_var(--cobalt)]',
  up: 'hover:shadow-[0_18px_40px_-20px_var(--up)]',
  gold: 'hover:shadow-[0_18px_40px_-20px_var(--gold)]',
  down: 'hover:shadow-[0_18px_40px_-20px_var(--down)]',
};

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
  const label = launch.name || shortAddress(launch.tokenAddress);
  return {
    title: `${label}${launch.symbol ? ` (${launch.symbol})` : ''} — ${lp.name} — Assay`,
    description: `Launch telemetry for ${label}, launched on ${lp.name}.`,
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
    ? { label: 'Confirmed rug', tone: 'down' as const, accent: ACCENT.down }
    : launch.isGraduated
      ? { label: 'Graduated', tone: 'up' as const, accent: ACCENT.up }
      : { label: 'Active', tone: 'muted' as const, accent: ACCENT.cobalt };

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <Link
        href={`/launchpad/${lp.slug}`}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        ← Back to {lp.name}
      </Link>

      {/* Header — always-dark identity card, accented by the launch's
       * status (graduated/rug/active), same treatment as the homepage's
       * top-ranked cards and the launchpad detail header. */}
      <Reveal>
        <div
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${status.accent.border} ${status.accent.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${status.accent.bar}`}
          />
          <div className="night-surface flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
                Token · launched on {lp.name}
              </p>
              <h1 className="mt-1.5 text-xl font-bold text-ink sm:text-2xl">
                {launch.name || shortAddress(launch.tokenAddress)}
                {launch.symbol && (
                  <span className="ml-2 text-base font-normal text-muted">
                    {launch.symbol}
                  </span>
                )}
              </h1>
              <p className="mt-1.5 break-all font-mono text-[12px] text-faint">
                {launch.tokenAddress} · {lp.chain}
              </p>
            </div>
            <Flag tone={status.tone}>{status.label}</Flag>
          </div>
        </div>
      </Reveal>

      {/* Stat strip — same dark-card cell treatment as Coverage's flow
       * steps, accent cycled so neighbours never repeat. */}
      <div className="mt-6 grid grid-cols-2 items-stretch gap-3 sm:grid-cols-4">
        {(
          [
            {
              label: 'Peak multiple',
              value: formatMultiple(launch.peakMultiple),
              accent: 'cobalt' as Accent,
            },
            {
              label: 'Liquidity',
              value: formatUsd(launch.liquidityUsd),
              accent: 'up' as Accent,
            },
            {
              label: '24h volume',
              value: formatUsd(launch.volume24hUsd),
              accent: 'gold' as Accent,
            },
            {
              label: 'Launched',
              value: formatDate(launch.launchDate),
              accent: 'cobalt' as Accent,
            },
          ] as const
        ).map((s, i) => (
          <Reveal key={s.label} delay={0.05 + i * 0.04} className="h-full">
            <StatCell label={s.label} value={s.value} accent={s.accent} />
          </Reveal>
        ))}
      </div>

      {/* Status & flags */}
      <Reveal delay={0.25} className="mt-6">
        <SectionPanel accent={ACCENT.gold} icon="flag" title="Status & flags">
          <dl className="night-surface divide-y divide-line-soft text-[13px]">
            <KvRow k="DEX graduation">
              {launch.isGraduated ? 'Graduated' : 'Not yet graduated'}
            </KvRow>
            <KvRow k="Confirmed rugpull">
              {launch.isConfirmedRugpull ? 'Yes' : 'Not tracked yet'}
            </KvRow>
            <KvRow k="Wash-trading flag">
              {launch.washTradingFlag
                ? 'Flagged — elevated volume/trader ratio'
                : 'Not tracked yet'}
            </KvRow>
          </dl>
          {launch.washTradingFlag && (
            <div className="night-surface mt-4 flex flex-wrap gap-1.5">
              <Flag tone="gold">Wash-trading flag</Flag>
            </div>
          )}
        </SectionPanel>
      </Reveal>

      <p className="mt-6 text-[12px] leading-relaxed text-faint">
        Data synchronized from Dexscreener, Blockscout &amp; Mobula, refreshed
        on the latest hourly ingestion epoch. Liquidity and 24h volume come from
        Dexscreener for tokens with a DEX pool and from Mobula for tokens still
        on a bonding curve; a token neither source knows shows a dash. Peak
        multiple comes from Mobula price candles and stays a dash until the
        token has price history. Rugpull and wash-trading detection are not
        tracked yet.
      </p>
    </div>
  );
}

/** Reusable always-dark section wrapper — see the launchpad detail page for
 * the full pattern writeup. Children wrapped in `.night-surface` render
 * existing theme-token components (KvRow, Flag, etc.) correctly on the
 * fixed-dark background without any changes to those components. */
function SectionPanel({
  accent,
  icon,
  title,
  children,
}: {
  accent: { border: string; glow: string; bar: string };
  icon: PageIconKind;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${accent.border} ${accent.glow}`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
      />
      <h2 className="flow-title-pill mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
        <PageIcon kind={icon} size={13} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: Accent;
}) {
  const a = ACCENT[accent];
  return (
    <div
      className={`dark-card group relative flex h-full flex-col justify-center overflow-hidden rounded-xl border bg-[#141413] p-4 text-center transition-all duration-300 ease-out hover:-translate-y-1 ${a.border} ${CELL_GLOW[accent]}`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 group-hover:scale-x-100 ${a.bar}`}
      />
      <div className="font-mono text-lg font-semibold text-[#f3f1ea]">
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-[#6e6c63]">
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
