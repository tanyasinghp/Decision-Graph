"use client";

/**
 * Scene 1 — "The Problem"  ·  route: /cinematic/problem
 *
 * Six GitHub engineering artifacts appear one-by-one with a subtle spring
 * (250ms stagger). Relationship lines briefly connect a few of them. A short
 * pause, then physics-like scatter flings every card away from center. Finally
 * the keynote lines resolve: "The code remembers what changed." → "But who
 * remembers why?"
 *
 * Self-contained & refresh-replayable. ~11s. Ends on a stable final frame.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import CinematicStage from "@/components/cinematic/CinematicStage";
import ArtifactCard from "@/components/cinematic/ArtifactCard";
import KeynoteText from "@/components/cinematic/KeynoteText";
import {
  ARTIFACTS,
  springSoft,
  springScatter,
  palette,
  rgba,
  mulberry32,
} from "@/components/cinematic/tokens";

type Phase = "enter" | "connect" | "hold" | "scatter" | "text1" | "text2";

// Loose scattered cluster of home positions (px offsets from center).
const HOME = [
  { x: -330, y: -128 },
  { x: 40, y: -178 },
  { x: 348, y: -70 },
  { x: -308, y: 116 },
  { x: 26, y: 150 },
  { x: 330, y: 138 },
];

// Relationship pairs briefly drawn between artifacts.
const LINKS: [number, number][] = [
  [0, 2],
  [1, 4],
  [3, 5],
  [0, 4],
  [2, 5],
];

const rnd = mulberry32(7);
// Precompute scatter targets + rotation so replays are identical.
const SCATTER = HOME.map((h) => {
  const len = Math.hypot(h.x, h.y) || 1;
  const dist = 1500 + rnd() * 500;
  return {
    x: (h.x / len) * dist + (rnd() - 0.5) * 260,
    y: (h.y / len) * dist + (rnd() - 0.5) * 260,
    rot: (rnd() - 0.5) * 90,
  };
});

const cardVariants: Variants = {
  hidden: (i: number) => ({
    opacity: 0,
    scale: 0.82,
    x: HOME[i]!.x,
    y: HOME[i]!.y + 16,
  }),
  show: (i: number) => ({
    opacity: 1,
    scale: 1,
    x: HOME[i]!.x,
    y: HOME[i]!.y,
    rotate: 0,
    transition: springSoft,
  }),
  scatter: (i: number) => ({
    opacity: 0,
    scale: 0.55,
    x: SCATTER[i]!.x,
    y: SCATTER[i]!.y,
    rotate: SCATTER[i]!.rot,
    transition: springScatter,
  }),
};

const parentVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.25, delayChildren: 0.2 } },
  scatter: { transition: { staggerChildren: 0.05 } },
};

export default function ProblemScene() {
  const [phase, setPhase] = useState<Phase>("enter");

  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    t.push(setTimeout(() => setPhase("connect"), 2300));
    t.push(setTimeout(() => setPhase("hold"), 3900));
    t.push(setTimeout(() => setPhase("scatter"), 5900));
    t.push(setTimeout(() => setPhase("text1"), 7100));
    t.push(setTimeout(() => setPhase("text2"), 9500));
    return () => t.forEach(clearTimeout);
  }, []);

  const cardsScattered =
    phase === "scatter" || phase === "text1" || phase === "text2";
  const showLinks = phase === "connect";

  return (
    <CinematicStage glow="rgba(245,158,11,0.06)">
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Relationship lines overlay (anchored to home positions) */}
        <svg
          className="pointer-events-none absolute"
          width={1400}
          height={620}
          style={{ overflow: "visible" }}
        >
          <g transform="translate(700,310)">
            <AnimatePresence>
              {showLinks &&
                LINKS.map(([a, b], i) => (
                  <motion.line
                    key={`${a}-${b}`}
                    x1={HOME[a]!.x}
                    y1={HOME[a]!.y}
                    x2={HOME[b]!.x}
                    y2={HOME[b]!.y}
                    stroke={rgba(palette.amber, 0.5)}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 0.7 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      pathLength: { duration: 0.6, delay: i * 0.08 },
                      opacity: { duration: 0.4, delay: i * 0.08 },
                    }}
                  />
                ))}
            </AnimatePresence>
          </g>
        </svg>

        {/* Artifact cards */}
        <motion.div
          className="absolute"
          variants={parentVariants}
          initial="hidden"
          animate={cardsScattered ? "scatter" : "show"}
        >
          {ARTIFACTS.map((meta, i) => (
            <motion.div
              key={meta.kind}
              className="absolute left-0 top-0"
              style={{ marginLeft: -134, marginTop: -46 }}
              custom={i}
              variants={cardVariants}
            >
              <ArtifactCard meta={meta} glow={showLinks ? 0.4 : 0} />
            </motion.div>
          ))}
        </motion.div>

        {/* Keynote text */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
          {phase === "text1" && (
            <KeynoteText size="lg" exitAfter={1.2}>
              The code remembers what changed.
            </KeynoteText>
          )}
          {phase === "text2" && (
            <KeynoteText size="xl" weight={600}>
              But who remembers{" "}
              <span style={{ color: palette.amber }}>why?</span>
            </KeynoteText>
          )}
        </div>
      </div>
    </CinematicStage>
  );
}
