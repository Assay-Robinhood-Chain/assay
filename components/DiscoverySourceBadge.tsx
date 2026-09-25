import { DiscoverySource } from '@/lib/types';
import { DISCOVERY_SOURCE_LABELS } from '@/lib/constants';

const DOT: Record<DiscoverySource, string> = {
  bitquery: 'bg-cobalt',
  mobula: 'bg-gold',
  rpc_self_indexed: 'bg-muted',
};

export default function DiscoverySourceBadge({
  source,
  href,
}: {
  source: DiscoverySource;
  href?: string;
}) {
  const content = (
    <span className="discovery-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[source]}`} />
      {DISCOVERY_SOURCE_LABELS[source]}
    </span>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="hover:opacity-80"
      >
        {content}
      </a>
    );
  }
  return content;
}
