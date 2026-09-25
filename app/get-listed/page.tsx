'use client';

import { useEffect, useMemo, useState, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Reveal from '@/components/Reveal';
import { PageIcon, type PageIconKind } from '@/components/icons/PageIcon';
import { createClient } from '@/lib/supabase/client';

type Accent = 'cobalt' | 'up' | 'gold';

const ACCENT_ORDER: Accent[] = ['cobalt', 'up', 'gold'];

const ACCENT: Record<
  Accent,
  { pill: string; border: string; glow: string; bar: string }
> = {
  cobalt: {
    pill: 'bg-[#e8e402]/10 text-[#e8e402]',
    border: 'hover:border-[#e8e402]/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_#e8e402]',
    bar: 'bg-[#e8e402]',
  },
  up: {
    pill: 'bg-[#e8e402]/10 text-[#e8e402]',
    border: 'hover:border-[#e8e402]/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_#e8e402]',
    bar: 'bg-[#e8e402]',
  },
  gold: {
    pill: 'bg-[#e8e402]/10 text-[#e8e402]',
    border: 'hover:border-[#e8e402]/50',
    glow: 'hover:shadow-[0_14px_36px_-16px_#e8e402]',
    bar: 'bg-[#e8e402]',
  },
};

const PROCESS_STEPS: {
  icon: PageIconKind;
  title: string;
  blurb: string;
}[] = [
  {
    icon: 'send',
    title: 'Submit',
    blurb: 'Add a launchpad, claim one, or correct a field.',
  },
  {
    icon: 'review',
    title: 'Peer review',
    blurb: 'A human moderator checks it never the score.',
  },
  {
    icon: 'checkCircle',
    title: 'Reflected live',
    blurb: 'Approved changes appear on the launchpad page.',
  },
];

const CATEGORY_OPTIONS = [
  {
    value: 'new_launchpad',
    label: 'New Launchpad (not yet tracked)',
  },
  {
    value: 'team_verification',
    label: 'Team Verification (doxxed / pseudonymous)',
  },
  {
    value: 'website_docs',
    label: 'Website / Documentation Link',
  },
  {
    value: 'audit',
    label: 'Audit Report Link',
  },
  {
    value: 'deployer_address',
    label: 'Deployer / Factory Contract Address',
  },
  {
    value: 'note',
    label: 'General Correction or Note',
  },
];

const FIELD_UPDATE_CONFIG: Record<
  string,
  {
    label: string;
    placeholder: string;
    prefixKey: 'Website' | 'Factory';
  }
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

  const [launchpad, setLaunchpad] = useState<string>('');
  const [newLaunchpadName, setNewLaunchpadName] = useState('');
  const [factoryAddress, setFactoryAddress] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [category, setCategory] = useState(CATEGORY_OPTIONS[0].value);
  const [fieldValue, setFieldValue] = useState('');
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

  const categoryOptions = isNewLaunchpad
    ? CATEGORY_OPTIONS.filter((c) => c.value === 'new_launchpad')
    : CATEGORY_OPTIONS.filter((c) => c.value !== 'new_launchpad');

  useEffect(() => {
    if (!categoryOptions.some((c) => c.value === category)) {
      setCategory(categoryOptions[0].value);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewLaunchpad]);

  useEffect(() => {
    setFieldValue('');

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, launchpad]);

  const composedValue = fieldUpdate
    ? `${fieldUpdate.prefixKey}: ${fieldValue};${context ? ` ${context}` : ''}`
    : isNewLaunchpad
      ? `Factory: ${factoryAddress};${
          websiteUrl ? ` Website: ${websiteUrl};` : ''
        } ${context}`
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

  const missingFields: string[] = [];

  if (!launchpadLabel) {
    missingFields.push(isNewLaunchpad ? 'Launchpad name' : 'Launchpad');
  }

  if (isNewLaunchpad && !factoryAddress) {
    missingFields.push('Factory Contract Address');
  }

  if (fieldUpdate && !fieldValue) {
    missingFields.push(fieldUpdate.label);
  }

  if (!fieldUpdate && !context) {
    missingFields.push('Description');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!canSubmit) return;

    setStatus('submitting');
    setErrorMsg(null);

    const field = category;
    const slug = isNewLaunchpad ? newLaunchpadName : launchpad;
    const value = composedValue;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
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
        <p className="mb-3 inline-block rounded-full border border-[#141413] bg-[#e8e402] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#141413]">
          Public submission
        </p>

        <h1 className="font-mono text-3xl font-semibold tracking-tight text-ink">
          Add, claim, or correct a launchpad
        </h1>

        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-ink-soft">
          Submissions are published only after human review. A correction can
          update launchpad information, but it can never influence the
          deterministic score itself.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {PROCESS_STEPS.map((step, i) => {
          const accent = ACCENT[ACCENT_ORDER[i % ACCENT_ORDER.length]];

          return (
            <Reveal key={step.title} delay={0.05 + i * 0.06}>
              <section
                className={`dark-card group relative h-full overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 ${accent.border} ${accent.glow}`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${accent.bar}`}
                />

                <div className="mb-3 flex items-center gap-3">
                  <span className="weight-pill grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition-transform duration-300 group-hover:scale-110">
                    <PageIcon kind={step.icon} size={16} />
                  </span>

                  <h2 className="font-mono text-base font-bold text-[#f3f1ea]">
                    {step.title}
                  </h2>
                </div>

                <p className="text-[13px] leading-relaxed text-[#b5b2a6]">
                  {step.blurb}
                </p>
              </section>
            </Reveal>
          );
        })}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Reveal delay={0.06}>
          <section
            className={`dark-card group relative h-full overflow-hidden rounded-2xl border bg-[#141413] p-6 transition-all duration-300 ease-out hover:-translate-y-1.5 ${ACCENT.cobalt.border} ${ACCENT.cobalt.glow} sm:p-8`}
          >
            <span
              className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.cobalt.bar}`}
            />

            <div className="mb-6">
              <h2 className="font-mono text-lg font-bold text-[#f3f1ea]">
                Submission details
              </h2>

              <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6e6c63]">
                Provide the information you want Assay to verify.
              </p>
            </div>

            <AnimatePresence mode="wait">
              {status === 'done' ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="py-8 text-center"
                >
                  <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-up-soft text-up">
                    ✓
                  </div>

                  <p className="font-mono text-sm font-semibold text-[#f3f1ea]">
                    Submission received
                  </p>

                  <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-[#b5b2a6]">
                    It&apos;s in the moderation queue now. You&apos;ll see it
                    reflected on the launchpad&apos;s page once verified.
                  </p>

                  <div className="mx-auto mt-4 flex max-w-sm items-center gap-3 rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3.5 py-3 text-left">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e0b04d]/12 text-[#e0b04d]">
                      <PageIcon kind="hourglass" size={15} />
                    </span>
                    <p className="text-[12.5px] leading-relaxed text-[#6e6c63]">
                      Please allow up to{' '}
                      <span className="font-mono text-[14px] font-bold text-[#e0b04d]">
                        1×24 hours
                      </span>{' '}
                      for the review and for your data to be added.
                    </p>
                  </div>

                  <button
                    onClick={reset}
                    className="mt-5 font-mono text-[12px] text-cobalt hover:underline"
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
                  <DarkField label="Launchpad">
                    <select
                      value={launchpad}
                      onChange={(e) => setLaunchpad(e.target.value)}
                      disabled={launchpadsLoading}
                      className="w-full rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 text-sm text-[#f3f1ea] outline-none transition-colors focus-visible:border-cobalt"
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
                        Couldn&apos;t load the live launchpad list (
                        {launchpadsError}) — you can still submit a new
                        launchpad below.
                      </p>
                    )}
                  </DarkField>

                  {isNewLaunchpad && (
                    <DarkField label="Launchpad name">
                      <input
                        required
                        value={newLaunchpadName}
                        onChange={(e) => setNewLaunchpadName(e.target.value)}
                        placeholder="e.g. Meridian Launch"
                        className="w-full rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 text-sm text-[#f3f1ea] outline-none transition-colors placeholder:text-[#6e6c63] focus-visible:border-cobalt"
                      />
                    </DarkField>
                  )}

                  {isNewLaunchpad && (
                    <DarkField label="Factory Contract Address">
                      <input
                        required
                        value={factoryAddress}
                        onChange={(e) => setFactoryAddress(e.target.value)}
                        placeholder="0x…"
                        className="w-full rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 font-mono text-sm text-[#f3f1ea] outline-none transition-colors placeholder:text-[#6e6c63] focus-visible:border-cobalt"
                      />

                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#6e6c63]">
                        Required for a new launchpad — this is what lets Assay
                        discover and count its token launches.
                      </p>
                    </DarkField>
                  )}

                  {isNewLaunchpad && (
                    <DarkField label="Website (optional)">
                      <input
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://…"
                        className="w-full rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 text-sm text-[#f3f1ea] outline-none transition-colors placeholder:text-[#6e6c63] focus-visible:border-cobalt"
                      />
                    </DarkField>
                  )}

                  <DarkField label="Information Category">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 text-sm text-[#f3f1ea] outline-none transition-colors focus-visible:border-cobalt"
                    >
                      {categoryOptions.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </DarkField>

                  {fieldUpdate && (
                    <DarkField label={fieldUpdate.label}>
                      <input
                        required
                        value={fieldValue}
                        onChange={(e) => setFieldValue(e.target.value)}
                        placeholder={fieldUpdate.placeholder}
                        className="w-full rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 font-mono text-sm text-[#f3f1ea] outline-none transition-colors placeholder:text-[#6e6c63] focus-visible:border-cobalt"
                      />

                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#6e6c63]">
                        {selectedLaunchpad ? (
                          currentFieldValue ? (
                            <>
                              Currently on file:{' '}
                              <span className="font-mono text-[#b5b2a6]">
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
                    </DarkField>
                  )}

                  <DarkField
                    label={
                      fieldUpdate
                        ? 'Additional Description (optional)'
                        : 'Description'
                    }
                  >
                    <textarea
                      required={!fieldUpdate}
                      rows={4}
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder="Describe the launchpad, or add any supporting links here…"
                      className="w-full resize-none rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 text-sm text-[#f3f1ea] outline-none transition-colors placeholder:text-[#6e6c63] focus-visible:border-cobalt"
                    />

                    {category !== 'note' && (
                      <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#6e6c63]">
                        URLs are validated before Assay ever fetches them: HTTPS
                        only, private/reserved IP ranges rejected
                        post-DNS-resolution, redirects re-validated with a hard
                        cap.
                      </p>
                    )}
                  </DarkField>

                  <DarkField label="Contact Wallet or Twitter Handle">
                    <input
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="0x… or @handle"
                      className="w-full rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 text-sm text-[#f3f1ea] outline-none transition-colors placeholder:text-[#6e6c63] focus-visible:border-cobalt"
                    />

                    <p className="mt-1.5 text-[11.5px] text-[#6e6c63]">
                      Used solely if verification team requires clarification.
                    </p>
                  </DarkField>

                  {missingFields.length > 0 && (
                    <div
                      role="status"
                      className="rounded-lg border border-[#302f2a] bg-[#1c1b18] px-3 py-2.5 text-[12px] text-[#b5b2a6]"
                    >
                      <p className="font-semibold text-[#f3f1ea]">
                        Still required before you can submit:
                      </p>

                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {missingFields.map((field) => (
                          <li key={field}>{field}</li>
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
                    className="w-full rounded-lg bg-[#e8e402] py-2.5 font-mono text-[12px] font-bold uppercase tracking-[0.08em] text-[#141413] transition-all hover:-translate-y-0.5 hover:opacity-90 disabled:translate-y-0 disabled:opacity-40"
                  >
                    {status === 'submitting'
                      ? 'Submitting…'
                      : 'Submit for Peer Review'}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </section>
        </Reveal>

        <Reveal delay={0.12}>
          <section
            className={`dark-card group relative h-full overflow-hidden rounded-2xl border bg-[#141413] p-6 font-mono transition-all duration-300 ease-out hover:-translate-y-1.5 ${ACCENT.cobalt.border} ${ACCENT.cobalt.glow} sm:p-8`}
          >
            <span
              className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 ${ACCENT.cobalt.bar}`}
            />

            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#b5b2a6]">
                <span className="h-1.5 w-1.5 rounded-full bg-up" />
                <span className="text-[12px]">POST /submissions</span>
              </div>

              <span className="rounded border border-[#302f2a] bg-[#1c1b18] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#6e6c63]">
                preview
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#302f2a] bg-[#0f0f0d]">
              {hasAnyInput ? (
                <pre className="min-h-[320px] whitespace-pre-wrap break-words p-5 text-[12px] leading-relaxed text-[#b5b2a6]">
                  {JSON.stringify(payload, null, 2)}
                </pre>
              ) : (
                <div className="min-h-[320px] p-5 text-[12px] leading-relaxed text-[#6e6c63]">
                  <span className="block">// fill out form on the left</span>

                  <span className="block">
                    // to inspect the submission payload
                  </span>

                  <span className="mt-4 block h-px w-8 bg-[#302f2a]" />
                </div>
              )}
            </div>

            {status === 'done' && (
              <p className="mt-4 text-[12px] text-up">
                // 201 Created — queued for peer review
              </p>
            )}

            <div className="mt-6 border-t border-[#302f2a] pt-5">
              <p className="text-[11.5px] leading-relaxed text-[#6e6c63]">
                The preview mirrors the payload sent to the submission endpoint.
                Approval happens separately through human moderation.
              </p>
            </div>
          </section>
        </Reveal>
      </div>

      <Reveal delay={0.05} className="mt-8">
        <div className="flex items-start gap-3 rounded-xl border border-[#302f2a] bg-[#141413] px-4 py-3">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cobalt" />

          <p className="text-[12px] leading-relaxed text-[#6e6c63]">
            Initial status of every submission:{' '}
            <span className="font-mono text-[#b5b2a6]">PENDING</span> — kept
            private until verified by peer review.
          </p>
        </div>
      </Reveal>
    </div>
  );
}

function DarkField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-mono text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#b5b2a6]">
        {label}
      </label>

      {children}
    </div>
  );
}
