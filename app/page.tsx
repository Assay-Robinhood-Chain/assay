import type { Metadata } from 'next';
import Link from 'next/link';
import Hero from '@/components/Hero';
import Reveal from '@/components/Reveal';
import TopRankedPreview from '@/components/TopRankedPreview';
import { SourceIcon } from '@/components/icons/SourceIcon';
import { getLaunchpads } from '@/lib/supabase/queries';
import {
  TARGET_CHAIN,
  MIN_BACKFILL_FULL_THRESHOLD,
  BACKFILL_SAMPLE_RATIO,
  BACKFILL_SAMPLE_CAP,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
  DIMENSION_WEIGHTS,
  STAR_1_THRESHOLD,
  STAR_2_THRESHOLD,
  STAR_3_THRESHOLD,
} from '@/lib/constants';
import { DimensionKey } from '@/lib/types';

const DIMENSION_KEYS = Object.keys(DIMENSION_LABELS) as DimensionKey[];

/** Cycled accents drawn from the existing palette — no new colors, just
 * distributed so neighbouring cards never repeat the same one. */
type Accent = 'cobalt' | 'up' | 'gold';
const ACCENT_ORDER: Accent[] = ['cobalt', 'up', 'gold'];
const ACCENT: Record<
  Accent,
  { text: string; pill: string; border: string; glow: string; bar: string }
> = {
  cobalt: {
    text: 'text-cobalt',
    pill: 'bg-cobalt-soft text-cobalt',
    border: 'hover:border-cobalt/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--cobalt)]',
    bar: 'bg-cobalt',
  },
  up: {
    text: 'text-up',
    pill: 'bg-up-soft text-up',
    border: 'hover:border-up/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--up)]',
    bar: 'bg-up',
  },
  gold: {
    text: 'text-gold',
    pill: 'bg-gold-soft text-gold',
    border: 'hover:border-gold/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--gold)]',
    bar: 'bg-gold',
  },
};

const ENGINE_ACCENT: Record<'telemetry' | 'contract' | 'discovery', string> = {
  telemetry: 'cobalt',
  contract: 'gold',
  discovery: 'up',
};

const ENGINES: {
  icon: 'telemetry' | 'contract' | 'discovery';
  tag: string;
  name: string;
  desc: string;
}[] = [
  {
    icon: 'telemetry',
    tag: 'Price, liquidity, volume',
    name: 'Dexscreener',
    desc: 'Market-health telemetry — liquidity depth, 24h volume, and price history for every tracked launch, pulled the same way for every launchpad with no exceptions.',
  },
  {
    icon: 'contract',
    tag: 'Contract & holder data',
    name: 'Blockscout',
    desc: "Contract verification status, LP-lock evidence, and top-10 holder concentration — read straight off the chain, never taken from a launchpad's own claims.",
  },
  {
    icon: 'discovery',
    tag: 'Launch discovery',
    name: 'Bitquery / Mobula',
    desc: "Documented factory addresses for the highest-volume launchpads, so new launches are found from a third party's published record — not reverse-engineered from scratch every time.",
  },
];

export const metadata: Metadata = {
  title: 'Assay — The Independent Standard for Robinhood Chain Launchpads',
  description:
    'Assay rigorously evaluates every launchpad on Robinhood Chain using objective on-chain telemetry and an open editorial methodology. Zero sponsored slots. Re-assessed continuously.',
};

const STEPS = [
  {
    n: '01',
    title: 'A launchpad gets added',
    desc: 'Name, slug, deployer address recorded. We check whether Bitquery or Mobula already documents its factory contracts before doing anything else.',
  },
  {
    n: '02',
    title: 'Its tokens get discovered',
    desc: `A one-time backfill pulls in every launch under ${MIN_BACKFILL_FULL_THRESHOLD}, or the most recent ${BACKFILL_SAMPLE_RATIO * 100}% of the upstream total for larger launchpads, capped at ${BACKFILL_SAMPLE_CAP.toLocaleString()}. See the sampling rule on the Coverage page.`,
  },
  {
    n: '03',
    title: 'It gets scored',
    desc: 'Five weighted dimensions — quality, mechanism, market health, value, consistency — composited into one number, gated by sample size before any star shows.',
  },
  {
    n: '04',
    title: 'It stays current',
    desc: "An hourly ingestion rotation refreshes metrics; a daily cronjob recomputes every score. No launchpad's number goes stale without a visible label.",
  },
];

export default async function HomePage() {
  const launchpads = await getLaunchpads();

  return (
    <>
      <Hero />

      {/* The method — five dimensions */}
      <section className="border-t border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <Reveal>
            <p className="mb-3 inline-block rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#141413]">
              The method
            </p>
            <h2 className="max-w-2xl text-xl font-semibold font-mono tracking-tight text-ink sm:text-2xl">
              A launchpad's homepage will tell you it's audited. None of that is
              evidence.
            </h2>
            <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-soft">
              Its Twitter will tell you it's verified. Ask any ranking where its
              numbers came from, and the honest answer is often: the platform
              handed them over. Assay reads five dimensions off the chain
              instead — nothing the launchpad said about itself.
            </p>
          </Reveal>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {DIMENSION_KEYS.map((key, i) => {
              const accent = ACCENT[ACCENT_ORDER[i % ACCENT_ORDER.length]];
              return (
                <Reveal key={key} delay={i * 0.05}>
                  <div
                    className={`dark-card group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border bg-[#141413] p-5 transition-all duration-300 ease-out hover:-translate-y-1.5 ${accent.border} ${accent.glow}`}
                  >
                    <span
                      className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[#6e6c63]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-sm font-bold text-[#f3f1ea]">
                          {DIMENSION_LABELS[key]}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-[#b5b2a6]">
                        {DIMENSION_DESCRIPTIONS[key]}
                      </p>
                    </div>
                    <span
                      className={`mt-4 inline-block w-fit rounded-full px-2.5 py-1 font-mono text-[11px] transition-colors duration-300 ${accent.pill}`}
                    >
                      Weight {(DIMENSION_WEIGHTS[key] * 100).toFixed(0)}%
                    </span>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <Reveal>
          <h2 className="text-lg font-semibold font-mono text-ink">
            How Assay works
          </h2>
          <p className="mt-1 max-w-xl text-[13.5px] text-muted">
            The same pipeline runs for every launchpad on {TARGET_CHAIN} —
            nothing is scored by hand, and nothing skips a step.
          </p>
        </Reveal>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const accent = ACCENT[ACCENT_ORDER[i % ACCENT_ORDER.length]];
            const isLast = i === STEPS.length - 1;
            return (
              <Reveal key={s.n} delay={i * 0.06}>
                <div
                  className={`dark-card group relative h-full overflow-hidden rounded-xl border bg-[#141413] p-5 transition-all duration-300 ease-out hover:-translate-y-1.5 ${accent.border} ${accent.glow}`}
                >
                  <span
                    className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[#6e6c63]">
                        {s.n}
                      </span>
                      <span className="text-sm font-bold text-[#f3f1ea]">
                        {s.title}
                      </span>
                    </div>
                    {!isLast && (
                      <span className="font-mono text-[11px] text-[#6e6c63] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        next →
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#b5b2a6]">
                    {s.desc}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={0.2} className="mt-4">
          <Link
            href="/coverage"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1.5 text-[12.5px] font-bold text-[#141413] transition-transform duration-200 hover:-translate-y-0.5"
          >
            See exactly what's indexed right now, live →
          </Link>
        </Reveal>
      </section>

      {/* Star legend */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <Reveal>
          <p className="mb-3 inline-block rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#141413]">
            The dossier
          </p>
          <h2 className="text-xl font-semibold font-mono tracking-tight text-ink sm:text-2xl">
            One to three stars. Earned, never sold.
          </h2>
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-soft">
            Assay takes nothing on the launchpad's word. Where the chain hasn't
            spoken loudly enough yet, the score is marked unfinished instead of
            finished for effect.
          </p>
        </Reveal>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Reveal delay={0.05}>
            <StarLegendCard
              stars={1}
              title="Notable"
              range={`${STAR_1_THRESHOLD}–${STAR_2_THRESHOLD - 1}`}
              desc="Viable launchpad with reliable execution and verified on-chain contracts."
            />
          </Reveal>
          <Reveal delay={0.1}>
            <StarLegendCard
              stars={2}
              title="Excellent"
              range={`${STAR_2_THRESHOLD}–${STAR_3_THRESHOLD - 1}`}
              desc="Among the best in its class — proven LP locks, consistent graduation, robust participant protections."
            />
          </Reveal>
          <Reveal delay={0.15}>
            <StarLegendCard
              stars={3}
              title="Exceptional"
              range={`${STAR_3_THRESHOLD}+`}
              desc="The ecosystem benchmark — zero confirmed-rugpull history and optimal DEX liquidity."
            />
          </Reveal>
        </div>

        <Reveal delay={0.2} className="mt-4">
          <Link
            href="/methodology"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1.5 text-[12.5px] font-bold text-[#141413] transition-transform duration-200 hover:-translate-y-0.5"
          >
            Read the full scoring methodology →
          </Link>
        </Reveal>
      </section>

      {/* Top ranked preview */}
      <section id="top-rated" className="border-t border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
          <div className="mb-6 flex items-end justify-between gap-4">
            <Reveal>
              <h2 className="text-lg font-semibold text-ink">
                Currently top-rated
              </h2>
              <p className="mt-1 text-[13.5px] text-muted">
                Confidence-gated — provisional scores are excluded from this
                preview.
              </p>
            </Reveal>
            <Link
              href="/rankings"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1.5 text-[12.5px] font-bold text-[#141413] transition-transform duration-200 hover:-translate-y-0.5"
            >
              Full rankings →
            </Link>
          </div>
          <TopRankedPreview launchpads={launchpads} />
        </div>
      </section>

      {/* Three engines */}
      <section className="border-y border-line bg-panel/40 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <p className="mb-3 inline-block rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#141413]">
              Adversarial on-chain scrutiny
            </p>
            <h2 className="max-w-xl text-xl font-semibold font-mono tracking-tight text-ink sm:text-2xl">
              Three engines. Zero courtesy.
            </h2>
            <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-ink-soft">
              We don't flatter launchpads into looking safe. Every score is
              synthesized from three independent sources — never from what a
              launchpad says about itself.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {ENGINES.map((e, i) => (
              <Reveal key={e.name} delay={i * 0.07}>
                <div className="dark-card group relative h-full overflow-hidden rounded-xl border bg-[#141413] p-5 transition-all duration-300 ease-out hover:-translate-y-1.5 hover:border-[#7a9cff]/40 hover:shadow-[0_16px_36px_-18px_rgba(122,156,255,0.35)]">
                  <span className="absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 rounded-t-xl bg-[#7a9cff] transition-transform duration-300 group-hover:scale-x-100" />
                  <span className="inline-block rounded-full border border-[#302f2a] px-2.5 py-1 font-mono text-[10.5px] text-[#b5b2a6]">
                    {e.tag}
                  </span>
                  <div className="mt-3 flex items-center gap-2.5">
                    <span
                      className={`pipeline-badge pipeline-badge-${ENGINE_ACCENT[e.icon]} grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-transform duration-300 group-hover:scale-110`}
                    >
                      <SourceIcon kind={e.icon} />
                    </span>
                    <h3 className="text-sm font-bold text-[#f3f1ea]">
                      {e.name}
                    </h3>
                  </div>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#b5b2a6]">
                    {e.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <Reveal>
          <div className="grid gap-3 sm:grid-cols-3">
            <TrustItem
              title="Published methodology"
              desc="Every threshold and weight is public and versioned — nothing scored by a black box."
            />
            <TrustItem
              title="No paid placement"
              desc="A launchpad's billing relationship with Assay cannot touch its own score. Enforced at the schema level."
            />
            <TrustItem
              title="Independent data only"
              desc="Scores read on-chain facts and third-party market data — never a launchpad's claims about itself."
            />
          </div>
        </Reveal>

        <Reveal delay={0.1} className="mt-14 text-center">
          <h2 className="mx-auto max-w-xl text-balance text-lg font-semibold font-mono leading-snug tracking-tight text-ink sm:text-xl">
            Somewhere on this chain, a launchpad is doing exactly what a rug
            does right now, in real time, un-flagged.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
            Assay's job is to catch it on the next hourly pass, not after the
            fact.
          </p>
          <Link
            href="/rankings"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1.5 text-[12.5px] font-bold text-[#141413] transition-transform duration-200 hover:-translate-y-0.5"
          >
            See the current directory →
          </Link>
        </Reveal>

        <Reveal
          delay={0.15}
          className="dark-card mt-10 flex flex-col items-start gap-3 rounded-2xl border bg-[#141413] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
        >
          <div>
            <div className="text-base font-bold text-[#f3f1ea]">
              Run a launchpad on {TARGET_CHAIN}?
            </div>
            <p className="mt-1 text-[13px] text-[#b5b2a6]">
              Get listed, or submit a correction to an existing entry — reviewed
              by a human, never auto-published.
            </p>
          </div>
          <Link
            href="/get-listed"
            className="shrink-0 rounded-lg bg-cobalt px-5 py-2.5 text-sm font-medium text-white"
          >
            Get listed
          </Link>
        </Reveal>
      </section>
    </>
  );
}

function StarLegendCard({
  stars,
  title,
  range,
  desc,
}: {
  stars: 1 | 2 | 3;
  title: string;
  range: string;
  desc: string;
}) {
  return (
    <div className="dark-card h-full rounded-xl border bg-[#141413] p-5">
      <span className="font-mono text-sm text-gold">
        {'★'.repeat(stars)}
        {'☆'.repeat(3 - stars)}
      </span>
      <div className="mt-1.5 text-sm font-bold text-[#f3f1ea]">{title}</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#b5b2a6]">
        {desc}
      </p>
      <span className="mt-3 inline-block font-mono text-[11px] text-[#6e6c63]">
        score {range}
      </span>
    </div>
  );
}

function TrustItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="dark-card rounded-xl border bg-[#141413] p-5">
      <div className="text-sm font-bold text-[#f3f1ea]">{title}</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#b5b2a6]">
        {desc}
      </p>
    </div>
  );
}
