'use client';

import { useState } from 'react';

/** Renders a launchpad's auto-discovered logo (logoUrl — see
 * lib/types.ts and supabase/functions/_shared/logoFetch.ts), falling
 * back to the two-letter initials badge whenever there's no logo, or
 * the image itself fails to load (dead link, CORS, etc). Plain <img>
 * rather than next/image on purpose: logoUrl points at an arbitrary
 * third-party domain discovered at onboarding time, which next/image
 * can't serve without that domain being allow-listed ahead of time. */
export default function LaunchpadAvatar({
  name,
  logoUrl,
  className = '',
  textClassName = '',
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
  textClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full ${className}`}
    >
      <span className={`font-mono ${textClassName}`}>
        {name.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}
