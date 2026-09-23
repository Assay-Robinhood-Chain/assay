/** Custom line-icons used across the site for third-party data sources and
 * pipeline stages — deliberately not emoji, so every card reads as part of
 * the same drawn icon set instead of borrowing whatever glyphs a font ships. */

const common = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export type SourceKind =
  | 'telemetry'
  | 'contract'
  | 'discovery'
  | 'orbit'
  | 'signal';

export function SourceIcon({
  kind,
  size = 15,
}: {
  kind: SourceKind;
  size?: number;
}) {
  const props = { ...common, width: size, height: size };

  switch (kind) {
    case 'telemetry':
      // Ascending bars + trend line — market telemetry.
      return (
        <svg {...props}>
          <path d="M3 21h18" />
          <rect x="5.5" y="13" width="3" height="8" />
          <rect x="11" y="8.5" width="3" height="12.5" />
          <rect x="16.5" y="4" width="3" height="17" />
          <path d="M4.5 10.5 9 6l4 3 6.5-6.5" />
        </svg>
      );
    case 'contract':
      // Verified document — contract & holder data.
      return (
        <svg {...props}>
          <path d="M13.5 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h9a1.5 1.5 0 0 0 1.5-1.5V8.5L13.5 3Z" />
          <path d="M13.5 3v4.5a1 1 0 0 0 1 1H19" />
          <path d="M8.5 13.2h5.2" />
          <path d="m8.5 15.6 1.6 1.6 3-3.4" />
        </svg>
      );
    case 'discovery':
      // Radar sweep locating a node — launch discovery.
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" strokeDasharray="2 3" />
          <path d="M12 12 18 7" />
          <circle
            cx="18.4"
            cy="6.4"
            r="1.6"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
    case 'orbit':
      // Two crossed orbital ellipses — bonding/graduation reference docs.
      return (
        <svg {...props}>
          <ellipse cx="12" cy="12" rx="9" ry="4" />
          <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'signal':
      // Broadcasting antenna — self-indexed RPC fallback watcher.
      return (
        <svg {...props}>
          <path d="M12 21v-8" />
          <circle cx="12" cy="10.5" r="2.3" />
          <path d="M8.2 9.5a5.3 5.3 0 0 1 0-6.4" />
          <path d="M15.8 9.5a5.3 5.3 0 0 0 0-6.4" />
          <path d="M5.3 11.6a9 9 0 0 1 0-11" />
          <path d="M18.7 11.6a9 9 0 0 0 0-11" />
        </svg>
      );
  }
}

export type PipelineKind = 'intake' | 'merge' | 'gauge' | 'seal' | 'server';

export function PipelineIcon({
  kind,
  size = 16,
}: {
  kind: PipelineKind;
  size?: number;
}) {
  const props = { ...common, width: size, height: size };

  switch (kind) {
    case 'intake':
      // Multiple sources funnelling into one queue.
      return (
        <svg {...props}>
          <circle cx="4.5" cy="5" r="1.4" />
          <circle cx="4.5" cy="12" r="1.4" />
          <circle cx="4.5" cy="19" r="1.4" />
          <path d="M6.2 5h3.3l3 7-3 7H6.2" />
          <path d="M12.5 12H21" />
          <path d="m18 8.7 3.3 3.3-3.3 3.3" />
        </svg>
      );
    case 'merge':
      // Two staggered rows aligning into one canonical row.
      return (
        <svg {...props}>
          <path d="M3 6h11" />
          <path d="M3 12h7" />
          <path d="M3 18h14" />
          <path d="m16.5 9-3-3 3-3" />
          <path d="m14 3h6" />
        </svg>
      );
    case 'gauge':
      // Dial + needle — pure metrics computation.
      return (
        <svg {...props}>
          <path d="M4 16a8 8 0 1 1 16 0" />
          <path d="M12 16 16 9" />
          <path d="M4 16h1.6" />
          <path d="M18.4 16H20" />
        </svg>
      );
    case 'seal':
      // Ribbon seal with a check — deterministic scored output.
      return (
        <svg {...props}>
          <circle cx="12" cy="9.5" r="6" />
          <path d="m9.3 9.6 1.8 1.8 3.4-3.6" />
          <path d="M8.7 14.6 7.2 21l4.8-2.6 4.8 2.6-1.5-6.4" />
        </svg>
      );
    case 'server':
      // Stacked stateless server rack — read-only web/API layer.
      return (
        <svg {...props}>
          <rect x="3.5" y="4" width="17" height="6" rx="1.4" />
          <rect x="3.5" y="14" width="17" height="6" rx="1.4" />
          <path d="M7 7h.01" />
          <path d="M7 17h.01" />
          <path d="M12 7h5" />
          <path d="M12 17h5" />
        </svg>
      );
  }
}
