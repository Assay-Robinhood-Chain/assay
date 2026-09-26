// supabase/functions/_shared/logoFetch.ts
//
// Auto-discovers a launchpad's logo from its submitted website_url at
// onboarding time, so nobody has to hand-upload one. This is exactly the
// "future feature that fetches a publicly-submitted URL" ssrfSafeFetch.ts
// was written ahead of — every network call in here goes through it,
// never the bare `fetch()`.
//
// Best-effort only: any failure (unreachable site, no icon found, the
// candidate image itself failing the SSRF check) resolves to `null`,
// never throws. Called from onboarding-backfill; a launchpad with no
// discoverable logo just keeps showing the initials avatar the frontend
// has always used.

import { ssrfSafeFetch, SsrfBlockedError } from './ssrfSafeFetch.ts';

const HTML_SCAN_MAX_BYTES = 200_000; // <head> is always near the top

/** Pulls a favicon reference out of a page's <head>: apple-touch-icon
 * first (usually higher-res than favicon.ico), then any <link
 * rel="icon">. Deliberately NOT og:image — that's a social-preview
 * banner, not a square logo, and looked wrong once actually rendered
 * as a small round avatar. */
function extractCandidate(html: string): string | null {
  const head = html.slice(0, HTML_SCAN_MAX_BYTES);

  const appleTouchIcon = head.match(
    /<link[^>]+rel=["'](?:apple-touch-icon(?:-precomposed)?)["'][^>]+href=["']([^"']+)["']/i,
  );
  if (appleTouchIcon) return appleTouchIcon[1];

  const anyIcon = head.match(
    /<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["']/i,
  );
  if (anyIcon) return anyIcon[1];

  return null;
}

/** Fetches `websiteUrl`, looks for a favicon reference in its HTML, and
 * confirms the resolved image URL is itself fetchable (through the same
 * SSRF check) before returning it — a broken or unsafe reference is
 * treated the same as finding nothing. Falls back to `/favicon.ico` on
 * the same origin when the page has no icon markup at all. */
export async function fetchLogoUrl(
  websiteUrl: string | null | undefined,
): Promise<string | null> {
  if (!websiteUrl) return null;

  let origin: URL;
  try {
    origin = new URL(websiteUrl);
  } catch {
    return null;
  }

  let candidate: string | null = null;

  try {
    const pageRes = await ssrfSafeFetch(origin.toString());
    if (pageRes.ok) {
      const html = await pageRes.text();
      const found = extractCandidate(html);
      if (found) candidate = new URL(found, pageRes.url ?? origin).toString();
    }
  } catch (err) {
    if (!(err instanceof SsrfBlockedError)) {
      console.warn(`fetchLogoUrl: page fetch failed for ${websiteUrl}:`, err);
    }
    // SsrfBlockedError on the page itself: nothing to fall back to
    // (we can't trust the origin at all), so return null below.
    if (err instanceof SsrfBlockedError) return null;
  }

  if (!candidate) {
    candidate = new URL('/favicon.ico', origin).toString();
  }

  try {
    const imgRes = await ssrfSafeFetch(candidate);
    if (!imgRes.ok) return null;
    const contentType = imgRes.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    return imgRes.url ?? candidate;
  } catch (err) {
    if (!(err instanceof SsrfBlockedError)) {
      console.warn(`fetchLogoUrl: logo fetch failed for ${candidate}:`, err);
    }
    return null;
  }
}
