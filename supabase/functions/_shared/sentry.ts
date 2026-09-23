// supabase/functions/_shared/sentry.ts
//
// Shared Sentry wiring for all 3 Edge Functions. No-ops cleanly if
// SENTRY_DSN isn't set as a secret yet, so this is safe to import
// even before Sentry is configured — nothing breaks either way.

import * as Sentry from "npm:@sentry/deno";

let initialized = false;

/** Call once per function, at module load time (outside Deno.serve),
 * so it runs once per cold start rather than once per request. */
export function initSentry(functionName: string) {
  if (initialized) return;
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return; // not configured yet — silently skip, never throw

  Sentry.init({
    dsn,
    environment: Deno.env.get("SB_REGION") ? "production" : "development",
    tracesSampleRate: 0, // error tracking only, no perf tracing needed here
  });
  Sentry.setTag("function", functionName);
  Sentry.setTag("execution_id", Deno.env.get("SB_EXECUTION_ID") ?? "unknown");
  initialized = true;
}

/** Reports an error to Sentry (if configured) AND logs it, so local
 * `supabase functions serve` output is unchanged either way. */
export function captureException(error: unknown, extra?: Record<string, unknown>) {
  console.error(error, extra ?? "");
  if (Deno.env.get("SENTRY_DSN")) {
    Sentry.captureException(error, extra ? { extra } : undefined);
  }
}

/** MUST be awaited before the function returns its Response — the
 * Deno isolate can be frozen/killed right after the response is sent,
 * before a fire-and-forget Sentry request would finish. */
export async function flushSentry() {
  if (Deno.env.get("SENTRY_DSN")) {
    await Sentry.flush(2000);
  }
}
