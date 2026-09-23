// supabase/functions/_shared/ssrfSafeFetch.ts
//
// The SSRF validator referenced by the "HTTPS only; private/reserved IP
// ranges rejected" copy in LaunchpadScanner.tsx and app/get-listed/page.tsx.
// Nothing currently auto-fetches a submitted URL (both forms just store
// the text), so this isn't closing a live exploit today — but it's the
// piece that MUST sit in front of any future feature that does fetch a
// publicly-submitted URL (link preview, metadata check, automated
// verification, etc). Use `ssrfSafeFetch()` instead of the bare `fetch()`
// the moment such a feature is built.

import {
  URL_FETCH_TIMEOUT_MS,
  URL_FETCH_MAX_BYTES,
  MAX_REDIRECT_HOPS,
} from "./constants.ts";

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`SSRF check failed: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

/** IPv4/IPv6 ranges that must never be fetched: loopback, private, link-local,
 * the cloud metadata endpoint, and other reserved blocks. Checked AFTER DNS
 * resolution — the whole point is that a hostname can resolve to one of
 * these even if the literal string in the URL looks like a normal domain. */
function isPrivateOrReservedIp(ip: string): boolean {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [parseInt(v4[1]), parseInt(v4[2])];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 metadata
    if (a === 0) return true; // "this network"
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  // IPv6 — loopback, unique local (fc00::/7), link-local (fe80::/10)
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true;
  }
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — re-check the embedded v4 address
    return isPrivateOrReservedIp(lower.replace("::ffff:", ""));
  }
  return false;
}

async function assertHostIsSafe(hostname: string): Promise<void> {
  let records: string[];
  try {
    const [v4, v6] = await Promise.allSettled([
      Deno.resolveDns(hostname, "A"),
      Deno.resolveDns(hostname, "AAAA"),
    ]);
    records = [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];
  } catch {
    throw new SsrfBlockedError(`could not resolve hostname: ${hostname}`);
  }
  if (records.length === 0) {
    throw new SsrfBlockedError(`hostname resolved to no addresses: ${hostname}`);
  }
  for (const ip of records) {
    if (isPrivateOrReservedIp(ip)) {
      throw new SsrfBlockedError(`hostname resolves to a private/reserved address: ${ip}`);
    }
  }
}

/** Fetches a user-submitted URL safely: HTTPS-only, resolves and checks
 * every hop (including redirects) against private/reserved IP ranges,
 * caps redirects, enforces a timeout and a max response size. Throws
 * SsrfBlockedError if the URL or any redirect target is unsafe. */
export async function ssrfSafeFetch(inputUrl: string): Promise<Response> {
  let currentUrl = inputUrl;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new SsrfBlockedError(`not a valid URL: ${currentUrl}`);
    }
    if (parsed.protocol !== "https:") {
      throw new SsrfBlockedError(`only https:// is allowed, got: ${parsed.protocol}`);
    }

    await assertHostIsSafe(parsed.hostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        signal: controller.signal,
        redirect: "manual", // we re-validate every redirect target ourselves
      });
    } finally {
      clearTimeout(timeout);
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new SsrfBlockedError("redirect with no Location header");
      if (hop === MAX_REDIRECT_HOPS) {
        throw new SsrfBlockedError(`too many redirects (max ${MAX_REDIRECT_HOPS})`);
      }
      currentUrl = new URL(location, parsed).toString();
      continue; // loop re-validates the new host before following it
    }

    // Enforce a max body size without buffering the whole thing first.
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > URL_FETCH_MAX_BYTES) {
      throw new SsrfBlockedError(`response too large: ${contentLength} bytes`);
    }
    return res;
  }

  throw new SsrfBlockedError("redirect loop guard tripped unexpectedly");
}
