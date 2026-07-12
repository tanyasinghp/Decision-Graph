"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  accent?: boolean;
  delay?: number;
}

export function StatCard({ label, value, accent, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "rounded-xl border bg-surface px-5 py-4",
        accent ? "border-accent/30" : "border-border",
      )}
    >
      <p className="text-stat text-text-primary tabular-nums">{value}</p>
      <p
        className={cn(
          "text-small mt-1",
          accent ? "text-accent" : "text-text-tertiary",
        )}
      >
        {label}
      </p>
    </motion.div>
  );
}
