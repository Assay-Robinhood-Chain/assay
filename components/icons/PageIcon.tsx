/** Line-icon set for section headers across Rankings, Methodology,
 * Get Listed, and the Launchpad/Token detail pages — same drawn style as
 * SourceIcon (stroke-only, 24x24) so the whole site reads as one icon set. */

const common = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export type PageIconKind =
  | 'shield'
  | 'shieldCheck'
  | 'sliders'
  | 'tiers'
  | 'hourglass'
  | 'stack'
  | 'grid'
  | 'trend'
  | 'crown'
  | 'flag'
  | 'send'
  | 'review'
  | 'checkCircle'
  | 'bars'
  | 'archive'
  | 'timeline'
  | 'medal'
  | 'list';

export function PageIcon({
  kind,
  size = 16,
}: {
  kind: PageIconKind;
  size?: number;
}) {
  const props = { ...common, width: size, height: size };

  switch (kind) {
    case 'shield':
      return (
        <svg {...props}>
          <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-2.5Z" />
        </svg>
      );
    case 'shieldCheck':
      return (
        <svg {...props}>
          <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-2.5Z" />
          <path d="m9 12 2 2 4-4.3" />
        </svg>
      );
    case 'sliders':
      return (
        <svg {...props}>
          <path d="M4 6h9M17 6h3M4 18h3M11 18h9" />
          <circle cx="14.5" cy="6" r="2.3" />
          <circle cx="8" cy="18" r="2.3" />
        </svg>
      );
    case 'tiers':
      return (
        <svg {...props}>
          <rect x="3.5" y="14" width="4.5" height="6.5" rx="1" />
          <rect x="9.75" y="9.5" width="4.5" height="11" rx="1" />
          <rect x="16" y="4.5" width="4.5" height="16" rx="1" />
        </svg>
      );
    case 'hourglass':
      return (
        <svg {...props}>
          <path d="M6 3.5h12M6 20.5h12" />
          <path d="M7 3.5v3.2c0 2 1.8 3.4 3.6 4.3.4.2.8.2 1.2 0C13.2 10.1 15 8.7 15 6.7V3.5" />
          <path d="M7 20.5v-3.2c0-2 1.8-3.4 3.6-4.3.4-.2.8-.2 1.2 0 1.8.9 3.6 2.3 3.6 4.3v3.2" />
        </svg>
      );
    case 'stack':
      return (
        <svg {...props}>
          <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" />
          <path d="m3.5 12 8.5 4.5 8.5-4.5" />
          <path d="m3.5 16.5 8.5 4.5 8.5-4.5" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...props}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
        </svg>
      );
    case 'trend':
      return (
        <svg {...props}>
          <path d="M4 17 9.5 10l4 3.5L20 6" />
          <path d="M14.5 6H20v5.5" />
        </svg>
      );
    case 'crown':
      return (
        <svg {...props}>
          <path d="M4 18h16" />
          <path d="m4 18-1.2-8.5L8 13l4-7 4 7 5.2-3.5L20 18" />
        </svg>
      );
    case 'flag':
      return (
        <svg {...props}>
          <path d="M6 21V4" />
          <path d="M6 4.5h11l-2.8 4L17 12.5H6" />
        </svg>
      );
    case 'send':
      return (
        <svg {...props}>
          <path d="M20.5 3.5 3 10.2l6.6 2.4 2.4 6.6 8.5-15.7Z" />
          <path d="M20.5 3.5 9.6 12.6" />
        </svg>
      );
    case 'review':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20.5 20.5-4.3-4.3" />
          <path d="m8.2 11 2 2 3.6-4" />
        </svg>
      );
    case 'checkCircle':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.2 12.3 2.5 2.5 5.1-5.6" />
        </svg>
      );
    case 'bars':
      return (
        <svg {...props}>
          <path d="M3 21h18" />
          <rect x="5.5" y="12" width="3" height="9" />
          <rect x="10.5" y="7" width="3" height="14" />
          <rect x="15.5" y="15" width="3" height="6" />
        </svg>
      );
    case 'archive':
      return (
        <svg {...props}>
          <rect x="3.5" y="4" width="17" height="4.5" rx="1" />
          <path d="M5 8.5v9.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V8.5" />
          <path d="M10 13h4" />
        </svg>
      );
    case 'timeline':
      return (
        <svg {...props}>
          <path d="M4 6h16M4 18h16" />
          <circle cx="8" cy="6" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="6" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="11" cy="18" r="1.6" fill="currentColor" stroke="none" />
          <path d="M8 7.6v3a2 2 0 0 0 2 2h2a2 2 0 0 1 2 2v1.8" />
        </svg>
      );
    case 'medal':
      return (
        <svg {...props}>
          <circle cx="12" cy="14.5" r="6" />
          <path d="m9 3 3 5.5L15 3" />
          <path d="M10.3 12.5 12 11l1.7 1.5-.4 2.2H10.7l-.4-2.2Z" />
        </svg>
      );
    case 'list':
      return (
        <svg {...props}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <circle cx="4.2" cy="6" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="4.2" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="4.2" cy="18" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
