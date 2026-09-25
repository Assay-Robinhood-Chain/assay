// supabase/functions/auto-approve-submissions/index.ts
//
// Cron 6 — every minute (see 0014_auto_approve_submissions.sql).
// Approves a pending "new_launchpad" submission once it has been waiting
// AUTO_APPROVE_AFTER_MINUTES with no manual decision.
//
// It does NOT re-implement approval. It calls the exact same endpoint the
// admin moderation page uses (PATCH /api/admin/moderation), so an
// auto-approved launchpad is created, and onboarding-backfill triggered,
// identically to a manual approve.
//
// Deliberately narrow:
//   - field = 'new_launchpad' only. website_docs / deployer_address
//     submissions edit an EXISTING launchpad, so they stay manual.
//   - community_reports are never touched.
//
// Required Edge Function secrets: CRON_SECRET, ADMIN_API_KEY (both already
// set) and APP_BASE_URL (new — the public URL of the deployed Next.js app,
// e.g. https://your-app.vercel.app, no trailing slash).

import { supabaseAdmin, requireCronSecret } from '../_shared/supabaseAdmin.ts';
import {
  AUTO_APPROVE_AFTER_MINUTES,
  AUTO_APPROVE_MAX_AGE_MINUTES,
  AUTO_APPROVE_MAX_PER_RUN,
} from '../_shared/constants.ts';
import { initSentry, captureException, flushSentry } from '../_shared/sentry.ts';

initSentry('auto-approve-submissions');

Deno.serve(async (req) => {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.replace(/\/+$/, '');
  const adminKey = Deno.env.get('ADMIN_API_KEY');
  if (!appBaseUrl || !adminKey) {
    return json(
      {
        error: {
          code: 'not_configured',
          message: 'APP_BASE_URL and ADMIN_API_KEY must both be set as Edge Function secrets.',
        },
      },
      500,
    );
  }

  const supabase = supabaseAdmin();
  const now = Date.now();
  const olderThan = new Date(now - AUTO_APPROVE_AFTER_MINUTES * 60_000).toISOString();
  const newerThan = new Date(now - AUTO_APPROVE_MAX_AGE_MINUTES * 60_000).toISOString();

  const { data: due, error } = await supabase
    .from('launchpad_submissions')
    .select('id, launchpad_slug')
    .eq('status', 'pending')
    .eq('field', 'new_launchpad')
    .lt('created_at', olderThan)
    .gt('created_at', newerThan)
    .order('created_at', { ascending: true })
    .limit(AUTO_APPROVE_MAX_PER_RUN);

  if (error) {
    captureException(error);
    await flushSentry();
    return json({ error: { code: 'db_error', message: error.message } }, 500);
  }

  const results: { id: string; slug: string | null; approved: boolean; detail?: string }[] = [];

  for (const row of due ?? []) {
    try {
      // Re-check right before acting: an admin may have approved or
      // rejected it in the seconds since the query above.
      const { data: fresh } = await supabase
        .from('launchpad_submissions')
        .select('status')
        .eq('id', row.id)
        .maybeSingle();
      if (fresh?.status !== 'pending') {
        results.push({ id: row.id, slug: row.launchpad_slug, approved: false, detail: 'no longer pending' });
        continue;
      }

      const res = await fetch(`${appBaseUrl}/api/admin/moderation`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ table: 'launchpad_submissions', id: row.id, action: 'approve' }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const detail = `PATCH ${res.status}: ${text.slice(0, 200)}`;
        captureException(new Error(`auto-approve failed — ${detail}`), { submission_id: row.id });
        results.push({ id: row.id, slug: row.launchpad_slug, approved: false, detail });
        continue;
      }

      // Audit trail: the PATCH only flips `status`, so mark who did it.
      await supabase
        .from('launchpad_submissions')
        .update({ reviewed_at: new Date().toISOString(), reviewed_by: 'auto-approve' })
        .eq('id', row.id);

      results.push({ id: row.id, slug: row.launchpad_slug, approved: true });
    } catch (e) {
      captureException(e, { submission_id: row.id });
      results.push({
        id: row.id,
        slug: row.launchpad_slug,
        approved: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  await flushSentry();
  return json({ checked: due?.length ?? 0, results }, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
