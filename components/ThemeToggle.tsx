'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function getStoredTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' ? 'dark' : 'light';
}

export default function ThemeToggle() {
  // Mirrors whatever the inline head script already applied to <html>,
  // so there's no flash/mismatch on first paint.
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('assay_theme', next);
    setTheme(next);
  }

  const isDark = mounted && theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light / dark theme"
      title="Toggle light / dark theme"
      className="layout-surface grid h-9 w-9 shrink-0 place-items-center rounded-full border bg-card text-ink-soft hover:text-ink"
    >
      {isDark ? (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      ) : (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4.5" />
          <line x1="12" y1="1.5" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22.5" />
          <line x1="4.2" y1="4.2" x2="5.9" y2="5.9" />
          <line x1="18.1" y1="18.1" x2="19.8" y2="19.8" />
          <line x1="1.5" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22.5" y2="12" />
          <line x1="4.2" y1="19.8" x2="5.9" y2="18.1" />
          <line x1="18.1" y1="5.9" x2="19.8" y2="4.2" />
        </svg>
      )}
    </button>
  );
}
