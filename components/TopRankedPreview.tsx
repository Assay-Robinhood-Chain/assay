import Link from "next/link";
import { Launchpad } from "@/lib/types";
import { rampColor } from "@/lib/scoring";
import Reveal from "@/components/Reveal";

export default function TopRankedPreview({ launchpads }: { launchpads: Launchpad[] }) {
  const top = launchpads.filter((lp) => !lp.score.isProvisional).slice(0, 3);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {top.map((lp, i) => {
        const color = rampColor(lp.score.finalScore);
        return (
          <Reveal key={lp.id} delay={i * 0.06}>
            <Link
              href={`/launchpad/${lp.slug}`}
              className="block h-full rounded-xl border border-line bg-card p-5 transition-colors hover:border-faint"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-faint">#{i + 1}</span>
                <span
                  className={`font-mono text-lg font-semibold ${
                    color === "green" ? "text-up" : color === "amber" ? "text-gold" : "text-down"
                  }`}
                >
                  {lp.score.finalScore.toFixed(1)}
                </span>
              </div>
              <div className="mt-2 text-sm font-medium text-ink">{lp.name}</div>
              <div className="mt-1 font-mono text-[11px] text-faint">
                {"★".repeat(lp.score.stars)}
                {"☆".repeat(3 - lp.score.stars)} · {lp.sampleSize.toLocaleString()} launches
                tracked
              </div>
              <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
                {lp.description}
              </p>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}
