import Link from 'next/link';
import Image from 'next/image';
import { SCORE_DISCLAIMER, TARGET_CHAIN } from '@/lib/constants';

export default function Footer() {
  return (
    <footer className="border-t border-line bg-panel">
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
          <span className="font-mono">algorithm_version: v1.3</span>
        </div>
      </div>
    </footer>
  );
}
