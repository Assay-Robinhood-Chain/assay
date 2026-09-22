'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from '@/components/ThemeToggle';
import LaunchpadScanner from '@/components/LaunchpadScanner';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/coverage', label: 'Coverage' },
  { href: '/get-listed', label: 'Get listed' },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <Image
            src="/logo.png"
            alt="Assay"
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-md"
            priority
          />
          <span>
            Assay
            <span className="ml-2 hidden font-mono text-[11px] font-normal text-faint sm:inline">
              / Robinhood Chain
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative py-1 transition-colors ${
                  active ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {l.label}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute -bottom-[15px] left-0 right-0 h-[2px] bg-cobalt"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2.5 md:flex">
          <ThemeToggle />
          <Link
            href="/rankings"
            className="inline-flex shrink-0 items-center rounded-full border border-line bg-card px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:border-ink/30"
          >
            Directory Table
          </Link>
          <LaunchpadScanner />
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-md border border-line text-ink"
          >
            <span className="sr-only">Menu</span>
            {open ? '✕' : '☰'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-line md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 py-3">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2.5 text-sm ${
                    pathname === l.href ? 'bg-panel text-ink' : 'text-muted'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-2 flex items-center gap-2.5 border-t border-line-soft pt-3">
                <Link
                  href="/rankings"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center rounded-full border border-line bg-card px-4 py-2 text-[13px] font-medium text-ink"
                >
                  Directory Table
                </Link>
                <LaunchpadScanner />
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
