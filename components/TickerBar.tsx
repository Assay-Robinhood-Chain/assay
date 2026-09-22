import { getLaunchpads } from "@/lib/data";
import { rampColor } from "@/lib/scoring";

const RAMP_CLASSES: Record<string, string> = {
  green: "text-up",
  amber: "text-gold",
  red: "text-down",
};

const TAGLINES = [
  "We don't cover launchpads. We audit them.",
  "Confidence is cheap. We priced in the doubt.",
  "That isn't oversight. That's the fox doing inventory on the henhouse.",
  "Nothing here is a compliment. It's a measurement.",
  "We don't flatter launchpads into looking safe.",
  "Measured, not marketed.",
];

function ScoreItem({ name, score, stars }: { name: string; score: number; stars: number }) {
  const color = rampColor(score);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-faint">✦</span>
      <span className="text-ink-soft">{name}</span>
      <span className={RAMP_CLASSES[color]}>{score.toFixed(1)}</span>
      <span className="text-faint">
        {"★".repeat(stars)}
        {"☆".repeat(3 - stars)}
      </span>
    </span>
  );
}

// Server component — reads the same static launchpad data the rest of
// the app does, so the ticker's score readout never drifts from what
// /rankings shows. Interleaved with the editorial taglines from the
// original design so it reads as commentary, not just a stock ticker.
export default function TickerBar() {
  const launchpads = getLaunchpads().filter((lp) => !lp.score.isProvisional);

  const items: React.ReactNode[] = [];
  const n = Math.max(TAGLINES.length, launchpads.length);
  for (let i = 0; i < n; i++) {
    if (TAGLINES[i]) {
      items.push(
        <span key={`t-${i}`} className="inline-flex items-center gap-1.5">
          <span className="text-gold">✦</span>
          {TAGLINES[i]}
        </span>
      );
    }
    const lp = launchpads[i];
    if (lp) {
      items.push(
        <ScoreItem key={lp.slug} name={lp.name} score={lp.score.finalScore} stars={lp.score.stars} />
      );
    }
  }

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden whitespace-nowrap border-b border-line bg-panel py-1.5 font-mono text-[11.5px] tracking-wide text-muted"
    >
      <div className="ticker-track inline-flex w-max gap-8">
        <span className="inline-flex shrink-0 gap-8">{items}</span>
        <span className="inline-flex shrink-0 gap-8">{items}</span>
      </div>
    </div>
  );
}
