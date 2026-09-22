import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side client for Server Components. Reads with the anon key —
 * RLS policies in supabase/migrations/0001_init.sql already make
 * every scored table public, so this needs no auth. Never use the
 * service role key here; that belongs only in Edge Functions
 * (supabase/functions/_shared/supabaseAdmin.ts). */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component that can't set cookies —
            // safe to ignore since Assay has no user sessions today.
          }
        },
      },
    }
  );
}

/** True once NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are set. Lets
 * lib/supabase/queries.ts fall back to the bundled mock dataset
 * (lib/data.ts) until a real project is wired up, so the app keeps
 * building and running either way. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
