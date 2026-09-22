"use client";

import { motion } from "framer-motion";

const STEPS = [
  {
    n: "01",
    title: "Collectors",
    desc: "One adapter per source — Dexscreener, Blockscout, Bitquery/Mobula for documented launchpads, RPC watcher as fallback. Fetch, tag with data_source, push to queue.",
  },
  {
    n: "02",
    title: "Normaliser",
    desc: "Maps each source's payload into the canonical snapshot row, resolves disagreements between sources, writes it, then triggers a recompute.",
  },
  {
    n: "03",
    title: "Metrics Engine",
    desc: "Pure function over snapshot history — graduation status, wash-trading flag, holder concentration. Does not decide a score.",
  },
  {
    n: "04",
    title: "Scorer",
    desc: "Deterministic composite formula across 5 dimensions. Reproducible: same inputs and algorithm_version, same output, every time.",
  },
  {
    n: "05",
    title: "Web / API",
    desc: "Stateless, reads only from Postgres. Stays up even if every collector is down — serves stale-but-labeled data instead.",
  },
];

export default function PipelineFlow() {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {STEPS.map((s, i) => (
        <motion.div
          key={s.n}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: i * 0.08 }}
          className="relative rounded-xl border border-line bg-card p-4"
        >
          <span className="font-mono text-[11px] text-faint">{s.n}</span>
          <div className="mt-1 text-sm font-medium text-ink">{s.title}</div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{s.desc}</p>
          {i < STEPS.length - 1 && (
            <span className="pointer-events-none absolute -right-2.5 top-1/2 hidden -translate-y-1/2 font-mono text-faint sm:block">
              →
            </span>
          )}
        </motion.div>
      ))}
    </div>
  );
}
