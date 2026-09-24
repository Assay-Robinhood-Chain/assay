import { formatDate } from '@/lib/scoring';
import {
  STALE_DATA_THRESHOLD_HOURS,
  MIN_SAMPLE_SIZE_FOR_CONFIDENCE,
  MIN_DATA_POINTS_PER_DIMENSION,
} from '@/lib/constants';

export function StaleLabel({ lastSnapshotAt }: { lastSnapshotAt: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold-soft px-2.5 py-1 text-[11.5px] font-medium text-gold">
      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
      Data may be stale — last updated {formatDate(lastSnapshotAt)} (older than{' '}
      {STALE_DATA_THRESHOLD_HOURS}h)
    </span>
  );
}

export function ProvisionalNote({
  sampleSize,
  missingDimensions = 0,
}: {
  sampleSize: number;
  /** How many of the five dimensions have no data yet. */
  missingDimensions?: number;
}) {
  const smallSample = sampleSize < MIN_SAMPLE_SIZE_FOR_CONFIDENCE;
  return (
    <p className="rounded-lg border border-dashed border-faint/60 bg-panel px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
      This score is <strong>provisional</strong>.{' '}
      {smallSample && (
        <>
          With a tracked sample of{' '}
          <span className="font-mono">{sampleSize}</span> launches — below the{' '}
          <span className="font-mono">{MIN_SAMPLE_SIZE_FOR_CONFIDENCE}</span>
          -launch confidence threshold —{' '}
        </>
      )}
      {missingDimensions > 0 && (
        <>
          {smallSample ? 'and ' : ''}
          <span className="font-mono">{missingDimensions}</span> of 5 dimensions
          do not have data from at least{' '}
          <span className="font-mono">{MIN_DATA_POINTS_PER_DIMENSION}</span>{' '}
          launches yet, so they are left out of the composite (the remaining
          weights are rescaled) —{' '}
        </>
      )}
      the star rating is capped at 1 regardless of the raw composite score. This
      is enforced in the scoring engine itself, not a frontend warning.
    </p>
  );
}

export function NotYetScored() {
  return (
    <div className="rounded-lg border border-line-soft bg-panel px-4 py-6 text-center">
      <p className="text-sm font-medium text-ink-soft">Not yet scored</p>
      <p className="mt-1 text-[12.5px] text-muted">
        This launchpad does not have enough measurable data yet. A score
        appears once its tokens are old enough to judge and enough dimensions
        have data.
      </p>
    </div>
  );
}
