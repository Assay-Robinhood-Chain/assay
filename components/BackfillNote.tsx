import { formatDate } from "@/lib/scoring";
import {
  MIN_BACKFILL_FULL_THRESHOLD,
  MAX_BACKFILL_SAMPLE,
  BACKFILL_SAMPLE_RATIO,
} from "@/lib/constants";

/** A launchpad with e.g. 167,000 real launches but 250 tracked ones
 * should never silently present sample_size as if it were the whole
 * population — this makes the gap explicit wherever the sample could
 * be mistaken for a full picture (policy doc, section 6). */
export default function BackfillNote({
  totalUpstream,
  sampleSize,
  onboardedAt,
}: {
  totalUpstream: number | null;
  sampleSize: number;
  onboardedAt: string;
}) {
  if (totalUpstream === null) {
    return (
      <p className="text-[12.5px] text-faint">
        Upstream total launch count unknown for this launchpad's source.{" "}
        <span className="font-mono">{sampleSize.toLocaleString()}</span> launches tracked.
      </p>
    );
  }

  const isFullyCovered = totalUpstream < MIN_BACKFILL_FULL_THRESHOLD;
  const pct = Math.round((sampleSize / totalUpstream) * 100);

  return (
    <div className="rounded-lg border border-line-soft bg-panel px-3.5 py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-medium text-ink-soft">Sample coverage</span>
        <span className="font-mono text-[12.5px] text-ink">
          {sampleSize.toLocaleString()} / {totalUpstream.toLocaleString()} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
        <div
          className="h-full rounded-full bg-cobalt"
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-faint">
        {isFullyCovered ? (
          <>Every launch this launchpad has ever produced is tracked — under the {MIN_BACKFILL_FULL_THRESHOLD}-launch full-sample threshold.</>
        ) : (
          <>
            Backfilled once at onboarding ({formatDate(onboardedAt)}): the {BACKFILL_SAMPLE_RATIO * 100}% most recent launches, capped at {MAX_BACKFILL_SAMPLE.toLocaleString()}. Launches since onboarding are tracked in full via the hourly rotation — this is a one-time sizing rule, not an ongoing sampling limit.
          </>
        )}
      </p>
    </div>
  );
}
