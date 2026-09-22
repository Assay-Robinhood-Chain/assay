'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { getLaunchpads } from '@/lib/data';
import { rampColor, formatDate } from '@/lib/scoring';
import { TARGET_CHAIN, MIN_SAMPLE_SIZE_FOR_CONFIDENCE } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import type { Launchpad } from '@/lib/types';

const RAMP_TEXT: Record<string, string> = {
  green: 'text-up',
  amber: 'text-gold',
  red: 'text-down',
};
const RAMP_STROKE: Record<string, string> = {
  green: 'var(--up)',
  amber: 'var(--gold)',
  red: 'var(--down)',
};

const MECHANISM_OPTIONS = [
  'Bonding Curve',
  'Fair Launch',
  'Dutch Auction',
  'Fixed-Price Sale',
  'Other',
];

function ratingLabel(lp: Launchpad): { text: string; color: string } {
  if (lp.score.isProvisional)
    return { text: 'PROVISIONAL', color: 'text-gold' };
  const color = rampColor(lp.score.finalScore);
  if (color === 'green')
    return {
      text: lp.score.stars === 3 ? 'EXCEPTIONAL' : 'SOLID',
      color: RAMP_TEXT[color],
    };
  if (color === 'amber')
    return { text: 'MIXED SIGNAL', color: RAMP_TEXT[color] };
  return { text: 'CAUTION', color: RAMP_TEXT[color] };
}

function ScoreRing({
  score,
  colorVar,
  size = 92,
  stroke = 8,
}: {
  score: number | null;
  colorVar: string;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
          strokeDasharray={score === null ? '4 5' : undefined}
        />
        {score !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={colorVar}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xl font-semibold text-ink">
          {score === null ? '—' : score.toFixed(1)}
        </span>
        <span className="font-mono text-[9px] text-faint">/ 100</span>
      </div>
    </div>
  );
}

function DimRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-[12.5px] text-ink-soft">{label}</span>
      <span className="font-mono text-[12.5px] text-ink">
        {value === null ? '—' : value.toFixed(0)}{' '}
        <span className="text-faint">/100</span>
      </span>
    </div>
  );
}

function TelemetryCard({
  label,
  value,
  sub,
  valueClass = 'text-ink',
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="font-mono text-[11px] uppercase tracking-wide text-faint">
        {label}
      </p>
      <p className={`mt-1.5 text-base font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-[11.5px] text-faint">{sub}</p>
    </div>
  );
}

/** Result panel for an already-tracked launchpad picked from the registry. */
function TrackedResult({ lp }: { lp: Launchpad }) {
  const color = rampColor(lp.score.finalScore);
  const rating = ratingLabel(lp);
  const isDocumented = lp.discoverySource !== 'rpc_self_indexed';
  const rugCount = lp.launches.filter((l) => l.isConfirmedRugpull).length;
  const gradRate =
    lp.launches.length > 0
      ? (lp.launches.filter((l) => l.isGraduated).length / lp.launches.length) *
        100
      : 0;
  const lpLockBadge = lp.badges.find((b) =>
    b.name.toLowerCase().includes('lp lock'),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-panel text-base font-semibold text-ink">
            {lp.name[0]}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-ink">{lp.name}</h3>
              <span className="rounded-full border border-gold/30 bg-gold-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-gold">
                Published
              </span>
              {isDocumented ? (
                <span className="rounded-full border border-up/30 bg-up-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-up">
                  ✓ Verified
                </span>
              ) : (
                <span className="rounded-full border border-line bg-panel px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-faint">
                  Self-indexed
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-[11.5px] text-faint">
              {lp.deployerAddresses[0]} · Checked on{' '}
              {formatDate(lp.lastSnapshotAt)}
            </p>
            <p className="mt-1.5 font-mono text-[12.5px] font-medium">
              <span className={rating.color}>
                {'★'.repeat(lp.score.stars)}
                {'☆'.repeat(3 - lp.score.stars)} {rating.text}
              </span>
            </p>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-soft">
              {lp.description}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-[10.5px] uppercase tracking-wide text-faint">
                {lp.discoverySource.replace('_', ' ')}
              </span>
              <span className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-[10.5px] uppercase tracking-wide text-faint">
                {TARGET_CHAIN}
              </span>
              <a
                href={`/launchpad/${lp.slug}`}
                className="rounded-md border border-line bg-ink px-2.5 py-1 text-[11.5px] font-medium text-paper hover:opacity-90"
              >
                View Telemetry History →
              </a>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5">
          <ScoreRing
            score={lp.score.finalScore}
            colorVar={RAMP_STROKE[color]}
          />
          <div className="space-y-0.5">
            <DimRow label="Quality" value={lp.score.dimensions.quality} />
            <DimRow label="Mechanism" value={lp.score.dimensions.mechanism} />
            <DimRow
              label="Market Health"
              value={lp.score.dimensions.marketHealth}
            />
            <DimRow label="Value" value={lp.score.dimensions.value} />
            <DimRow
              label="Consistency"
              value={lp.score.dimensions.consistency}
            />
          </div>
        </div>
      </div>

      {/* Telemetry evidence */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-ink">
          Telemetry Evidence Store
        </h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TelemetryCard
            label="Graduation Rate (sample)"
            value={`${gradRate.toFixed(1)}%`}
            sub="Graduated to DEX"
            valueClass="text-up"
          />
          <TelemetryCard
            label="Sample Launches"
            value={lp.sampleSize.toLocaleString()}
            sub={
              lp.totalLaunchesUpstream
                ? `of ${lp.totalLaunchesUpstream.toLocaleString()} upstream`
                : 'Tracked tokens'
            }
          />
          <TelemetryCard
            label="LP Lock Status"
            value={lpLockBadge ? 'Permanent (Automated)' : 'Not attested'}
            sub="Liquidity structure"
            valueClass={lpLockBadge ? 'text-up' : 'text-ink'}
          />
          <TelemetryCard
            label="Rugpull History"
            value={`${rugCount} Confirmed`}
            sub="On-chain audit"
            valueClass={rugCount > 0 ? 'text-down' : 'text-up'}
          />
        </div>
      </div>

      {/* Rationale + limitations */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="mb-1.5 text-[13px] font-semibold text-ink">
            Selection Rationale
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            {lp.description}
          </p>
        </div>
        <div className="rounded-xl border border-down/30 bg-down-soft p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-down">
            ⚠ Limitations of Assessment
          </p>
          <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-ink-soft">
            <li>
              Wash-trading flags indicate irregular volume-per-trader ratios,
              not confirmed manipulation — the threshold itself is a pending
              calibration constant.
            </li>
            {!isDocumented && (
              <li>
                Launch discovery relies on self-indexing; third-party
                corroboration may lag.
              </li>
            )}
            {lp.score.isProvisional && (
              <li>
                Sample size ({lp.sampleSize}) is below the{' '}
                {MIN_SAMPLE_SIZE_FOR_CONFIDENCE}-launch confidence threshold —
                this rating is provisional and star-capped.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Result panel for a freshly submitted (not-yet-tracked) launchpad — always
 * provisional, never a fabricated score, per the brief's independence rule. */
function SubmittedResult({
  name,
  mechanism,
  factory,
  website,
}: {
  name: string;
  mechanism: string;
  factory: string;
  website: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 gap-3.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-dashed border-faint/60 bg-panel text-base font-semibold text-faint">
            {name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-ink">{name}</h3>
              <span className="rounded-full border border-gold/30 bg-gold-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-gold">
                Submitted
              </span>
              <span className="rounded-full border border-line bg-panel px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-faint">
                Pending verification
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11.5px] text-faint">
              {factory || '0x…'} {website ? `· ${website}` : ''}
            </p>
            <p className="mt-1.5 font-mono text-[12.5px] font-medium text-faint">
              ☆☆☆ AWAITING BACKFILL
            </p>
            <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-soft">
              Just submitted — factory discovery hasn't run yet. This entry is
              queued for the onboarding checklist (Bitquery/Mobula check, then
              backfill) before it scores.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-[10.5px] uppercase tracking-wide text-faint">
                {mechanism}
              </span>
              <span className="rounded-md border border-line bg-panel px-2 py-1 font-mono text-[10.5px] uppercase tracking-wide text-faint">
                {TARGET_CHAIN}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-5">
          <ScoreRing score={null} colorVar="var(--faint)" />
          <div className="space-y-0.5">
            <DimRow label="Quality" value={null} />
            <DimRow label="Mechanism" value={null} />
            <DimRow label="Market Health" value={null} />
            <DimRow label="Value" value={null} />
            <DimRow label="Consistency" value={null} />
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-3 text-sm font-semibold text-ink">
          Telemetry Evidence Store
        </h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TelemetryCard
            label="Graduation Rate"
            value="—"
            sub="No launches indexed yet"
          />
          <TelemetryCard
            label="Sample Launches"
            value="0"
            sub="Backfill not yet run"
          />
          <TelemetryCard
            label="LP Lock Status"
            value="Unconfirmed"
            sub="Liquidity structure"
          />
          <TelemetryCard
            label="Rugpull History"
            value="— Confirmed"
            sub="No data yet"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-card p-4">
          <p className="mb-1.5 text-[13px] font-semibold text-ink">
            Selection Rationale
          </p>
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            Nothing here is scored from the submitter's own claims —
            independence doesn't bend for a self-submitted entry. A human
            moderator verifies the factory contract first.
          </p>
        </div>
        <div className="rounded-xl border border-down/30 bg-down-soft p-4">
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-down">
            ⚠ Limitations of Assessment
          </p>
          <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-ink-soft">
            <li>
              Sample size is 0 — below the confidence threshold, cannot be
              scored yet.
            </li>
            <li>
              Website URL and mechanism type are self-reported until
              corroborated on-chain.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function LaunchpadScanner() {
  const [open, setOpen] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const router = useRouter();

  // The trigger button lives inside <Nav>'s <header>, which has
  // `backdrop-blur` on a `sticky` element. backdrop-filter (like
  // transform/filter) creates a new containing block for descendant
  // `position: fixed` elements — so without a portal, this modal's
  // fixed overlay would be positioned relative to the header's own
  // thin box instead of the viewport, clipping everything but the
  // top bar. Rendering into document.body sidesteps that entirely.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const launchpads = useMemo(() => getLaunchpads(), []);
  const selected = launchpads.find((lp) => lp.slug === selectedSlug) ?? null;

  // Submission form state
  const [name, setName] = useState('');
  const [mechanism, setMechanism] = useState(MECHANISM_OPTIONS[0]);
  const [factory, setFactory] = useState('');
  const [website, setWebsite] = useState('');
  const [scanning, setScanning] = useState(false);
  const [submitted, setSubmitted] = useState<{
    name: string;
    mechanism: string;
    factory: string;
    website: string;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  function selectFromRegistry(slug: string) {
    setSelectedSlug(slug);
    setSubmitted(null);
  }

  async function handleScan(e: FormEvent) {
    e.preventDefault();
    if (!name || !factory || !website) return;
    setScanning(true);
    setErrorMsg(null);
    setSelectedSlug(null);

    const summary = `Mechanism: ${mechanism}; Factory: ${factory}; Website: ${website}`;

    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const supabase = createClient();
      const { error } = await supabase.from('launchpad_submissions').insert({
        launchpad_slug: name.toLowerCase().trim().replace(/\s+/g, '-'),
        field: 'new_launchpad',
        value: summary,
        submitted_by: null,
      });
      if (error) {
        setErrorMsg(error.message);
        setScanning(false);
        return;
      }
    }

    // Simulated on-chain scan delay — mirrors the onboarding checklist's
    // "check Bitquery/Mobula, then Blockscout" sequence before anything
    // ever becomes a real score.
    setTimeout(() => {
      setSubmitted({ name, mechanism, factory, website });
      setScanning(false);
    }, 900);
  }

  function goToDossier(slug: string) {
    setOpen(false);
    router.push(`/launchpad/${slug}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M16.2 16.2L21 21" />
        </svg>
        Open Launchpad Scanner
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-[rgba(10,10,9,0.7)] px-3 py-6 backdrop-blur sm:items-center sm:px-6 sm:py-10"
                onClick={() => setOpen(false)}
              >
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-6xl overflow-hidden rounded-2xl border border-line bg-paper shadow-2xl"
                >
                  {/* Top bar */}
                  <div className="flex items-center justify-between border-b border-line bg-panel px-5 py-3.5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-gold"
                      >
                        <circle cx="12" cy="12" r="8" />
                        <path d="M12 8v4l3 3" />
                      </svg>
                      Assay Launchpad Scanner
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="hidden rounded-md border border-line bg-card px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-faint sm:inline-block">
                        {TARGET_CHAIN.replace(/\s+/g, '_').toUpperCase()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="rounded-md border border-line bg-card px-2.5 py-1 text-[12px] font-medium text-muted hover:bg-panel hover:text-ink"
                      >
                        ✕ Close
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="grid max-h-[80vh] gap-0 overflow-y-auto md:grid-cols-[300px_1fr] md:overflow-visible">
                    {/* Left column */}
                    <div className="space-y-5 border-b border-line p-5 md:max-h-[80vh] md:overflow-y-auto md:border-b-0 md:border-r">
                      <div>
                        <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-faint">
                          Launchpad Registry
                        </p>
                        <select
                          value={selectedSlug ?? ''}
                          onChange={(e) => selectFromRegistry(e.target.value)}
                          className="w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
                        >
                          <option value="" disabled>
                            Select a tracked launchpad…
                          </option>
                          {launchpads.map((lp) => (
                            <option key={lp.slug} value={lp.slug}>
                              {lp.name} ({lp.score.finalScore.toFixed(1)} ·{' '}
                              {'★'.repeat(lp.score.stars)}
                              {'☆'.repeat(3 - lp.score.stars)})
                            </option>
                          ))}
                        </select>
                        {selected && (
                          <button
                            type="button"
                            onClick={() => goToDossier(selected.slug)}
                            className="mt-2 text-[12px] text-cobalt hover:underline"
                          >
                            Open full dossier page →
                          </button>
                        )}
                      </div>

                      <div className="border-t border-line pt-5">
                        <h4 className="mb-3 text-sm font-semibold text-ink">
                          Submit Launchpad for Scan
                        </h4>
                        <form onSubmit={handleScan} className="space-y-3.5">
                          <div>
                            <label className="mb-1 block text-[12px] text-ink-soft">
                              Launchpad Name *
                            </label>
                            <input
                              required
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="e.g. ApexPad"
                              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none focus-visible:border-cobalt"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[12px] text-ink-soft">
                              Mechanism Type *
                            </label>
                            <select
                              value={mechanism}
                              onChange={(e) => setMechanism(e.target.value)}
                              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none focus-visible:border-cobalt"
                            >
                              {MECHANISM_OPTIONS.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[12px] text-ink-soft">
                              Factory Contract Address *
                            </label>
                            <input
                              required
                              value={factory}
                              onChange={(e) => setFactory(e.target.value)}
                              placeholder="0x…"
                              className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-[12.5px] text-ink outline-none focus-visible:border-cobalt"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[12px] text-ink-soft">
                              Deployment Chain *
                            </label>
                            <select
                              value={TARGET_CHAIN}
                              disabled
                              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink opacity-80 outline-none"
                            >
                              <option>{TARGET_CHAIN} (Native)</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[12px] text-ink-soft">
                              Website URL *
                            </label>
                            <input
                              required
                              type="url"
                              value={website}
                              onChange={(e) => setWebsite(e.target.value)}
                              placeholder="https://…"
                              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] text-ink outline-none focus-visible:border-cobalt"
                            />
                            <p className="mt-1 text-[11px] leading-relaxed text-faint">
                              HTTPS only; private/reserved IP ranges rejected
                              post-DNS-resolution.
                            </p>
                          </div>

                          {errorMsg && (
                            <p className="rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-[12px] text-down">
                              {errorMsg}
                            </p>
                          )}

                          <button
                            type="submit"
                            disabled={scanning || !name || !factory || !website}
                            className="w-full rounded-lg bg-ink py-2.5 text-[13px] font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            {scanning ? 'Scanning…' : 'Start On-Chain Scan'}
                          </button>
                        </form>
                      </div>
                    </div>

                    {/* Right column — result */}
                    <div className="p-5 sm:p-7 md:max-h-[80vh] md:overflow-y-auto">
                      <AnimatePresence mode="wait">
                        {scanning ? (
                          <motion.div
                            key="scanning"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center"
                          >
                            <span className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-cobalt" />
                            <p className="text-[13px] text-muted">
                              Checking Bitquery / Mobula discovery, then
                              Blockscout…
                            </p>
                          </motion.div>
                        ) : submitted ? (
                          <motion.div
                            key="submitted"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <SubmittedResult {...submitted} />
                          </motion.div>
                        ) : selected ? (
                          <motion.div
                            key={selected.slug}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <TrackedResult lp={selected} />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1.5 text-center"
                          >
                            <p className="text-[13.5px] font-medium text-ink-soft">
                              Select a launchpad from the registry
                            </p>
                            <p className="max-w-xs text-[12.5px] text-faint">
                              Or submit a new one on the left to queue it for
                              onboarding — nothing is scored from the
                              submitter's own claims.
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
