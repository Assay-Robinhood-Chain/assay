import { createAdminClient, requireAdminKey } from '@/lib/supabase/admin';

/** GET /api/admin/moderation — list every pending row from both
 * publicly-insertable tables, newest first. */
export async function GET(req: Request) {
  const unauthorized = requireAdminKey(req);
  if (unauthorized) return unauthorized;

  const supabase = createAdminClient();

  const [submissions, reports] = await Promise.all([
    supabase
      .from('launchpad_submissions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('community_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);

  if (submissions.error) {
    return Response.json(
      { error: { code: 'db_error', message: submissions.error.message } },
      { status: 500 },
    );
  }
  if (reports.error) {
    return Response.json(
      { error: { code: 'db_error', message: reports.error.message } },
      { status: 500 },
    );
  }

  return Response.json({
    submissions: submissions.data ?? [],
    reports: reports.data ?? [],
  });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Both submission sources write a semicolon-separated "Mechanism: X;
 * Factory: Y; Website: Z" string as `value` when field is
 * new_launchpad (see components/LaunchpadScanner.tsx handleScan and
 * app/get-listed/page.tsx handleSubmit's free-text `context`). Pull
 * out what we can; anything missing is left null rather than guessed. */
function parseNewLaunchpadValue(value: string) {
  const factoryMatch = value.match(/factory:\s*([^\s;]+)/i);
  const websiteMatch = value.match(/website:\s*([^\s;]+)/i);
  return {
    deployerAddress: factoryMatch?.[1] ?? null,
    websiteUrl: websiteMatch?.[1] ?? null,
  };
}

/** Fire-and-report call to the onboarding-backfill Edge Function for a
 * freshly-inserted launchpad. This is the piece that was previously
 * missing entirely: onboarding-backfill's own header comment says it's
 * "called directly, e.g. from an admin action" — this IS that call.
 *
 * Deliberately does not throw: a backfill failure (e.g. no factory
 * address yet, discovery source not wired, Blockscout URL unset) is an
 * expected, already-documented outcome for a brand-new launchpad, not
 * a reason to fail the approval itself. The result is surfaced back to
 * the admin in the response instead so it's visible, not silent. */
async function triggerOnboardingBackfill(launchpadId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminKey = process.env.ADMIN_API_KEY;
  // Supabase's own API gateway sits in front of every Edge Function and,
  // unless "verify JWT" is disabled for the function, rejects any
  // request with no Authorization header at the gateway level — before
  // onboarding-backfill's own x-admin-key check ever runs. That gateway
  // 401 has a different body shape ({code,message}, not {error:{...}})
  // from the one our own functions return, which is why it was showing
  // up as "unknown error". The service role key is a valid Supabase JWT
  // for this purpose, so reuse it — same key createAdminClient() uses.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !adminKey) {
    return {
      called: false as const,
      reason: 'NEXT_PUBLIC_SUPABASE_URL or ADMIN_API_KEY not set on the server',
    };
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/onboarding-backfill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
        ...(serviceRoleKey
          ? { Authorization: `Bearer ${serviceRoleKey}` }
          : {}),
      },
      body: JSON.stringify({ launchpadId }),
    });
    const body = await res.json().catch(() => null);
    return { called: true as const, status: res.status, body };
  } catch (err) {
    // Network-level failure (function not deployed, DNS, etc.) — still
    // don't block approval on this.
    return {
      called: true as const,
      status: null,
      body: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Promotes an approved "new_launchpad" submission into a real row in
 * public.launchpads, with sample_size 0 so it renders with the
 * existing <NotYetScored /> state (app/launchpad/[slug]/page.tsx)
 * until the onboarding backfill (Edge Function) picks it up and a
 * score is computed. Never overwrites an existing launchpad — if the
 * slug is already onboarded, this is a no-op.
 *
 * Also fires that onboarding-backfill call immediately after the
 * insert succeeds, so approving a launchpad no longer leaves it
 * stranded at sample_size 0 waiting on a manual step nothing else in
 * the app performs. */
async function onboardApprovedLaunchpad(
  supabase: ReturnType<typeof createAdminClient>,
  submission: { launchpad_slug: string | null; value: string },
) {
  if (!submission.launchpad_slug) {
    return {
      skipped: true as const,
      reason: 'submission has no launchpad_slug',
    };
  }
  const slug = slugify(submission.launchpad_slug);
  if (!slug) {
    return {
      skipped: true as const,
      reason: 'launchpad_slug produced an empty slug',
    };
  }

  const { data: existing } = await supabase
    .from('launchpads')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) {
    return {
      skipped: true as const,
      reason: `launchpad "${slug}" is already onboarded`,
    };
  }

  const { deployerAddress, websiteUrl } = parseNewLaunchpadValue(
    submission.value,
  );

  const { data: inserted, error } = await supabase
    .from('launchpads')
    .insert({
      slug,
      name: submission.launchpad_slug,
      description: submission.value,
      deployer_addresses: deployerAddress ? [deployerAddress] : [],
      website_url: websiteUrl,
      // Unverified until the onboarding backfill runs a real check against
      // Bitquery/Mobula per third-party-indexer-integration.md — never
      // claim a discovery source we haven't confirmed.
      discovery_source: 'rpc_self_indexed',
      sample_size: 0,
    })
    .select('id')
    .single();

  if (error) return { skipped: false as const, error: error.message };

  const backfill = await triggerOnboardingBackfill(inserted.id);
  return { skipped: false as const, slug, backfill };
}

/** Both a website_docs and a deployer_address submission from
 * app/get-listed/page.tsx carry the same "Website: X;" / "Factory: X;"
 * prefix shape as a new_launchpad submission (see
 * parseNewLaunchpadValue above) — reuse it here so approving one of
 * these actually writes the new value onto the existing launchpad row,
 * instead of just flipping the submission's own status to "approved"
 * with nothing else happening. */
async function applyFieldUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  submission: { launchpad_slug: string | null; field: string; value: string },
) {
  if (!submission.launchpad_slug) {
    return {
      skipped: true as const,
      reason: 'submission has no launchpad_slug',
    };
  }
  const slug = slugify(submission.launchpad_slug);
  const { deployerAddress, websiteUrl } = parseNewLaunchpadValue(
    submission.value,
  );

  if (submission.field === 'website_docs' && websiteUrl) {
    const { error } = await supabase
      .from('launchpads')
      .update({ website_url: websiteUrl })
      .eq('slug', slug);
    if (error) return { skipped: false as const, error: error.message };
    return {
      skipped: false as const,
      slug,
      field: 'website_url',
      value: websiteUrl,
    };
  }

  if (submission.field === 'deployer_address' && deployerAddress) {
    const { data: existing, error: fetchError } = await supabase
      .from('launchpads')
      .select('deployer_addresses')
      .eq('slug', slug)
      .maybeSingle();
    if (fetchError)
      return { skipped: false as const, error: fetchError.message };
    const current: string[] = existing?.deployer_addresses ?? [];
    if (current.includes(deployerAddress)) {
      return { skipped: true as const, reason: 'address already on file' };
    }
    const { error } = await supabase
      .from('launchpads')
      .update({ deployer_addresses: [...current, deployerAddress] })
      .eq('slug', slug);
    if (error) return { skipped: false as const, error: error.message };
    return {
      skipped: false as const,
      slug,
      field: 'deployer_addresses',
      value: deployerAddress,
    };
  }

  return {
    skipped: true as const,
    reason: `field "${submission.field}" has no matching value in the submission text`,
  };
}

/** PATCH /api/admin/moderation — approve or reject one row.
 * Body: { table: "launchpad_submissions" | "community_reports", id: string, action: "approve" | "reject" } */
export async function PATCH(req: Request) {
  const unauthorized = requireAdminKey(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => null);
  const table = body?.table;
  const id = body?.id;
  const action = body?.action;

  if (
    (table !== 'launchpad_submissions' && table !== 'community_reports') ||
    typeof id !== 'string' ||
    (action !== 'approve' && action !== 'reject')
  ) {
    return Response.json({ error: { code: 'invalid_body' } }, { status: 400 });
  }

  const supabase = createAdminClient();

  // launchpad_submissions uses "approved"/"rejected" (matches 0001_init.sql);
  // community_reports uses "verified"/"dismissed" (matches 0003's own convention).
  const nextStatus =
    table === 'launchpad_submissions'
      ? action === 'approve'
        ? 'approved'
        : 'rejected'
      : action === 'approve'
        ? 'verified'
        : 'dismissed';

  let onboarding: Awaited<ReturnType<typeof onboardApprovedLaunchpad>> | null =
    null;
  let fieldUpdate: Awaited<ReturnType<typeof applyFieldUpdate>> | null = null;

  if (table === 'launchpad_submissions' && action === 'approve') {
    const { data: submission, error: fetchError } = await supabase
      .from('launchpad_submissions')
      .select('field, launchpad_slug, value')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return Response.json(
        { error: { code: 'db_error', message: fetchError.message } },
        { status: 500 },
      );
    }

    if (submission?.field === 'new_launchpad') {
      onboarding = await onboardApprovedLaunchpad(supabase, submission);
      if (!onboarding.skipped && onboarding.error) {
        // Don't mark approved if we couldn't actually onboard it — the
        // admin would otherwise see "approved" with nothing to show for it.
        return Response.json(
          { error: { code: 'onboard_failed', message: onboarding.error } },
          { status: 500 },
        );
      }
    } else if (
      submission &&
      (submission.field === 'website_docs' ||
        submission.field === 'deployer_address')
    ) {
      fieldUpdate = await applyFieldUpdate(supabase, submission);
      if (!fieldUpdate.skipped && fieldUpdate.error) {
        return Response.json(
          {
            error: { code: 'field_update_failed', message: fieldUpdate.error },
          },
          { status: 500 },
        );
      }
    }
  }

  const { error } = await supabase
    .from(table)
    .update({ status: nextStatus })
    .eq('id', id);

  if (error) {
    return Response.json(
      { error: { code: 'db_error', message: error.message } },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    id,
    status: nextStatus,
    onboarding,
    fieldUpdate,
  });
}
