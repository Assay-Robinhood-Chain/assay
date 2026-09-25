import Link from 'next/link';
import { Launchpad } from '@/lib/types';
import { rampColor } from '@/lib/scoring';
import Reveal from '@/components/Reveal';

const RAMP_ACCENT: Record<
  'green' | 'amber' | 'red',
  { text: string; ring: string; glow: string; bar: string }
> = {
  green: {
    text: 'text-up',
    ring: 'hover:border-up/50',
    glow: 'hover:shadow-[0_16px_36px_-18px_var(--up)]',
    bar: 'bg-up',
  },
  amber: {
    text: 'text-gold',
    ring: 'hover:border-gold/50',
    glow: 'hover:shadow-[0_16px_36px_-18px_var(--gold)]',
    bar: 'bg-gold',
  },
  red: {
    text: 'text-down',
    ring: 'hover:border-down/50',
    glow: 'hover:shadow-[0_16px_36px_-18px_var(--down)]',
    bar: 'bg-down',
  },
};

export default function TopRankedPreview({
  launchpads,
}: {
  launchpads: Launchpad[];
}) {
  const top = launchpads.filter((lp) => !lp.score.isProvisional).slice(0, 3);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {top.map((lp, i) => {
        const color = rampColor(lp.score.finalScore);
        const a = RAMP_ACCENT[color];
        return (
          <Reveal key={lp.id} delay={i * 0.06}>
            <Link
              href={`/launchpad/${lp.slug}`}
              className={`dark-card group relative block h-full overflow-hidden rounded-xl border bg-[#141413] p-5 transition-all duration-300 ease-out hover:-translate-y-1 ${a.ring} ${a.glow}`}
            >
              <span
                className={`absolute inset-x-0 top-0 h-[3px] origin-left scale-x-0 rounded-t-xl transition-transform duration-300 group-hover:scale-x-100 ${a.bar}`}
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-[#6e6c63]">
                  #{i + 1}
                </span>
                <span className={`font-mono text-lg font-semibold ${a.text}`}>
                  {lp.score.finalScore.toFixed(1)}
                </span>
              </div>
              <div className="mt-2 text-sm font-bold text-[#f3f1ea]">
                {lp.name}
              </div>
              <div className="mt-1 font-mono text-[11px] text-[#6e6c63]">
                {'★'.repeat(lp.score.stars)}
                {'☆'.repeat(3 - lp.score.stars)} ·{' '}
                {lp.sampleSize.toLocaleString()} launches tracked
              </div>
              <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-[#b5b2a6]">
                {lp.description}
              </p>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}
