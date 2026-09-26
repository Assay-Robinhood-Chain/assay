import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { SCORE_DISCLAIMER, TARGET_CHAIN } from '@/lib/constants';

// TODO: replace with the real Assay X (Twitter) and GitHub URLs.
const X_URL = 'https://x.com/assaytechX';
const GITHUB_URL = 'https://github.com/Assay-Robinhood-Chain/assay';

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.9 2H22l-7.6 8.7L23.3 22H16.6l-5.2-6.8L5.4 22H2.3l8.1-9.3L1.5 2h6.9l4.7 6.2L18.9 2Zm-1.2 18h1.7L7 4h-1.8l12.5 16Z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.48 2 2 6.58 2 12.19c0 4.49 2.87 8.3 6.84 9.65.5.1.68-.22.68-.49
        0-.24-.01-.88-.01-1.72-2.78.62-3.37-1.36-3.37-1.36-.46-1.19-1.11-1.51-1.11-1.51
        -.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.55 2.34 1.1 2.91.84.09-.66.35-1.1.63-1.36
        -2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.75-.1-.26-.45-1.32.1-2.75 0 0
        .84-.28 2.75 1.05a9.3 9.3 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.43.2 2.49.1 2.75
        .64.71 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9
        0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.01 10.01 0 0 0 22 12.19C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
}

function SocialIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="layout-surface grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-card text-ink-soft hover:text-ink"
    >
      {children}
    </a>
  );
}

export default function Footer() {
  return (
    <footer className="layout-surface border-t border-line bg-panel">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <Image
                src="/logo.png"
                alt="Assay"
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 rounded-md"
              />
              Assay
            </div>
            <p className="max-w-xs text-[13px] leading-relaxed text-muted">
              The independent standard for {TARGET_CHAIN} launchpads. Published,
              versioned criteria. No paid placement. Re-scored continuously.
            </p>
          </div>
          <div>
            <div className="mb-3 text-[12px] font-medium uppercase tracking-wide text-faint">
              Product
            </div>
            <ul className="space-y-2 text-[13px] text-muted">
              <li>
                <Link className="hover:text-ink" href="/rankings">
                  Rankings
                </Link>
              </li>
              <li>
                <Link className="hover:text-ink" href="/methodology">
                  Methodology
                </Link>
              </li>
              <li>
                <Link className="hover:text-ink" href="/coverage">
                  Coverage
                </Link>
              </li>
              <li>
                <Link className="hover:text-ink" href="/get-listed">
                  Get listed
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-[12px] font-medium uppercase tracking-wide text-faint">
              Disclaimer
            </div>
            <p className="text-[12px] leading-relaxed text-faint">
              {SCORE_DISCLAIMER}
            </p>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-line-soft pt-6 text-[12px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} Assay. Not a registered investment
            adviser.
          </span>
          <div className="flex items-center gap-3">
            <span className="font-mono">algorithm_version: v1.9</span>
            <div className="flex items-center gap-2">
              <SocialIconLink href={X_URL} label="Assay on X">
                <XIcon />
              </SocialIconLink>
              <SocialIconLink href={GITHUB_URL} label="Assay on GitHub">
                <GithubIcon />
              </SocialIconLink>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
