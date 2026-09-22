export default function DirectorySkeleton() {
  return (
    <div aria-hidden="true" aria-label="Loading directory">
      {/* Desktop table skeleton */}
      <div className="hidden overflow-hidden rounded-xl border border-line md:block">
        <div className="grid grid-cols-[2.5fr_1fr_1fr_1fr_1fr] gap-4 border-b border-line bg-panel px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-faint">
          <span>Launchpad</span>
          <span>Score</span>
          <span>Quality</span>
          <span>Market health</span>
          <span>Sample</span>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="grid animate-pulse grid-cols-[2.5fr_1fr_1fr_1fr_1fr] items-center gap-4 border-b border-line-soft px-5 py-4 last:border-0"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-line-soft" />
              <div className="space-y-1.5">
                <div className="h-3 w-32 rounded bg-line-soft" />
                <div className="h-2.5 w-20 rounded bg-line-soft" />
              </div>
            </div>
            <div className="h-6 w-14 rounded bg-line-soft" />
            <div className="h-2 w-full rounded-full bg-line-soft" />
            <div className="h-2 w-full rounded-full bg-line-soft" />
            <div className="h-3 w-10 rounded bg-line-soft" />
          </div>
        ))}
      </div>

      {/* Mobile card skeleton */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-line bg-card p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-line-soft" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-line-soft" />
                <div className="h-2.5 w-16 rounded bg-line-soft" />
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-line-soft" />
          </div>
        ))}
      </div>
    </div>
  );
}
