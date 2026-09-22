'use client';

import { useMemo, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Reveal from '@/components/Reveal';
import { getLaunchpads } from '@/lib/data';
import { createClient } from '@/lib/supabase/client';

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

const NEW_LAUNCHPAD_VALUE = '__new__';

export default function SubmitPage() {
  const launchpads = useMemo(() => getLaunchpads(), []);

  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [launchpad, setLaunchpad] = useState(
    launchpads[0]?.slug ?? NEW_LAUNCHPAD_VALUE,
  );
  const [newLaunchpadName, setNewLaunchpadName] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0].value);
  const [context, setContext] = useState('');
  const [contact, setContact] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const isNewLaunchpad = launchpad === NEW_LAUNCHPAD_VALUE;
  const launchpadLabel = isNewLaunchpad ? newLaunchpadName || null : launchpad;

  const payload = {
    launchpad: launchpadLabel,
    category,
    context: context || null,
    contact: contact || null,
    status: 'pending',
    ...(submittedAt ? { submitted_at: submittedAt } : {}),
  };

  const hasAnyInput = Boolean(launchpadLabel || context || contact);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!launchpadLabel || !context) return;
    setStatus('submitting');
    setErrorMsg(null);

    // `category` doubles as the submission's `field` column — the
    // category IS the field being submitted about.
    const field = category;
    const slug = isNewLaunchpad ? newLaunchpadName : launchpad;

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
      value: context,
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
    setSubmittedAt(null);
    setErrorMsg(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Reveal>
        <p className="mb-3 font-mono text-[12px] uppercase tracking-[0.14em] text-cobalt">
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

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Left — the form */}
        <Reveal delay={0.06}>
          <div className="rounded-2xl border border-line bg-card p-6 sm:p-8">
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
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
                    >
                      {launchpads.map((lp) => (
                        <option key={lp.slug} value={lp.slug}>
                          {lp.name}
                        </option>
                      ))}
                      <option value={NEW_LAUNCHPAD_VALUE}>
                        + New launchpad (not yet tracked)
                      </option>
                    </select>
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

                  <div>
                    <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                      Information Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[13px] font-semibold text-ink">
                      Context / Supporting Links
                    </label>
                    <textarea
                      required
                      rows={4}
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder="Provide details or paste transaction/commit links here…"
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

                  {errorMsg && (
                    <p className="rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-[12.5px] text-down">
                      {errorMsg}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={
                      status === 'submitting' || !context || !launchpadLabel
                    }
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
          <div className="h-full rounded-2xl border border-line bg-panel p-6 font-mono text-[12.5px] leading-relaxed sm:p-8">
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
        <span className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
          PENDING
        </span>{' '}
        — kept private until verified by peer review.
      </p>
    </div>
  );
}
