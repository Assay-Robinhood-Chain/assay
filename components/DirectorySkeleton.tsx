export default function DirectorySkeleton() {
  return (
    <div aria-hidden="true" aria-label="Loading directory">
      {/* Desktop table skeleton */}
      <div className="dark-card hidden overflow-hidden rounded-xl border bg-[#141413] md:block">
        <div className="grid grid-cols-[2.5fr_1fr_1fr_1fr_1fr] gap-4 border-b border-[#302f2a] bg-[#1b1b18] px-5 py-3 text-[11px] font-medium uppercase tracking-wide text-[#6e6c63]">
          <span>Launchpad</span>
          <span>Score</span>
          <span>Quality</span>
          <span>Market health</span>
          <span>Sample</span>
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="grid animate-pulse grid-cols-[2.5fr_1fr_1fr_1fr_1fr] items-center gap-4 border-b border-[#262620] px-5 py-4 last:border-0"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#262620]" />
              <div className="space-y-1.5">
                <div className="h-3 w-32 rounded bg-[#262620]" />
                <div className="h-2.5 w-20 rounded bg-[#262620]" />
              </div>
            </div>
            <div className="h-6 w-14 rounded bg-[#262620]" />
            <div className="h-2 w-full rounded-full bg-[#262620]" />
            <div className="h-2 w-full rounded-full bg-[#262620]" />
            <div className="h-3 w-10 rounded bg-[#262620]" />
          </div>
        ))}
      </div>

      {/* Mobile card skeleton */}
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="dark-card animate-pulse rounded-xl border bg-[#141413] p-4"
          >
            <div className="mb-3 flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#262620]" />
              <div className="space-y-1.5">
                <div className="h-3 w-28 rounded bg-[#262620]" />
                <div className="h-2.5 w-16 rounded bg-[#262620]" />
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-[#262620]" />
          </div>
        ))}
      </div>
    </div>
  );
}
