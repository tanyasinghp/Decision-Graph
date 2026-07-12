"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PhaseHeaderProps {
  name: string;
}

export function PhaseHeader({ name }: PhaseHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 py-2 px-4"
    >
      <span className="text-caption font-semibold tracking-wider text-accent uppercase">
        {name}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-accent/30 to-transparent" />
    </motion.div>
  );
}
