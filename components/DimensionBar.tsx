"use client";

import { motion, type Easing } from "framer-motion";
import { rampColor } from "@/lib/scoring";

const EASE: Easing = [0.22, 1, 0.36, 1];

const BAR_COLOR: Record<string, string> = {
  green: "bg-up",
  amber: "bg-gold",
  red: "bg-down",
};

export default function DimensionBar({
  label,
  value,
  weight,
  description,
  delay = 0,
}: {
  label: string;
  value: number;
  weight: number;
  description?: string;
  delay?: number;
}) {
  const color = rampColor(value);

  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink">{label}</span>
          <span className="font-mono text-[11px] text-faint">×{weight.toFixed(2)}</span>
        </div>
        <span className="font-mono text-sm text-ink-soft">{value.toFixed(0)}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-line-soft">
        <motion.div
          className={`h-full rounded-full ${BAR_COLOR[color]}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${value}%` }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.7, delay, ease: EASE }}
        />
      </div>
      {description && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{description}</p>
      )}
    </div>
  );
}
