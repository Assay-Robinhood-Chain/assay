import { rampColor } from "@/lib/scoring";
import { MIN_SAMPLE_SIZE_FOR_CONFIDENCE } from "@/lib/constants";

const RAMP_CLASSES: Record<string, string> = {
  green: "text-up",
  amber: "text-gold",
  red: "text-down",
};

export default function ScoreBadge({
  score,
  stars,
  isProvisional,
  sampleSize,
  size = "md",
}: {
  score: number;
  stars: 0 | 1 | 2 | 3;
  isProvisional: boolean;
  sampleSize: number;
  size?: "sm" | "md" | "lg";
}) {
  const color = rampColor(score);
  const dims = {
    sm: { num: "text-lg", stars: "text-[11px]", pad: "px-2.5 py-1.5" },
    md: { num: "text-2xl", stars: "text-xs", pad: "px-3.5 py-2.5" },
    lg: { num: "text-4xl", stars: "text-sm", pad: "px-5 py-4" },
  }[size];

  if (isProvisional) {
    // Distinct shape, not just smaller text: dashed border + diamond corner clip
    return (
      <div
        className={`group relative inline-flex items-center gap-3 rounded-xl border border-dashed border-faint/70 bg-panel ${dims.pad}`}
        title={`Provisional: sample size ${sampleSize} is below the ${MIN_SAMPLE_SIZE_FOR_CONFIDENCE}-launch confidence threshold. Star rating capped until more data is tracked.`}
      >
        <div className="flex flex-col items-start">
          <span className={`font-mono font-semibold text-ink-soft ${dims.num}`}>
            {score.toFixed(1)}
          </span>
          <span className={`font-mono text-faint ${dims.stars}`}>
            {"★".repeat(stars)}
            {"☆".repeat(3 - stars)} · provisional
          </span>
        </div>
        <span className="absolute -top-2 -right-2 rounded-full border border-line bg-card px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-faint">
          ?
        </span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-3 rounded-xl border border-line bg-card ${dims.pad}`}
      title={`Final score ${score.toFixed(1)} / 100 (sample size ${sampleSize})`}
    >
      <div className="flex flex-col items-start">
        <span className={`font-mono font-semibold ${RAMP_CLASSES[color]} ${dims.num}`}>
          {score.toFixed(1)}
        </span>
        <span className={`font-mono text-muted ${dims.stars}`}>
          {"★".repeat(stars)}
          {"☆".repeat(3 - stars)}
        </span>
      </div>
    </div>
  );
}
