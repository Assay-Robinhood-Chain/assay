import { createClient } from '@supabase/supabase-js';

/** Read-only client for Server Components, Route Handlers, and build-time
 * contexts (generateStaticParams) alike. Reads with the anon key — RLS
 * policies in supabase/migrations/0001_init.sql already make every
 * scored table public, and Assay has no user sessions, so there's
 * nothing a per-request cookie-aware client would add here. A plain
 * client (no next/headers) also means this is safe to call from
 * generateStaticParams, which runs at build time with no HTTP request
 * to read cookies from. Never use the service role key here; that
 * belongs only in Edge Functions (supabase/functions/_shared/supabaseAdmin.ts)
 * and the admin API routes (lib/supabase/admin.ts). */
export async function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

/** True once NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are set. Lets
 * lib/supabase/queries.ts fall back to the bundled mock dataset
 * (lib/data.ts) until a real project is wired up, so the app keeps
 * building and running either way. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
