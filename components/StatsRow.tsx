"use client";

import { motion } from "framer-motion";

export interface StatItem {
  label: string;
  value: string;
  tone?: "up" | "gold" | "down" | "default";
}

const TONE_CLASS: Record<NonNullable<StatItem["tone"]>, string> = {
  up: "text-up",
  gold: "text-gold",
  down: "text-down",
  default: "text-ink",
};

export default function StatsRow({ items }: { items: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
      {items.map((it, i) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: i * 0.05 }}
          className="bg-card px-4 py-4 transition-colors duration-300 hover:bg-panel/60 sm:px-5"
        >
          <div className={`font-mono text-xl font-semibold ${TONE_CLASS[it.tone ?? "default"]}`}>
            {it.value}
          </div>
          <div className="mt-0.5 text-[11.5px] text-muted">{it.label}</div>
        </motion.div>
      ))}
    </div>
  );
}
