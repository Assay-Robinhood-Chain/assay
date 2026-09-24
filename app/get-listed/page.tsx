'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Reveal from '@/components/Reveal';
import { PageIcon, type PageIconKind } from '@/components/icons/PageIcon';
import { createClient } from '@/lib/supabase/client';

/** Same accent treatment as the homepage's "method" / "How Assay works"
 * cards — border tint + glow shadow on hover, plus a top bar that wipes
 * in — cycled per card so neighbours never repeat the same accent. */
type Accent = 'cobalt' | 'up' | 'gold';
const ACCENT_ORDER: Accent[] = ['cobalt', 'up', 'gold'];
const ACCENT: Record<
  Accent,
  { pill: string; border: string; glow: string; bar: string }
> = {
  cobalt: {
    pill: 'bg-cobalt-soft text-cobalt',
    border: 'hover:border-cobalt/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--cobalt)]',
    bar: 'bg-cobalt',
  },
  up: {
    pill: 'bg-up-soft text-up',
    border: 'hover:border-up/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--up)]',
    bar: 'bg-up',
  },
  gold: {
    pill: 'bg-gold-soft text-gold',
    border: 'hover:border-gold/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_var(--gold)]',
    bar: 'bg-gold',
  },
};

const PROCESS_STEPS: { icon: PageIconKind; title: string; blurb: string }[] = [
  {
    icon: 'send',
    title: 'Submit',
    blurb: 'Add a launchpad, claim one, or correct a field.',
  },
  {
    icon: 'review',
    title: 'Peer review',
    blurb: 'A human moderator checks it — never the score.',
  },
  {
    icon: 'checkCircle',
    title: 'Reflected live',
    blurb: 'Approved changes appear on the launchpad page.',
  },
];

const CATEGORY_OPTIONS = [
  { value: 'new_launchpad', label: 'New Launchpad (not yet tracked)' },
  {
    value: 'team_verification',
    label: 'Team Verification (doxxed / pseudonymous)',
  },
  { value: 'website_docs', label: 'Website / Documentation Link' },
  { value: 'audit', label: 'Audit Report Link' },
  { value: 'deployer_address', label: 'Deployer / Factory Contract Address' },
  { value: 'note', label: 'General Correction or Note' },
];

// Categories that map onto one specific, already-tracked field on the
// launchpad row (see lib/supabase/queries.ts's LaunchpadRow) rather than
// being a free-text note about it. For these, the form shows a dedicated
// input — pre-labelled with the launchpad's current value — instead of
// asking the submitter to describe the change in prose. Kept in the same
// "Factory: X; Website: Y" shape app/api/admin/moderation/route.ts's
// parseNewLaunchpadValue() already parses for new_launchpad, so the same
// parser lifts these updates too once approved.
const FIELD_UPDATE_CONFIG: Record<
  string,
  { label: string; placeholder: string; prefixKey: 'Website' | 'Factory' }
> = {
  website_docs: {
    label: 'New Website URL',
    placeholder: 'https://…',
    prefixKey: 'Website',
  },
  deployer_address: {
    label: 'New Deployer / Factory Address',
    placeholder: '0x…',
    prefixKey: 'Factory',
  },
};

const NEW_LAUNCHPAD_VALUE = '__new__';

interface LaunchpadOption {
  slug: string;
  name: string;
  websiteUrl: string | null;
  deployerAddresses: string[];
  finalScore: number;
  stars: 0 | 1 | 2 | 3;
}

export default function SubmitPage() {
  const [launchpads, setLaunchpads] = useState<LaunchpadOption[]>([]);
  const [launchpadsLoading, setLaunchpadsLoading] = useState(true);
  const [launchpadsError, setLaunchpadsError] = useState<string | null>(null);

  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  // Starts empty rather than defaulting to the first mock entry — the
  // real list only exists once /api/launchpads resolves (see the
  // effect below), and there's no "first" launchpad to assume before then.
  const [launchpad, setLaunchpad] = useState<string>('');
  const [newLaunchpadName, setNewLaunchpadName] = useState('');
  const [factoryAddress, setFactoryAddress] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0].value);
  const [fieldValue, setFieldValue] = useState(''); // structured update, see FIELD_UPDATE_CONFIG
  const [context, setContext] = useState('');
  const [contact, setContact] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/launchpads');
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            body?.error?.message ?? `Request failed (${res.status})`,
          );
        }
        if (cancelled) return;
        const list: LaunchpadOption[] = body.launchpads ?? [];
        setLaunchpads(list);
        // Only claim the first real launchpad as the default when the
        // selector hasn't been touched yet — never stomp a choice the
        // person already made while this was loading.
        setLaunchpad(
          (current) => current || list[0]?.slug || NEW_LAUNCHPAD_VALUE,
        );
      } catch (err) {
        if (!cancelled) {
          setLaunchpadsError(
            err instanceof Error ? err.message : 'Failed to load launchpads.',
          );
          setLaunchpad((current) => current || NEW_LAUNCHPAD_VALUE);
        }
      } finally {
        if (!cancelled) setLaunchpadsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isNewLaunchpad = launchpad === NEW_LAUNCHPAD_VALUE;
  const launchpadLabel = isNewLaunchpad ? newLaunchpadName || null : launchpad;
  const selectedLaunchpad = useMemo(
    () => launchpads.find((lp) => lp.slug === launchpad) ?? null,
    [launchpads, launchpad],
  );
  const fieldUpdate = !isNewLaunchpad
    ? FIELD_UPDATE_CONFIG[category]
    : undefined;
  const currentFieldValue = !fieldUpdate
    ? null
    : fieldUpdate.prefixKey === 'Website'
      ? (selectedLaunchpad?.websiteUrl ?? null)
      : (selectedLaunchpad?.deployerAddresses[0] ?? null);

  // Category options depend on which "Launchpad" is selected above —
  // "New Launchpad (not yet tracked)" only makes sense together with
  // "+ New launchpad" up there, and MUST be paired with it. Without
  // this, picking an existing launchpad while the category defaulted
  // to "new_launchpad" produced a submission with field: 'new_launchpad'
  // but no Factory Contract Address (that input only renders when
  // isNewLaunchpad is true) — app/api/admin/moderation/route.ts's
  // onboardApprovedLaunchpad() only checks submission.field, so it
  // happily inserted a launchpad with deployer_addresses: [], which is
  // exactly the bug that left noxa-fun/pools-trade stuck at
  // sample_size 0 / a 422 on backfill. Decoupling was the actual root
  // cause, not the parsing or the required-field check.
  const categoryOptions = isNewLaunchpad
    ? CATEGORY_OPTIONS.filter((c) => c.value === 'new_launchpad')
    : CATEGORY_OPTIONS.filter((c) => c.value !== 'new_launchpad');

  // Keep `category` valid whenever `launchpad` flips between "+ New"
  // and an existing entry, instead of leaving a stale selection that
  // no longer belongs on the visible list.
  useEffect(() => {
    if (!categoryOptions.some((c) => c.value === category)) {
      setCategory(categoryOptions[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewLaunchpad]);

  // Reset the structured field value whenever the category or the
  // selected launchpad changes, so a leftover website URL typed for one
  // launchpad never gets silently submitted against a different one.
  useEffect(() => {
    setFieldValue('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, launchpad]);

  // What actually gets written to the `value` column. For a structured
  // field update this prepends "Website: X;" / "Factory: X;" — the same
  // shape parseNewLaunchpadValue() already looks for — so an admin
  // approval can apply it directly instead of re-typing it by hand.
  const composedValue = fieldUpdate
    ? `${fieldUpdate.prefixKey}: ${fieldValue};${context ? ` ${context}` : ''}`
    : isNewLaunchpad
      ? `Factory: ${factoryAddress};${websiteUrl ? ` Website: ${websiteUrl};` : ''} ${context}`
      : context;

  const payload = {
    launchpad: launchpadLabel,
    category,
    context: composedValue || null,
    contact: contact || null,
    status: 'pending',
    ...(submittedAt ? { submitted_at: submittedAt } : {}),
  };

  const hasAnyInput = Boolean(
    launchpadLabel || context || contact || fieldValue,
  );

  const canSubmit =
    Boolean(launchpadLabel) &&
    (isNewLaunchpad ? Boolean(factoryAddress) : true) &&
    (fieldUpdate ? Boolean(fieldValue) : Boolean(context));

  // Required inputs that are still empty, shown above the submit button
  // so the person knows exactly what's blocking "Submit".
  const missingFields: string[] = [];
  if (!launchpadLabel) {
    missingFields.push(isNewLaunchpad ? 'Launchpad name' : 'Launchpad');
  }
  if (isNewLaunchpad && !factoryAddress) {
    missingFields.push('Factory Contract Address');
  }
  if (fieldUpdate && !fieldValue) missingFields.push(fieldUpdate.label);
  if (!fieldUpdate && !context) missingFields.push('Description');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('submitting');
    setErrorMsg(null);

    // `category` doubles as the submission's `field` column — the
    // category IS the field being submitted about.
    const field = category;
    const slug = isNewLaunchpad ? newLaunchpadName : launchpad;
    const value = composedValue;

    // Writes directly to launchpad_submissions. RLS (see
    // supabase/migrations/0001_init.sql) allows a public INSERT only
    // with status = 'pending' — there is no policy letting this client
    // read it back, update it, or touch launchpads/scores. A human
    // moderates from here, per section 9 of the brief.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // No Supabase project configured yet — demo fallback so the form
      // is still explorable before the backend is wired up.
      setTimeout(() => {
        setSubmittedAt(new Date().toISOString());
        setStatus('done');
      }, 700);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from('launchpad_submissions').insert({
      launchpad_slug: slug,
      field,
      value,
      submitted_by: contact || null,
    });

    if (error) {
      setErrorMsg(error.message);
      setStatus('idle');
      return;
    }
    setSubmittedAt(new Date().toISOString());
    setStatus('done');
  }

  function reset() {
    setStatus('idle');
    setContext('');
    setContact('');
    setNewLaunchpadName('');
    setFactoryAddress('');
    setWebsiteUrl('');
    setFieldValue('');
    setSubmittedAt(null);
    setErrorMsg(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Reveal>
        <p className="mb-3 flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-cobalt">
          <PageIcon kind="send" size={13} />
          Get listed
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Add, claim, or correct a launchpad
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-soft">
          Submissions land as{' '}
          <span className="font-mono text-[13px]">pending</span> and are
          reviewed by a human before anything becomes public. This never affects
          a launchpad's score — independence doesn't bend for the launchpad that
          submitted the correction, per the deterministic score formula.
        </p>
      </Reveal>

      {/* Process strip — staggered entrance, level grid (aligned with Rankings' strip) */}
      <div className="card-surface mt-7 grid gap-3 sm:grid-cols-3">
        {PROCESS_STEPS.map((s, i) => {
          const accent = ACCENT[ACCENT_ORDER[i % ACCENT_ORDER.length]];
          return (
            <Reveal key={s.title} delay={0.05 + i * 0.06}>
              <div
                className={`group relative flex items-start gap-3 overflow-hidden rounded-xl border border-line bg-card p-4 transition-all duration-300 ease-out hover:-translate-y-1.5 ${accent.border} ${accent.glow}`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
                />
                <span
                  className={`icon-chip grid h-8 w-8 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-semibold transition-colors duration-300 ${accent.pill}`}
                >
                  <PageIcon kind={s.icon} size={15} />
                </span>
                <div>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    <span className="font-mono text-[10.5px] text-faint">
                      0{i + 1}
                    </span>
                    {s.title}
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                    {s.blurb}
                  </p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      <div className="card-surface mt-8 grid gap-6 lg:grid-cols-2">
        {/* Left — the form */}
        <Reveal delay={0.06}>
          <div className="card-hover rounded-2xl border border-line bg-card p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {status === 'done' ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="py-6 text-center"
                >
                  <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-up-soft text-up">
                    ✓
                  </div>
                  <p className="text-sm font-medium text-ink">
                    Submission received
                  </p>
                  <p className="mt-1 text-[13px] text-muted">
                    It's in the moderation queue now. You'll see it reflected on
                    the launchpad's page once verified.
                  </p>
                  <p className="mx-auto mt-3 max-w-sm rounded-lg border border-line bg-paper px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
                    Please allow up to 1×24 hours for the review and for your
                    data to be added.
                  </p>
                  <button
                    onClick={reset}
                    className="mt-5 text-[13px] text-cobalt hover:underline"
                  >
                    Submit another
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onSubmit={handleSubmit}
                  className="space-y-5"
                >
                  <div>
                    <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                      Launchpad
                    </label>
                    <select
                      value={launchpad}
                      onChange={(e) => setLaunchpad(e.target.value)}
                      disabled={launchpadsLoading}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt disabled:opacity-60"
                    >
                      <option value={NEW_LAUNCHPAD_VALUE}>
                        + New launchpad (not yet tracked)
                      </option>
                      {launchpadsLoading && (
                        <option>Loading launchpads…</option>
                      )}
                      {launchpads.map((lp) => (
                        <option key={lp.slug} value={lp.slug}>
                          {lp.name}
                        </option>
                      ))}
                    </select>
                    {launchpadsError && (
                      <p className="mt-1.5 text-[11.5px] text-down">
                        Couldn't load the live launchpad list ({launchpadsError}
                        ) — you can still submit a new launchpad below.
                      </p>
                    )}
                  </div>

                  {isNewLaunchpad && (
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                        Launchpad name
                      </label>
                      <input
                        required
                        value={newLaunchpadName}
                        onChange={(e) => setNewLaunchpadName(e.target.value)}
                        placeholder="e.g. Meridian Launch"
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
                      />
                    </div>
                  )}

                  {isNewLaunchpad && (
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                        Factory Contract Address
                      </label>
                      <input
                        required
                        value={factoryAddress}
                        onChange={(e) => setFactoryAddress(e.target.value)}
                        placeholder="0x…"
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-sm text-ink outline-none focus-visible:border-cobalt"
                      />
                      <p className="mt-1.5 text-[11.5px] text-faint">
                        Required for a new launchpad — this is what lets Assay
                        discover and count its token launches. Without it, the
                        listing gets added but can never be scored.
                      </p>
                    </div>
                  )}

                  {isNewLaunchpad && (
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                        Website (optional)
                      </label>
                      <input
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://…"
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
                      />
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                      Information Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
                    >
                      {categoryOptions.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Structured update — only for categories that map onto one
                      specific tracked field (see FIELD_UPDATE_CONFIG above). */}
                  {fieldUpdate && (
                    <div>
                      <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                        {fieldUpdate.label}
                      </label>
                      <input
                        required
                        value={fieldValue}
                        onChange={(e) => setFieldValue(e.target.value)}
                        placeholder={fieldUpdate.placeholder}
                        className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 font-mono text-sm text-ink outline-none focus-visible:border-cobalt"
                      />
                      <p className="mt-1.5 text-[11.5px] text-faint">
                        {selectedLaunchpad ? (
                          currentFieldValue ? (
                            <>
                              Currently on file:{' '}
                              <span className="font-mono">
                                {currentFieldValue}
                              </span>
                            </>
                          ) : (
                            'Nothing on file yet for this launchpad.'
                          )
                        ) : (
                          'Select a launchpad above to see its current value.'
                        )}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                      {fieldUpdate
                        ? 'Additional Description (optional)'
                        : 'Description'}
                    </label>
                    <textarea
                      required={!fieldUpdate}
                      rows={4}
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder="Describe the launchpad, or add any supporting links here…"
                      className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
                    />
                    {category !== 'note' && (
                      <p className="mt-1.5 text-[11.5px] text-faint">
                        URLs are validated before Assay ever fetches them: HTTPS
                        only, private/reserved IP ranges rejected
                        post-DNS-resolution, redirects re-validated with a hard
                        cap.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                      Contact Wallet or Twitter Handle
                    </label>
                    <input
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="0x… or @handle"
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
                    />
                    <p className="mt-1.5 text-[11.5px] text-faint">
                      Used solely if verification team requires clarification.
                    </p>
                  </div>

                  {missingFields.length > 0 && (
                    <div
                      role="status"
                      className="rounded-lg border border-line bg-paper px-3 py-2.5 text-[12.5px] text-ink-soft"
                    >
                      <p className="font-semibold text-ink">
                        Still required before you can submit:
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {missingFields.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {errorMsg && (
                    <p className="rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-[12.5px] text-down">
                      {errorMsg}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === 'submitting' || !canSubmit}
                    className="w-full rounded-lg bg-ink py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {status === 'submitting'
                      ? 'Submitting…'
                      : 'Submit for Peer Review'}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </Reveal>

        {/* Right — live request payload preview */}
        <Reveal delay={0.12}>
          <div className="card-hover h-full rounded-2xl border border-line bg-panel p-6 font-mono text-[12.5px] leading-relaxed sm:p-8">
            <div className="mb-4 flex items-center gap-2 text-ink-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-up" />
              <span>POST /submissions</span>
            </div>

            {hasAnyInput ? (
              <pre className="whitespace-pre-wrap break-words text-ink-soft">
                {JSON.stringify(payload, null, 2)}
              </pre>
            ) : (
              <p className="text-faint">
                <span className="block">
                  // fill out form on the left, then click submit
                </span>
                <span className="block">
                  // to inspect verified submission payload
                </span>
              </p>
            )}

            {status === 'done' && (
              <p className="mt-4 text-up">
                // 201 Created — queued for peer review
              </p>
            )}
          </div>
        </Reveal>
      </div>

      <p className="mt-6 text-[12.5px] text-muted">
        Initial status of every submission:{' '}
        <span className="card-surface rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
          PENDING
        </span>{' '}
        — kept private until verified by peer review.
      </p>
    </div>
  );
}
