"use client";

import { motion } from "framer-motion";
import { cn, confidenceLabel, confidenceColor } from "@/lib/utils";

interface ConfidenceBadgeProps {
  level: string;
  size?: "sm" | "md" | "lg";
}

export function ConfidenceBadge({ level, size = "md" }: ConfidenceBadgeProps) {
  const color = confidenceColor(level);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" && "px-2 py-0.5 text-caption",
        size === "md" && "px-3 py-1 text-small",
        size === "lg" && "px-4 py-1.5 text-body",
        color === "emerald" && "bg-success/10 text-success",
        color === "amber" && "bg-accent/10 text-accent",
        color === "orange" && "bg-orange-500/10 text-orange-400",
        color === "slate" && "bg-text-tertiary/10 text-text-tertiary",
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          color === "emerald" && "bg-success",
          color === "amber" && "bg-accent",
          color === "orange" && "bg-orange-500",
          color === "slate" && "bg-text-tertiary",
        )}
      />
      {confidenceLabel(level)}
    </motion.div>
  );
}
