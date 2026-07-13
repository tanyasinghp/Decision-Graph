"use client";

/**
 * Scene 10 — "End Card"  ·  route: /cinematic/end
 *
 * Premium closing frame. A very subtle Decision Graph drifts behind everything
 * on black; the wordmark fades in with a soft amber glow, followed by the
 * subtitle, repository line and a small "Built with Claude" footer. Understated,
 * almost still — it holds.
 *
 * Self-contained, deterministic & refresh-replayable. Holds ~5s+.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import CinematicStage from "@/components/cinematic/CinematicStage";
import { easeKeynote, mulberry32, palette, rgba } from "@/components/cinematic/tokens";

interface BgNode {
  x: number;
  y: number;
  r: number;
  op: number;
}

function buildBackdrop() {
  const rnd = mulberry32(555);
  const nodes: BgNode[] = Array.from({ length: 30 }, () => ({
    x: (rnd() - 0.5) * 1700,
    y: (rnd() - 0.5) * 900,
    r: 2 + rnd() * 3,
    op: 0.1 + rnd() * 0.22,
  }));
  // connect near neighbours for a faint web
  const edges: [number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 300) edges.push([i, j]);
    }
  }
  return { nodes, edges };
}

export default function EndScene() {
  const { nodes, edges } = useMemo(buildBackdrop, []);

  return (
    <CinematicStage glow="rgba(245,158,11,0.05)">
      {/* Subtle drifting graph backdrop */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.svg
          width={1920}
          height={1080}
          viewBox="-960 -540 1920 1080"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, x: [0, 26, 0], y: [0, -18, 0], rotate: [0, 0.6, 0] }}
          transition={{
            opacity: { duration: 2 },
            x: { duration: 26, repeat: Infinity, ease: "easeInOut" },
            y: { duration: 32, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: 40, repeat: Infinity, ease: "easeInOut" },
          }}
          style={{ transformOrigin: "50% 50%" }}
        >
          {edges.map(([a, b], i) => (
            <line
              key={i}
              x1={nodes[a]!.x}
              y1={nodes[a]!.y}
              x2={nodes[b]!.x}
              y2={nodes[b]!.y}
              stroke={rgba(palette.amber, 0.06)}
              strokeWidth={1}
            />
          ))}
          {nodes.map((n, i) => (
            <motion.circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={rgba(palette.amber, 0.6)}
              animate={{ opacity: [n.op * 0.6, n.op, n.op * 0.6] }}
              transition={{
                duration: 4 + (i % 5),
                repeat: Infinity,
                ease: "easeInOut",
                delay: (i % 7) * 0.4,
              }}
            />
          ))}
        </motion.svg>
      </div>

      {/* Centered close radial to lift the wordmark */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(40% 40% at 50% 45%, ${rgba(palette.amber, 0.07)}, transparent 70%)`,
        }}
      />

      {/* End card content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
        <motion.h1
          initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.1, delay: 0.5, ease: easeKeynote }}
          style={{
            fontSize: "clamp(3rem, 7vw, 6rem)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: palette.ink,
            textShadow: `0 0 40px ${rgba(palette.amber, 0.35)}, 0 0 12px ${rgba(palette.amber, 0.25)}`,
          }}
        >
          Decision Graph
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.2, ease: easeKeynote }}
          className="mt-4"
          style={{
            fontSize: "clamp(1rem, 2.2vw, 1.4rem)",
            fontWeight: 400,
            letterSpacing: "0.01em",
            color: palette.inkDim,
          }}
        >
          Engineering Memory for AI Teams
        </motion.p>

      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 2.6 }}
        className="absolute bottom-[5vh] left-0 right-0 flex justify-center"
      >
        <span
          className="flex items-center gap-1.5 text-[12px]"
          style={{ color: palette.inkFaint, letterSpacing: "0.04em" }}
        >
          Built with
          <span style={{ color: rgba(palette.amber, 0.8) }}>Claude</span>
        </span>
      </motion.div>
    </CinematicStage>
  );
}
