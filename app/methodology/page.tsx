import type { Metadata } from 'next';
import Reveal from '@/components/Reveal';
import BackfillCalculator from '@/components/BackfillCalculator';
import { PageIcon } from '@/components/icons/PageIcon';
import {
  DIMENSION_LABELS,
  DIMENSION_WEIGHTS,
  MIN_SAMPLE_SIZE_FOR_CONFIDENCE,
  MIN_DATA_POINTS_PER_DIMENSION,
  MIN_TOKEN_AGE_HOURS,
  MIN_DIMENSIONS_FOR_SCORE,
  STAR_1_THRESHOLD,
  STAR_2_THRESHOLD,
  STAR_3_THRESHOLD,
  PROVISIONAL_STAR_CAP,
  MIN_BACKFILL_FULL_THRESHOLD,
  BACKFILL_SAMPLE_RATIO,
  BACKFILL_SAMPLE_CAP,
  SCORE_DISCLAIMER,
} from '@/lib/constants';
import { DimensionKey } from '@/lib/types';

/** Same accent treatment as the homepage's "method" / "How Assay works"
 * cards — border tint + glow shadow on hover, unified to the brand
 * yellow (#e8e402) across every card, plus a top bar that wipes in on
 * hover. (The inner 0-1★/1★/2★/3★ threshold ramp is the one exception —
 * it keeps its own red/amber/green colours via THRESHOLD_ACCENT below.) */
type Accent = 'cobalt' | 'up' | 'gold';
const ACCENT: Record<Accent, { border: string; glow: string; bar: string }> = {
  cobalt: {
    border: 'hover:border-[#e8e402]/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_#e8e402]',
    bar: 'bg-[#e8e402]',
  },
  up: {
    border: 'hover:border-[#e8e402]/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_#e8e402]',
    bar: 'bg-[#e8e402]',
  },
  gold: {
    border: 'hover:border-[#e8e402]/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_#e8e402]',
    bar: 'bg-[#e8e402]',
  },
};

export const metadata: Metadata = {
  title: 'Methodology — Assay',
  description:
    'How Assay scores launchpads: the five dimensions, the confidence-gating rule, the onboarding sampling policy, and the no-paid-placement guarantee.',
};

const dimensionKeys = Object.keys(DIMENSION_LABELS) as DimensionKey[];

// Short taglines for the Composite Weighting card only — the longer
// sentences in DIMENSION_DESCRIPTIONS are still used everywhere else
// (e.g. the per-dimension breakdown on the launchpad detail page).
const DIMENSION_TAGLINES: Record<DimensionKey, string> = {
  quality: 'graduation & anti-rug',
  mechanism: 'audited factory, LP lock',
  marketHealth: 'depth, anti-wash',
  value: 'realistic ROI',
  consistency: 'temporal stability',
};

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Reveal>
        <p className="mb-3 inline-block rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#141413]">
          Trust page, not marketing copy
        </p>
        <h1 className="text-3xl font-semibold font-mono tracking-tight text-ink">
          Methodology
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          Every scoring rule below is published, versioned, and implemented as a
          deterministic formula — no learned model, no LLM in the loop, no
          non-reproducible step. Given the same inputs and the same{' '}
          <span className="font-mono text-[13px]">algorithm_version</span>, the
          Scorer always returns the same output.
        </p>
      </Reveal>

      {/* Trust pair — no paid placement + independence, side by side */}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Reveal delay={0.05}>
          <section
            className={`dark-card group relative h-full overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.cobalt.border} ${ACCENT.cobalt.glow}`}
          >
            <span
              className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.cobalt.bar}`}
            />
            <div className="mb-3 flex items-center gap-3">
              <span className="weight-pill grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-transform duration-300 group-hover:scale-110">
                <PageIcon kind="shield" size={17} />
              </span>

              <h2 className="text-lg font-bold font-mono text-[#f3f1ea]">
                No paid placement, ever
              </h2>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#b5b2a6]">
              The scoring tables carry no relationship to any billing or
              customer record. A launchpad paying for a report about itself
              cannot touch its own final score — enforced at the schema level,
              not by an internal policy someone could quietly waive.
            </p>
          </section>
        </Reveal>

        <Reveal delay={0.1} className="md:mt-5">
          <section
            className={`dark-card group relative h-full overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.up.border} ${ACCENT.up.glow}`}
          >
            <span
              className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.up.bar}`}
            />
            <div className="mb-3 flex items-center gap-3">
              <div className="weight-pill grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-transform duration-300 group-hover:scale-110">
                <PageIcon kind="shieldCheck" size={17} />
              </div>

              <h2 className="text-lg font-bold font-mono text-[#f3f1ea]">
                Independent, not self-reported
              </h2>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#b5b2a6]">
              Scoring only ever reads third-party market data and on-chain
              facts. Anything a launchpad submits about itself is a distinct
              data type that cannot satisfy the interface the Scorer reads from
              — it cannot leak into a score by accident, only by someone
              deliberately changing the type.
            </p>
          </section>
        </Reveal>
      </div>

      {/* 5 dimensions — Composite Weighting */}
      <Reveal delay={0.05} className="mt-8">
        <section
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.cobalt.border} ${ACCENT.cobalt.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.cobalt.bar}`}
          />
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-2.5 text-lg font-bold text-[#f3f1ea]">
              <span className="weight-pill grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-transform duration-300 group-hover:scale-110"></span>
              Composite Weighting
            </h2>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#b5b2a6]">
            A composite score is the weighted sum of five dimensions, clamped to
            0–100, then mapped to stars via fixed thresholds.
          </p>

          <div className="mt-6 divide-y divide-[#302f2a]">
            {dimensionKeys.map((key) => (
              <div key={key} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-[#f3f1ea]">
                    {DIMENSION_LABELS[key]}
                  </span>
                  <span className="font-mono text-sm font-semibold text-[#f3f1ea]">
                    {Math.round(DIMENSION_WEIGHTS[key] * 100)}%
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[11.5px] text-[#6e6c63]">
                  {DIMENSION_TAGLINES[key]}
                </p>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[#302f2a]">
                  <div
                    className="h-full rounded-full bg-[#7a9cff]"
                    style={{ width: `${DIMENSION_WEIGHTS[key] * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <ul className="mt-5 space-y-2 text-[12.5px] leading-relaxed text-[#b5b2a6]">
            <li>
              <strong className="text-[#f3f1ea]">
                Missing data is never a number.
              </strong>{' '}
              A dimension needs data from at least{' '}
              <span className="font-mono text-[12px]">
                {MIN_DATA_POINTS_PER_DIMENSION}
              </span>{' '}
              launches. Until then it shows n/a, is left out of the composite
              (the remaining weights are rescaled), and the score is marked
              provisional.
            </li>
            <li>
              <strong className="text-[#f3f1ea]">
                Young tokens are not judged.
              </strong>{' '}
              Quality, Value and Consistency only count tokens at least{' '}
              <span className="font-mono text-[12px]">
                {MIN_TOKEN_AGE_HOURS}
              </span>
              h old — graduation and price outcomes need time to play out. A
              composite also needs at least{' '}
              <span className="font-mono text-[12px]">
                {MIN_DIMENSIONS_FOR_SCORE}
              </span>{' '}
              of the five dimensions measured; with fewer, the launchpad shows
              as not yet scored rather than a number built from a couple of
              partial signals.
            </li>
            <li>
              <strong className="text-[#f3f1ea]">
                No market is a zero, not a gap.
              </strong>{' '}
              A token that never reached a DEX pool counts as zero liquidity in
              Market Health rather than being skipped.
            </li>
            <li>
              <strong className="text-[#f3f1ea]">
                Gains, not just stability.
              </strong>{' '}
              Value is measured on a log scale from the launch price (a token
              that never rose scores 0, 10× scores 100), and Consistency is
              multiplied by how good the typical outcome is — a launchpad whose
              tokens all flatline is not rewarded for being predictable.
            </li>
            <li>
              <strong className="text-[#f3f1ea]">
                Partial dimensions are capped.
              </strong>{' '}
              Where a dimension has several components but only some are
              measured yet (Mechanism: contract verification is one of three),
              its score cannot exceed the share that is measured.
            </li>
          </ul>

          <p className="mt-5 text-[12px] leading-relaxed text-[#6e6c63]">
            Note on dimension count: this document uses five dimensions rather
            than the four referenced in an earlier product brief. Whether to
            collapse two of the five is an open decision — treat this table as
            current truth until it's resolved.
          </p>
        </section>
      </Reveal>

      {/* Star thresholds */}
      <Reveal delay={0.05} className="mt-8">
        <section
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.gold.border} ${ACCENT.gold.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.gold.bar}`}
          />
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-[#f3f1ea]">
            <span className="weight-pill grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-transform duration-300 group-hover:scale-110">
              <PageIcon kind="tiers" size={15} />
            </span>
            Star thresholds
          </h2>
          <div className="mt-4 grid grid-cols-4 gap-3 text-center">
            <ThresholdCell
              label="0–1★"
              range={`< ${STAR_1_THRESHOLD}`}
              tone="down"
            />
            <ThresholdCell
              label="1★"
              range={`${STAR_1_THRESHOLD}–${STAR_2_THRESHOLD - 1}`}
              tone="gold"
            />
            <ThresholdCell
              label="2★"
              range={`${STAR_2_THRESHOLD}–${STAR_3_THRESHOLD - 1}`}
              tone="gold"
            />
            <ThresholdCell
              label="3★"
              range={`≥ ${STAR_3_THRESHOLD}`}
              tone="up"
            />
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-[#b5b2a6]">
            The same three thresholds define the red/amber/green colour ramp
            used everywhere a dimension score is shown — colour and stars never
            drift apart.
          </p>
        </section>
      </Reveal>

      {/* Confidence gating */}
      <Reveal delay={0.05} className="mt-8">
        <section
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.cobalt.border} ${ACCENT.cobalt.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.cobalt.bar}`}
          />
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-[#f3f1ea]">
            <span className="weight-pill grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-transform duration-300 group-hover:scale-110">
              <PageIcon kind="hourglass" size={15} />
            </span>
            Cold-start honesty
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#b5b2a6]">
            A launchpad with a tracked sample below{' '}
            <span className="font-mono text-[13px]">
              {MIN_SAMPLE_SIZE_FOR_CONFIDENCE}
            </span>{' '}
            launches is marked{' '}
            <span className="font-mono text-[13px]">is_provisional</span> and
            its star rating is capped at{' '}
            <span className="font-mono text-[13px]">
              {PROVISIONAL_STAR_CAP}
            </span>{' '}
            regardless of the raw composite score. This is enforced inside the
            scoring function itself, not as a frontend warning layered on top —
            there is no configuration flag that disables it.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-[#b5b2a6]">
            In practice this means most of the directory will sit at 0–1 stars
            for months after a new chain launches. That's the system working as
            intended, not a bug to fix by lowering the threshold.
          </p>
        </section>
      </Reveal>

      {/* Backfill sampling policy */}
      <Reveal delay={0.05} className="mt-8">
        <section
          className={`dark-card group relative overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 sm:p-8 ${ACCENT.cobalt.border} ${ACCENT.cobalt.glow}`}
        >
          <span
            className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.cobalt.bar}`}
          />
          <h2 className="flex items-center gap-2.5 text-lg font-bold text-[#f3f1ea]">
            <span className="weight-pill grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-transform duration-300 group-hover:scale-110">
              <PageIcon kind="stack" size={15} />
            </span>
            Initial backfill sampling
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#b5b2a6]">
            When a launchpad is first onboarded, Assay decides how many
            historical launches to pull in with a single, one-time rule —
            separate from the hourly ingestion rotation that runs for launchpads
            already tracked.
          </p>

          <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-[#b5b2a6]">
            <li>
              <strong className="text-[#f3f1ea]">
                Floor at {MIN_BACKFILL_FULL_THRESHOLD}:
              </strong>{' '}
              below this many total launches, sampling isn't worth the
              complexity — take everything. This is a different concern from the{' '}
              {MIN_SAMPLE_SIZE_FOR_CONFIDENCE}-launch confidence gate above; a
              launchpad can be cheap to backfill in full and still end up
              provisional.
            </li>
            <li>
              <strong className="text-[#f3f1ea]">
                {BACKFILL_SAMPLE_RATIO * 100}% of the upstream total, capped at{' '}
                {BACKFILL_SAMPLE_CAP.toLocaleString()}:
              </strong>{' '}
              the sample scales with the launchpad up to the cap — a launchpad
              with 500 total launches backfills 100, one with 5,000 backfills
              1,000, and one with 276,000 also backfills 1,000. The cap keeps a
              very large launchpad from exhausting the upstream data APIs; at
              that size a thousand launches already pins a rate such as
              graduation to within about three percentage points.
            </li>
            <li>
              <strong className="text-[#f3f1ea]">
                Recent-first, not random:
              </strong>{' '}
              consistent with the scoring engine's own recency weighting — a
              fresh dossier opens with a launchpad's most current behaviour, and
              needs no separate argument for why old and new launches would
              otherwise be interchangeable.
            </li>
            <li>
              <strong className="text-[#f3f1ea]">
                Runs once, at onboarding only.
              </strong>{' '}
              After backfill, a launchpad's sampled launches enter the normal
              hourly rotation, and any launch published after onboarding is
              picked up through the existing new-launch fast path — never
              through this rule again, unless the launchpad is manually
              re-onboarded.
            </li>
          </ul>

          <div className="mt-5">
            <p className="mb-2 text-[12.5px] font-medium text-[#b5b2a6]">
              Try it
            </p>
            <BackfillCalculator />
          </div>

          <p className="mt-4 text-[12px] leading-relaxed text-[#6e6c63]">
            A launchpad's dossier always shows both its sampled and
            upstream-total counts side by side — a partial sample never silently
            presents itself as the whole population.
          </p>
        </section>
      </Reveal>

      <Reveal delay={0.05} className="mt-10">
        <p className="text-[12px] leading-relaxed text-faint">
          {SCORE_DISCLAIMER}
        </p>
      </Reveal>
    </div>
  );
}

/** Local accent for the 0-1★/1★/2★/3★ threshold ramp only — kept as its
 * own red/amber/green scale, independent from the unified yellow ACCENT
 * used by the rest of the page's hover states. */
const THRESHOLD_ACCENT: Record<
  'up' | 'gold' | 'down',
  { border: string; glow: string; bar: string }
> = {
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

function ThresholdCell({
  label,
  range,
  tone,
}: {
  label: string;
  range: string;
  tone: 'up' | 'gold' | 'down';
}) {
  const cls = {
    up: 'bg-up-soft text-up',
    gold: 'bg-gold-soft text-gold',
    down: 'bg-down-soft text-down',
  }[tone];
  const accent = THRESHOLD_ACCENT[tone];
  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-transparent px-2 py-3 transition-all duration-300 ease-out hover:-translate-y-1 ${cls} ${accent.border} ${accent.glow}`}
    >
      <span
        className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
      />
      <div className="font-mono text-sm font-semibold">{label}</div>
      <div className="mt-0.5 font-mono text-[11px] opacity-80">{range}</div>
    </div>
  );
}
