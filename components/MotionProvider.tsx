"use client";

import { MotionConfig } from "framer-motion";
import { ReactNode } from "react";

// reducedMotion="user" makes every animate/whileInView/layout transition
// in the app defer to the OS-level prefers-reduced-motion setting
// automatically (brief, 11.4: "respect prefers-reduced-motion; no
// auto-playing or looping animation anywhere").
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
