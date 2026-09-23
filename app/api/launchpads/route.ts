import { getLaunchpads } from '@/lib/supabase/queries';

/** GET /api/launchpads — lightweight public listing for client
 * components that can't import lib/supabase/queries.ts directly
 * (it reads cookies() via next/headers, so it's server-only).
 *
 * Falls back to the bundled mock dataset automatically — that's
 * handled inside getLaunchpads() itself (lib/supabase/queries.ts),
 * same as every other page on the site.
 *
 * Trimmed to just what a "which launchpad, what's its current info"
 * dropdown needs — score history, launches, and badges are left out
 * on purpose to keep this cheap and to avoid leaking anything not
 * already public on the launchpad's own dossier page. */
export async function GET() {
  try {
    const launchpads = await getLaunchpads();

    const results = launchpads
      .map((lp) => ({
        slug: lp.slug,
        name: lp.name,
        websiteUrl: lp.websiteUrl ?? null,
        deployerAddresses: lp.deployerAddresses,
        finalScore: lp.score.finalScore,
        stars: lp.score.stars,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ launchpads: results });
  } catch (err) {
    return Response.json(
      {
        error: {
          code: 'launchpads_fetch_failed',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      { status: 500 },
    );
  }
}
