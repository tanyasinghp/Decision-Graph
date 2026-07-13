"use client";

/**
 * Scene 4 — "Repository Loading"  ·  route: /cinematic/loading
 *
 * A repository (razorpay/blade) is prepared as reasoning context. Five steps
 * resolve in sequence with subtle scan-line progress — never a spinner — each
 * settling into a checked state with a real-looking stat. Ends on a stable
 * "Knowledge Graph Ready" frame, poised to fade into the live application.
 *
 * Self-contained & refresh-replayable. ~7.5s.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitCommit,
  GitPullRequest,
  CircleDot,
  Share2,
  Sparkles,
  Check,
  GitBranch,
  Star,
  type LucideIcon,
} from "lucide-react";
import CinematicStage from "@/components/cinematic/CinematicStage";
import { easeKeynote, palette, rgba } from "@/components/cinematic/tokens";

interface Step {
  icon: LucideIcon;
  label: string;
  stat: string;
  color: string;
}

const STEPS: Step[] = [
  { icon: GitCommit, label: "Parsing commits", stat: "1,284 commits", color: palette.purple },
  { icon: GitPullRequest, label: "Reading pull requests", stat: "412 pull requests", color: palette.emerald },
  { icon: CircleDot, label: "Reading issues", stat: "938 issues", color: palette.blue },
  { icon: Share2, label: "Building knowledge graph", stat: "3,120 nodes · 5,847 edges", color: palette.amber },
  { icon: Sparkles, label: "Extracting architectural decisions", stat: "47 decisions", color: palette.amber },
];

const STEP_MS = 1180;
const FILL_MS = 900;

export default function LoadingScene() {
  // -1 nothing, 0..4 active, 5 = all done
  const [active, setActive] = useState(-1);
  const [done, setDone] = useState<number>(-1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setActive(0), 700));
    for (let i = 0; i < STEPS.length; i++) {
      timers.push(setTimeout(() => setActive(i), 700 + i * STEP_MS));
      timers.push(setTimeout(() => setDone(i), 700 + i * STEP_MS + FILL_MS));
    }
    timers.push(setTimeout(() => setReady(true), 700 + STEPS.length * STEP_MS + 300));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <CinematicStage glow="rgba(245,158,11,0.05)">
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: easeKeynote }}
          className="w-full max-w-[520px] rounded-2xl p-7"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,20,23,0.92), rgba(12,12,14,0.94))",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          }}
        >
          {/* Repo header */}
          <div className="flex items-center gap-3 pb-5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                background: rgba(palette.amber, 0.12),
                border: `1px solid ${rgba(palette.amber, 0.3)}`,
              }}
            >
              <GitBranch size={16} color={palette.amber} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 font-mono text-[15px]">
                <span style={{ color: palette.inkDim }}>razorpay</span>
                <span style={{ color: palette.inkFaint }}>/</span>
                <span style={{ color: palette.ink, fontWeight: 600 }}>blade</span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-[11px]" style={{ color: palette.inkFaint }}>
                <span className="flex items-center gap-1">
                  <Star size={10} /> 2.1k
                </span>
                <span className="flex items-center gap-1">
                  <GitBranch size={10} /> master
                </span>
                <span>design-system</span>
              </div>
            </div>
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{
                background: rgba(palette.emerald, 0.12),
                color: palette.emerald,
                border: `1px solid ${rgba(palette.emerald, 0.3)}`,
              }}
            >
              preparing context
            </span>
          </div>

          <div className="h-px w-full" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* Steps */}
          <div className="flex flex-col gap-1 pt-4">
            {STEPS.map((step, i) => {
              const isActive = active === i && done < i;
              const isDone = done >= i;
              const Icon = step.icon;
              return (
                <div
                  key={step.label}
                  className="relative rounded-lg px-3 py-2.5 transition-colors duration-500"
                  style={{
                    background: isActive ? "rgba(255,255,255,0.035)" : "transparent",
                    opacity: active >= i ? 1 : 0.32,
                  }}
                >
                  <div className="flex items-center gap-3">
                    {/* status glyph */}
                    <div className="flex h-5 w-5 items-center justify-center">
                      <AnimatePresence mode="wait">
                        {isDone ? (
                          <motion.span
                            key="check"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 18 }}
                            className="flex h-5 w-5 items-center justify-center rounded-full"
                            style={{
                              background: rgba(step.color, 0.16),
                              border: `1px solid ${rgba(step.color, 0.55)}`,
                            }}
                          >
                            <Check size={11} color={step.color} strokeWidth={3} />
                          </motion.span>
                        ) : (
                          <Icon
                            key="icon"
                            size={15}
                            color={isActive ? step.color : palette.inkFaint}
                          />
                        )}
                      </AnimatePresence>
                    </div>

                    <span
                      className="flex-1 text-[13.5px]"
                      style={{
                        color: isDone
                          ? palette.inkDim
                          : isActive
                            ? palette.ink
                            : palette.inkFaint,
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      {step.label}
                    </span>

                    {/* stat reveal on done */}
                    {isDone && (
                      <motion.span
                        initial={{ opacity: 0, x: 6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4 }}
                        className="font-mono text-[11px]"
                        style={{ color: rgba(step.color, 0.85) }}
                      >
                        {step.stat}
                      </motion.span>
                    )}
                  </div>

                  {/* scan-line progress (not a spinner) */}
                  <div
                    className="mt-2 h-[2px] w-full overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    {(isActive || isDone) && (
                      <motion.div
                        className="h-full rounded-full"
                        initial={{ width: isDone ? "100%" : "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: isDone ? 0 : FILL_MS / 1000, ease: "easeInOut" }}
                        style={{
                          background: `linear-gradient(90deg, ${rgba(step.color, 0.2)}, ${step.color})`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ready banner */}
          <div className="mt-4 h-px w-full" style={{ background: "rgba(255,255,255,0.06)" }} />
          <div className="flex h-12 items-center justify-center">
            <AnimatePresence>
              {ready && (
                <motion.div
                  initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.7, ease: easeKeynote }}
                  className="mt-3 flex items-center gap-2.5"
                >
                  <motion.span
                    animate={{
                      boxShadow: [
                        `0 0 8px ${rgba(palette.amber, 0.3)}`,
                        `0 0 20px ${rgba(palette.amber, 0.55)}`,
                        `0 0 8px ${rgba(palette.amber, 0.3)}`,
                      ],
                    }}
                    transition={{ duration: 2.4, repeat: Infinity }}
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{
                      background: rgba(palette.amber, 0.16),
                      border: `1px solid ${rgba(palette.amber, 0.6)}`,
                    }}
                  >
                    <Check size={13} color={palette.amber} strokeWidth={3} />
                  </motion.span>
                  <span
                    className="text-[16px] font-semibold"
                    style={{ color: palette.ink, letterSpacing: "-0.01em" }}
                  >
                    Knowledge Graph Ready
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </CinematicStage>
  );
}
