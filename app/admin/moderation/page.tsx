'use client';

import { useEffect, useState, useCallback } from 'react';

type Submission = {
  id: string;
  launchpad_slug: string | null;
  field: string;
  value: string;
  submitted_by: string | null;
  created_at: string;
};

type Report = {
  id: string;
  launchpad_id: string;
  launch_id: string | null;
  category: string;
  description: string;
  reporter_identifier: string | null;
  reporter_trust_score: number;
  created_at: string;
};

// Mirrors triggerOnboardingBackfill()'s return shape in
// app/api/admin/moderation/route.ts.
type BackfillResult =
  | { called: false; reason: string }
  | { called: true; status: number | null; body: unknown; error?: string };

// Mirrors onboardApprovedLaunchpad()'s return shape. Only present on
// the response when a launchpad_submissions row with field
// "new_launchpad" was approved — null/undefined otherwise.
type OnboardingResult =
  | { skipped: true; reason: string }
  | { skipped: false; error: string }
  | { skipped: false; slug: string; backfill: BackfillResult };

// sessionStorage only — cleared when the tab closes. Not a real auth
// session, just avoids re-typing the key on every click in one visit.
const STORAGE_KEY = 'assay_admin_key';

/** Turns the raw onboarding/backfill result into one short line plus a
 * tone, for the notice banner shown right after an Approve click. */
function describeOnboarding(onboarding: OnboardingResult): {
  tone: 'up' | 'down' | 'faint';
  message: string;
} {
  if (onboarding.skipped) {
    return { tone: 'faint', message: `Not onboarded: ${onboarding.reason}` };
  }
  if ('error' in onboarding) {
    return { tone: 'down', message: `Onboarding failed: ${onboarding.error}` };
  }

  const { backfill } = onboarding;
  if (!backfill.called) {
    return {
      tone: 'down',
      message: `"${onboarding.slug}" onboarded, but backfill wasn't triggered: ${backfill.reason}`,
    };
  }
  if (backfill.error) {
    return {
      tone: 'down',
      message: `"${onboarding.slug}" onboarded, but the backfill call failed: ${backfill.error}`,
    };
  }
  if (backfill.status === 200) {
    const body = backfill.body as {
      sample_size?: number;
      total_launches_upstream?: number | null;
    } | null;
    return {
      tone: 'up',
      message: `"${onboarding.slug}" onboarded — backfill found ${body?.sample_size ?? 0} launch(es)${
        body?.total_launches_upstream != null
          ? ` of ${body.total_launches_upstream} upstream`
          : ''
      }.`,
    };
  }
  const errBody = backfill.body as {
    error?: { code?: string; message?: string };
    code?: string;
    message?: string;
  } | null;
  return {
    tone: 'down',
    message: `"${onboarding.slug}" onboarded, but backfill returned ${backfill.status}: ${
      errBody?.error?.message ??
      errBody?.error?.code ??
      errBody?.message ??
      errBody?.code ??
      'unknown error'
    }.`,
  };
}

export default function ModerationPage() {
  const [adminKey, setAdminKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [onboardingNotice, setOnboardingNotice] = useState<{
    tone: 'up' | 'down' | 'faint';
    message: string;
  } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) setAdminKey(stored);
  }, []);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/moderation', {
        headers: { 'x-admin-key': key },
      });
      if (res.status === 401) {
        setError('Wrong admin key.');
        sessionStorage.removeItem(STORAGE_KEY);
        setAdminKey('');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? `Request failed (${res.status})`);
        return;
      }
      const body = await res.json();
      setSubmissions(body.submissions);
      setReports(body.reports);
    } catch {
      setError(
        'Network error — is the site able to reach /api/admin/moderation?',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminKey) load(adminKey);
  }, [adminKey, load]);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInput) return;
    sessionStorage.setItem(STORAGE_KEY, keyInput);
    setAdminKey(keyInput);
  }

  async function handleAction(
    table: 'launchpad_submissions' | 'community_reports',
    id: string,
    action: 'approve' | 'reject',
  ) {
    setActingOn(id);
    try {
      const res = await fetch('/api/admin/moderation', {
        method: 'PATCH',
        headers: {
          'x-admin-key': adminKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ table, id, action }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? `Action failed (${res.status})`);
        return;
      }
      if (table === 'launchpad_submissions') {
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
      } else {
        setReports((prev) => prev.filter((r) => r.id !== id));
      }
      // onboarding is only present when this was an approved
      // "new_launchpad" submission — everything else leaves it null.
      const onboarding = body?.onboarding as
        | OnboardingResult
        | null
        | undefined;
      setOnboardingNotice(onboarding ? describeOnboarding(onboarding) : null);
    } finally {
      setActingOn(null);
    }
  }

  if (!adminKey) {
    return (
      <div className="mx-auto flex max-w-sm flex-col px-5 py-24">
        <h1 className="mb-1 text-lg font-semibold text-ink">Moderation</h1>
        <p className="mb-5 text-[13.5px] text-muted">
          Enter the admin key to view pending submissions and reports.
        </p>
        <form onSubmit={handleUnlock} className="flex gap-2">
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="ADMIN_API_KEY"
            className="w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-ink outline-none focus-visible:border-cobalt"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper transition-opacity hover:opacity-90"
          >
            Unlock
          </button>
        </form>
        {error && <p className="mt-3 text-[12.5px] text-down">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <div className="mb-8 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-ink">Moderation</h1>
        <button
          onClick={() => {
            sessionStorage.removeItem(STORAGE_KEY);
            setAdminKey('');
          }}
          className="text-[12.5px] text-faint hover:text-ink"
        >
          Lock
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-down/30 bg-down-soft px-3.5 py-2.5 text-[13px] text-down">
          {error}
        </div>
      )}
      {onboardingNotice && (
        <div
          className={
            'mb-5 flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-[13px] ' +
            (onboardingNotice.tone === 'up'
              ? 'border-up/30 bg-up-soft text-up'
              : onboardingNotice.tone === 'down'
                ? 'border-down/30 bg-down-soft text-down'
                : 'border-line bg-card text-faint')
          }
        >
          <span>{onboardingNotice.message}</span>
          <button
            onClick={() => setOnboardingNotice(null)}
            className="shrink-0 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {loading && <p className="text-[13px] text-faint">Loading…</p>}

      <section className="mb-10">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
          Submissions ({submissions.length})
        </h2>
        {submissions.length === 0 && !loading && (
          <p className="text-[13px] text-faint">Nothing pending.</p>
        )}
        <div className="space-y-3">
          {submissions.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-line bg-card p-4"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[12px] text-faint">
                  {s.launchpad_slug ?? '(new launchpad)'} · {s.field}
                </span>
                <span className="text-[11px] text-faint">
                  {new Date(s.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mb-2 whitespace-pre-wrap text-[13.5px] text-ink-soft">
                {s.value}
              </p>
              {s.submitted_by && (
                <p className="mb-3 text-[12px] text-faint">
                  from {s.submitted_by}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={actingOn === s.id}
                  onClick={() =>
                    handleAction('launchpad_submissions', s.id, 'approve')
                  }
                  className="rounded-md bg-up px-3 py-1.5 text-[12.5px] font-medium text-paper disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  disabled={actingOn === s.id}
                  onClick={() =>
                    handleAction('launchpad_submissions', s.id, 'reject')
                  }
                  className="rounded-md border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-faint">
          Reports ({reports.length})
        </h2>
        {reports.length === 0 && !loading && (
          <p className="text-[13px] text-faint">Nothing pending.</p>
        )}
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-line bg-card p-4"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[12px] text-faint">
                  {r.category} · trust {r.reporter_trust_score.toFixed(2)}
                </span>
                <span className="text-[11px] text-faint">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mb-2 whitespace-pre-wrap text-[13.5px] text-ink-soft">
                {r.description}
              </p>
              {r.reporter_identifier && (
                <p className="mb-3 text-[12px] text-faint">
                  from {r.reporter_identifier}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={actingOn === r.id}
                  onClick={() =>
                    handleAction('community_reports', r.id, 'approve')
                  }
                  className="rounded-md bg-up px-3 py-1.5 text-[12.5px] font-medium text-paper disabled:opacity-50"
                >
                  Verify
                </button>
                <button
                  disabled={actingOn === r.id}
                  onClick={() =>
                    handleAction('community_reports', r.id, 'reject')
                  }
                  className="rounded-md border border-line px-3 py-1.5 text-[12.5px] font-medium text-ink disabled:opacity-50"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
