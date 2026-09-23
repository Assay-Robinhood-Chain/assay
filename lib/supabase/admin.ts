import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS entirely.
 *
 * ONE RULE: only ever import this from a Route Handler
 * (app/api/**\/route.ts) that itself checks the x-admin-key header
 * first (see requireAdminKey below). NEVER import this from a Server
 * Component, a page, or anything that could end up in a client
 * bundle — SUPABASE_SERVICE_ROLE_KEY has no RLS restrictions at all.
 *
 * lib/supabase/server.ts (anon key, RLS-respecting) is what every
 * page should keep using. This file exists only for the admin
 * moderation API routes.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient() requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "to be set as server env vars (Vercel project settings, not NEXT_PUBLIC_*)."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Returns a 401 Response if the request's x-admin-key header doesn't
 * match ADMIN_API_KEY, or null if it's authorized. Mirrors the same
 * check the onboarding-backfill Edge Function does — same key, same
 * shape, reused here for the admin moderation API routes. */
export function requireAdminKey(req: Request): Response | null {
  const expected = process.env.ADMIN_API_KEY;
  const provided = req.headers.get("x-admin-key");

  if (!expected) {
    return Response.json(
      { error: { code: "not_configured", message: "ADMIN_API_KEY is not set on the server." } },
      { status: 500 }
    );
  }
  if (provided !== expected) {
    return Response.json({ error: { code: "unauthorized" } }, { status: 401 });
  }
  return null;
}
