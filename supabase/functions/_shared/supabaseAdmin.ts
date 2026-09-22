// supabase/functions/_shared/supabaseAdmin.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — set these as Edge Function secrets."
    );
  }
  // service role key bypasses RLS — this client is server-only, never
  // shipped to a browser. See supabase/migrations/0001_init.sql for
  // the RLS policies this deliberately skips (e.g. reading `pending`
  // submissions).
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/** Rejects the request unless x-cron-secret matches CRON_SECRET.
 * Used by every function below so pg_cron is the only caller. */
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  const got = req.headers.get("x-cron-secret");
  if (!expected || got !== expected) {
    return new Response(JSON.stringify({ error: { code: "unauthorized" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
