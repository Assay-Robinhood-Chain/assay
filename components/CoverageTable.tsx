import Link from "next/link";
import { CoverageRow, ConfidenceFloor } from "@/lib/coverage";
import { formatDate } from "@/lib/scoring";
import DiscoverySourceBadge from "./DiscoverySourceBadge";

const FLOOR_CLASS: Record<ConfidenceFloor, string> = {
  high: "bg-up-soft text-up",
  med: "bg-gold-soft text-gold",
  low: "bg-down-soft text-down",
};

export default function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-panel">
            {["Launchpad", "Status", "Discovery source", "Sample / upstream total", "Confidence floor", "Last ingested"].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-faint"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ launchpad: lp, confidenceFloor }) => (
            <tr key={lp.id} className="border-b border-line-soft last:border-0 hover:bg-panel/50">
              <td className="px-4 py-3">
                <Link href={`/launchpad/${lp.slug}`} className="font-medium text-ink hover:text-cobalt">
                  {lp.name}
                </Link>
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-up">
                  <span className="h-1.5 w-1.5 rounded-full bg-up" />
                  Indexed
                </span>
              </td>
              <td className="px-4 py-3">
                <DiscoverySourceBadge source={lp.discoverySource} href={lp.discoverySourceUrl} />
              </td>
              <td className="px-4 py-3 font-mono text-[12.5px] text-ink-soft">
                {lp.sampleSize.toLocaleString()} / {lp.totalLaunchesUpstream?.toLocaleString() ?? "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide ${FLOOR_CLASS[confidenceFloor]}`}
                >
                  {confidenceFloor}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-faint">
                {formatDate(lp.lastSnapshotAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
