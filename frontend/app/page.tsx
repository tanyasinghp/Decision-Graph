"use client";

import { motion } from "framer-motion";
import { ArrowRight, Eye, GitBranch } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-24">
      <div className="max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="text-display text-text-primary mb-4 tracking-tight">
            Decision Graph
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="text-subheading text-text-secondary mb-6"
        >
          AI that reconstructs why software evolves.
        </motion.p>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="text-body text-text-tertiary max-w-xl mx-auto mb-12 leading-relaxed"
        >
          Organizations remember code. They forget decisions.
          <br />
          Decision Graph reconstructs product reasoning from engineering evidence.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center gap-4"
        >
          <Link
            href="/demo"
            className={cn(
              "inline-flex items-center gap-2 px-6 py-3 rounded-lg",
              "bg-accent text-black font-medium text-body",
              "hover:bg-accent-hover transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-accent/50"
            )}
          >
            Analyze Repository
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/demo"
            className={cn(
              "inline-flex items-center gap-2 px-6 py-3 rounded-lg",
              "border border-border text-text-secondary text-body font-medium",
              "hover:border-border-light hover:text-text-primary transition-colors duration-200",
              "focus:outline-none focus:ring-2 focus:ring-accent/50"
            )}
          >
            <Eye className="w-4 h-4" />
            View Demo
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.5 }}
        className="absolute bottom-8 flex items-center gap-2 text-caption text-text-tertiary"
      >
        <GitBranch className="w-3 h-3" />
        razorpay/blade
      </motion.div>
    </main>
  );
}
