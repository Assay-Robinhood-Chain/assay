import type { Metadata } from 'next';
import Reveal from '@/components/Reveal';
import PipelineFlow from '@/components/PipelineFlow';
import ActiveCollectors from '@/components/ActiveCollectors';
import CoverageTable from '@/components/CoverageTable';
import LiveFeed from '@/components/LiveFeed';
import CronStatus from '@/components/CronStatus';
import StatsRow from '@/components/StatsRow';
import { getLaunchpads } from '@/lib/supabase/queries';
import { buildCoverageRows, COLLECTORS } from '@/lib/coverage';
import {
  MIN_BACKFILL_FULL_THRESHOLD,
  BACKFILL_SAMPLE_RATIO,
  BACKFILL_SAMPLE_CAP,
} from '@/lib/constants';

/** Same accent treatment as the homepage's "method" / "How Assay works"
 * cards — border tint + glow shadow on hover, plus a top bar that wipes
 * in — cycled per card so neighbours never repeat the same accent. */
type Accent = 'cobalt' | 'up' | 'gold';
const ACCENT_ORDER: Accent[] = ['cobalt', 'up', 'gold'];
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
};

export const metadata: Metadata = {
  title: 'Coverage — Assay',
  description:
    'Exactly which Robinhood Chain launchpads are indexed, where their token data comes from, and how fresh it is — including a live feed of the ingestion pipeline.',
};

export default async function CoveragePage() {
  const launchpads = await getLaunchpads();
  const rows = buildCoverageRows(launchpads);
  const totalTracked = launchpads.reduce((sum, lp) => sum + lp.sampleSize, 0);
  const onlineCollectors = COLLECTORS.filter(
    (c) => c.status === 'online',
  ).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Reveal>
        <p className="mb-3 inline-block rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#141413]">
          Coverage &amp; gaps
        </p>
        <h1 className="text-3xl font-semibold font-mono tracking-tight text-ink">
          What&rsquo;s indexed, right now
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          A visible gap is credible; a guess presented as coverage is not. This
          is the exact pipeline every launchpad below moves through — from
          onboarding, to the one-time backfill, to the ongoing cronjob that
          keeps every score current.
        </p>
      </Reveal>

      {/* Flow: launchpad -> discover tokens -> backfill -> score -> cronjob */}
      <Reveal delay={0.05} className="mt-8">
        <section
          className={`flow-panel dark-card group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.cobalt.border} ${ACCENT.cobalt.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.cobalt.bar}`}
          />
          <h2 className="flow-title-pill inline-block rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
            From onboarding to a live score
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <FlowStep
              n="1"
              tone={ACCENT_ORDER[0]}
              accent={ACCENT[ACCENT_ORDER[0]]}
              title="Launchpad added"
              desc="Name, slug, deployer address recorded. Docs checked for a Bitquery/Mobula entry."
            />
            <FlowStep
              n="2"
              tone={ACCENT_ORDER[1]}
              accent={ACCENT[ACCENT_ORDER[1]]}
              title="Tokens discovered"
              desc={`Backfilled once: everything under ${MIN_BACKFILL_FULL_THRESHOLD} launches, else ${BACKFILL_SAMPLE_RATIO * 100}% of the upstream total, capped at ${BACKFILL_SAMPLE_CAP.toLocaleString()} — most-recent-first.`}
            />
            <FlowStep
              n="3"
              tone={ACCENT_ORDER[2]}
              accent={ACCENT[ACCENT_ORDER[2]]}
              title="Scored"
              desc="5 weighted dimensions, clamped 0–100, gated by sample size before a star rating is shown."
            />
            <FlowStep
              n="4"
              tone={ACCENT_ORDER[0]}
              accent={ACCENT[ACCENT_ORDER[0]]}
              title="Kept current"
              desc="Hourly ingestion rotation + a daily scoring sweep — no manual step re-runs this."
            />
          </div>
        </section>
      </Reveal>

      {/* Stats */}
      <Reveal delay={0.08} className="mt-8 ">
        <StatsRow
          items={[
            {
              label: 'Collectors online',
              value: `${onlineCollectors} / ${COLLECTORS.length}`,
            },
            {
              label: 'Launchpads tracked',
              value: launchpads.length.toString(),
            },
            {
              label: 'Launches in sample',
              value: totalTracked.toLocaleString(),
            },
            { label: 'Ingestion cadence', value: 'Hourly' },
          ]}
        />
      </Reveal>

      {/* Cron status */}
      <Reveal delay={0.1} className="mt-8">
        <section
          className={`flow-panel dark-card group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.up.border} ${ACCENT.up.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.up.bar}`}
          />
          <h2 className="flow-title-pill mb-3 inline-block rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
            Cronjob status
          </h2>
          <CronStatus />
        </section>
      </Reveal>

      {/* Pipeline architecture */}
      <Reveal delay={0.05} className="mt-10">
        <section
          className={`flow-panel dark-card group relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.gold.border} ${ACCENT.gold.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.gold.bar}`}
          />
          <h2 className="flow-title-pill mb-3 inline-block rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
            Pipeline architecture
          </h2>
          <PipelineFlow />
        </section>
      </Reveal>

      {/* Collectors */}
      <Reveal delay={0.05} className="mt-10">
        <section
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.cobalt.border} ${ACCENT.cobalt.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.cobalt.bar}`}
          />
          <h2 className="flow-title-pill mb-3 inline-block rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
            Active collectors
          </h2>
          <ActiveCollectors />
        </section>
      </Reveal>

      {/* Coverage table */}
      <Reveal delay={0.05} className="mt-10">
        <section
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.up.border} ${ACCENT.up.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.up.bar}`}
          />
          <h2 className="flow-title-pill mb-3 inline-block rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
            Indexed launchpads &amp; sources
          </h2>
          <CoverageTable rows={rows} />
          <p className="mt-3 text-[12px] leading-relaxed text-[#6e6c63]">
            Confidence floor here is a coarse, display-only read on sample size
            — not the scoring engine's binary confidence gate (see Methodology).
            A launchpad can be &ldquo;high&rdquo; coverage and still carry a low
            score.
          </p>
        </section>
      </Reveal>

      {/* Live feed */}
      <Reveal delay={0.05} className="mt-10">
        <section
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.gold.border} ${ACCENT.gold.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.gold.bar}`}
          />
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flow-title-pill inline-block rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
              Live feed
            </h2>
            <span className="font-mono text-[11px] text-[#6e6c63]">
              simulated — for illustration
            </span>
          </div>
          <LiveFeed launchpads={launchpads} />
        </section>
      </Reveal>
    </div>
  );
}

/** Card-level hover glow, matching ActiveCollectors' reference intensity
 * (stronger than the big panel wrappers' softer ACCENT.glow above). */
const CARD_GLOW: Record<Accent, string> = {
  cobalt: 'hover:shadow-[0_18px_40px_-20px_var(--cobalt)]',
  up: 'hover:shadow-[0_18px_40px_-20px_var(--up)]',
  gold: 'hover:shadow-[0_18px_40px_-20px_var(--gold)]',
};

function FlowStep({
  n,
  title,
  desc,
  accent,
  tone,
}: {
  n: string;
  title: string;
  desc: string;
  accent: { text: string; border: string; glow: string; bar: string };
  tone: Accent;
}) {
  return (
    <div
      className={`flow-step group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ease-out hover:-translate-y-1 ${accent.border} ${CARD_GLOW[tone]}`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
      />
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-night-soft transition-colors duration-300">
          {n}
        </span>
        <div className="text-[13px] font-medium text-night-ink">{title}</div>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-night-soft">{desc}</p>
    </div>
  );
}
