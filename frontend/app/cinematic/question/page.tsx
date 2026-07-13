"use client";

/**
 * Scene 6 — "Hero Question"  ·  route: /cinematic/question
 *
 * The repository is shown. A cursor appears and slowly types the hero question:
 * "Why doesn't Dropdown use a native select element?" It pauses, the cursor
 * blinks, and "Searching Engineering Memory…" resolves beneath — the moment
 * right before the live replay begins.
 *
 * Self-contained & refresh-replayable. ~6.5s. Ends on a stable frame.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, Sparkles } from "lucide-react";
import CinematicStage from "@/components/cinematic/CinematicStage";
import { easeKeynote, palette, rgba } from "@/components/cinematic/tokens";

const QUESTION = "Why doesn't Dropdown use a native select element?";
const TYPE_START = 1300;
const CHAR_MS = 55;

export default function QuestionScene() {
  const [typed, setTyped] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= QUESTION.length; i++) {
      // gentle jitter so it feels hand-typed, not mechanical
      const jitter = (i % 7) * 6;
      timers.push(
        setTimeout(() => setTyped(QUESTION.slice(0, i)), TYPE_START + i * CHAR_MS + jitter)
      );
    }
    const doneAt = TYPE_START + QUESTION.length * CHAR_MS + 1000;
    timers.push(setTimeout(() => setSearching(true), doneAt));
    return () => timers.forEach(clearTimeout);
  }, []);

  const typingDone = typed.length === QUESTION.length;

  return (
    <CinematicStage glow="rgba(245,158,11,0.05)">
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        {/* Repository chip */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: easeKeynote }}
          className="mb-8 flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px]"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: palette.inkDim,
          }}
        >
          <GitBranch size={13} color={palette.amber} />
          <span className="font-mono">razorpay/blade</span>
        </motion.div>

        {/* Ask input */}
        <motion.div
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: 0.2, ease: easeKeynote }}
          className="flex w-full max-w-[720px] items-center gap-3 rounded-2xl px-6 py-5"
          style={{
            background: "linear-gradient(180deg, rgba(22,22,25,0.9), rgba(14,14,16,0.92))",
            border: `1px solid ${rgba(palette.amber, 0.25)}`,
            boxShadow: `0 20px 60px rgba(0,0,0,0.55), 0 0 30px ${rgba(palette.amber, 0.08)}`,
          }}
        >
          <Sparkles size={18} color={palette.amber} className="shrink-0" />
          <div
            className="flex-1 text-[18px] md:text-[20px]"
            style={{ color: palette.ink, letterSpacing: "-0.01em" }}
          >
            {typed}
            <motion.span
              aria-hidden
              className="ml-[1px] inline-block align-middle"
              style={{
                width: 2,
                height: "1.15em",
                background: palette.amber,
                transform: "translateY(2px)",
              }}
              animate={{ opacity: typingDone ? [1, 0, 1] : 1 }}
              transition={
                typingDone
                  ? { duration: 1, repeat: Infinity, ease: "linear" }
                  : { duration: 0 }
              }
            />
            {typed.length === 0 && (
              <span style={{ color: palette.inkFaint }}>Ask about a decision…</span>
            )}
          </div>
        </motion.div>

        {/* Searching Engineering Memory */}
        <div className="mt-8 h-8">
          <AnimatePresence>
            {searching && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: easeKeynote }}
                className="flex items-center gap-3"
              >
                <span
                  className="text-[15px] font-medium"
                  style={{
                    background: `linear-gradient(90deg, ${palette.inkDim} 20%, ${palette.amber} 50%, ${palette.inkDim} 80%)`,
                    backgroundSize: "200% 100%",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    animation: "cin-shimmer 2.2s linear infinite",
                  }}
                >
                  Searching Engineering Memory
                </span>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: palette.amber }}
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        @keyframes cin-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </CinematicStage>
  );
}
