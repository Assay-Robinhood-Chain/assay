import type { Metadata } from 'next';
import Reveal from '@/components/Reveal';
import BackfillCalculator from '@/components/BackfillCalculator';
import {
  DIMENSION_LABELS,
  DIMENSION_WEIGHTS,
  MIN_SAMPLE_SIZE_FOR_CONFIDENCE,
  STAR_1_THRESHOLD,
  STAR_2_THRESHOLD,
  STAR_3_THRESHOLD,
  PROVISIONAL_STAR_CAP,
  MIN_BACKFILL_FULL_THRESHOLD,
  MAX_BACKFILL_SAMPLE,
  SCORE_DISCLAIMER,
} from '@/lib/constants';
import { DimensionKey } from '@/lib/types';

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
        <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.14em] text-cobalt">
          Trust page, not marketing copy
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
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

      {/* No paid placement */}
      <Reveal delay={0.05} className="mt-10">
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">
            No paid placement, ever
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            The scoring tables carry no relationship to any billing or customer
            record. A launchpad paying for a report about itself cannot touch
            its own final score — enforced at the schema level, not by an
            internal policy someone could quietly waive.
          </p>
        </section>
      </Reveal>

      {/* 5 dimensions — Composite Weighting */}
      <Reveal delay={0.05} className="mt-8">
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">
              Composite Weighting
            </h2>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
            A composite score is the weighted sum of five dimensions, clamped to
            0–100, then mapped to stars via fixed thresholds.
          </p>

          <div className="mt-6 divide-y divide-line-soft">
            {dimensionKeys.map((key) => (
              <div key={key} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-ink">
                    {DIMENSION_LABELS[key]}
                  </span>
                  <span className="font-mono text-sm font-semibold text-ink">
                    {Math.round(DIMENSION_WEIGHTS[key] * 100)}%
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[11.5px] text-faint">
                  {DIMENSION_TAGLINES[key]}
                </p>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-line-soft">
                  <div
                    className="h-full rounded-full bg-cobalt"
                    style={{ width: `${DIMENSION_WEIGHTS[key] * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-5 text-[12px] leading-relaxed text-faint">
            Note on dimension count: this document uses five dimensions rather
            than the four referenced in an earlier product brief. Whether to
            collapse two of the five is an open decision — treat this table as
            current truth until it's resolved.
          </p>
        </section>
      </Reveal>

      {/* Star thresholds */}
      <Reveal delay={0.05} className="mt-8">
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Star thresholds</h2>
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
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
            The same three thresholds define the red/amber/green colour ramp
            used everywhere a dimension score is shown — colour and stars never
            drift apart.
          </p>
        </section>
      </Reveal>

      {/* Confidence gating */}
      <Reveal delay={0.05} className="mt-8">
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">Cold-start honesty</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
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
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            In practice this means most of the directory will sit at 0–1 stars
            for months after a new chain launches. That's the system working as
            intended, not a bug to fix by lowering the threshold.
          </p>
        </section>
      </Reveal>

      {/* Backfill sampling policy */}
      <Reveal delay={0.05} className="mt-8">
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">
            Initial backfill sampling
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            When a launchpad is first onboarded, Assay decides how many
            historical launches to pull in with a single, one-time rule —
            separate from the hourly ingestion rotation that runs for launchpads
            already tracked.
          </p>

          <ul className="mt-4 space-y-2 text-[13px] leading-relaxed text-muted">
            <li>
              <strong className="text-ink-soft">
                Floor at {MIN_BACKFILL_FULL_THRESHOLD}:
              </strong>{' '}
              below this many total launches, sampling isn't worth the
              complexity — take everything. This is a different concern from the{' '}
              {MIN_SAMPLE_SIZE_FOR_CONFIDENCE}-launch confidence gate above; a
              launchpad can be cheap to backfill in full and still end up
              provisional.
            </li>
            <li>
              <strong className="text-ink-soft">
                Cap at {MAX_BACKFILL_SAMPLE}:
              </strong>{' '}
              beyond this, additional samples buy negligible accuracy against
              real API cost — the margin of error on an estimated rate at{' '}
              {MAX_BACKFILL_SAMPLE} samples is already comfortably tighter than
              the noise in the underlying on-chain data.
            </li>
            <li>
              <strong className="text-ink-soft">
                Recent-first, not random:
              </strong>{' '}
              consistent with the scoring engine's own recency weighting — a
              fresh dossier opens with a launchpad's most current behaviour, and
              needs no separate argument for why old and new launches would
              otherwise be interchangeable.
            </li>
            <li>
              <strong className="text-ink-soft">
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
            <p className="mb-2 text-[12.5px] font-medium text-ink-soft">
              Try it
            </p>
            <BackfillCalculator />
          </div>

          <p className="mt-4 text-[12px] leading-relaxed text-faint">
            A launchpad's dossier always shows both its sampled and
            upstream-total counts side by side — a partial sample never silently
            presents itself as the whole population.
          </p>
        </section>
      </Reveal>

      {/* Independence */}
      <Reveal delay={0.05} className="mt-8">
        <section className="rounded-2xl border border-line bg-card p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">
            Independent, not self-reported
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
            Scoring only ever reads third-party market data and on-chain facts.
            Anything a launchpad submits about itself is a distinct data type
            that cannot satisfy the interface the Scorer reads from — it cannot
            leak into a score by accident, only by someone deliberately changing
            the type.
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
  return (
    <div className={`rounded-lg px-2 py-3 ${cls}`}>
      <div className="font-mono text-sm font-semibold">{label}</div>
      <div className="mt-0.5 font-mono text-[11px] opacity-80">{range}</div>
    </div>
  );
}
