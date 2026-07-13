"use client";

/**
 * Scene 5 — "Transition into Live Demo"  ·  route: /cinematic/transition
 *
 * Opens on the completed glowing graph, then the camera slowly zooms toward a
 * single decision node. As it approaches, the node blooms and morphs into the
 * live Decision Graph application — browser chrome and app UI fade in naturally,
 * so it feels like the viewer stepped *into* the product rather than cutting to
 * another shot.
 *
 * Self-contained & refresh-replayable. ~6s. Ends on a stable app frame.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { GitBranch, Search, Lock } from "lucide-react";
import CinematicStage from "@/components/cinematic/CinematicStage";
import { easeCamera, palette, rgba } from "@/components/cinematic/tokens";

const NODES = [
  { x: -300, y: -120, label: "Dropdown a11y" },
  { x: 250, y: -150, label: "Form primitives" },
  { x: 0, y: 0, label: "Native vs custom", target: true },
  { x: -260, y: 140, label: "Keyboard nav" },
  { x: 300, y: 90, label: "Design system" },
];
const EDGES: [number, number][] = [
  [0, 2],
  [1, 2],
  [3, 2],
  [4, 2],
  [0, 3],
  [1, 4],
];

export default function TransitionScene() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 2900);
    return () => clearTimeout(t);
  }, []);

  return (
    <CinematicStage glow="rgba(245,158,11,0.06)">
      {/* Graph + camera zoom toward the target node */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ scale: 1, opacity: 1 }}
        animate={{ scale: 3.4, opacity: entered ? 0 : 1 }}
        transition={{
          scale: { duration: 5, ease: easeCamera },
          opacity: { duration: 0.9, ease: "easeInOut" },
        }}
        style={{ transformOrigin: "50% 50%" }}
      >
        <svg width={1200} height={700} style={{ overflow: "visible" }}>
          <g transform="translate(600,350)">
            {EDGES.map(([a, b], i) => (
              <motion.line
                key={i}
                x1={NODES[a]!.x}
                y1={NODES[a]!.y}
                x2={NODES[b]!.x}
                y2={NODES[b]!.y}
                stroke={rgba(palette.amber, 0.4)}
                strokeWidth={1.4}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1, delay: 0.2 + i * 0.1 }}
              />
            ))}
            {NODES.map((n, i) => (
              <motion.g
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 180, damping: 18, delay: i * 0.1 }}
                style={{ transformOrigin: `${n.x}px ${n.y}px` } as never}
              >
                {n.target && (
                  <motion.circle
                    cx={n.x}
                    cy={n.y}
                    r={20}
                    fill="none"
                    stroke={rgba(palette.amber, 0.5)}
                    strokeWidth={1}
                    animate={{ r: [20, 30, 20], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={n.target ? 15 : 12}
                  fill={rgba(palette.amber, n.target ? 0.2 : 0.12)}
                  stroke={rgba(palette.amber, n.target ? 0.95 : 0.7)}
                  strokeWidth={1.8}
                  style={{ filter: `drop-shadow(0 0 10px ${rgba(palette.amber, 0.5)})` }}
                />
                <circle cx={n.x} cy={n.y} r={3.5} fill={palette.amber} />
              </motion.g>
            ))}
          </g>
        </svg>
      </motion.div>

      {/* Bloom flash as we enter the node */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0] }}
        transition={{ duration: 1.1, delay: 2.5, times: [0, 0.5, 1] }}
        style={{
          background: `radial-gradient(30% 30% at 50% 50%, ${rgba(palette.amber, 0.5)}, transparent 70%)`,
        }}
      />

      {/* Live application shell fades in */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center p-[3vh]"
        initial={{ opacity: 0, scale: 1.06, filter: "blur(10px)" }}
        animate={
          entered
            ? { opacity: 1, scale: 1, filter: "blur(0px)" }
            : { opacity: 0, scale: 1.06, filter: "blur(10px)" }
        }
        transition={{ duration: 1.1, ease: easeCamera }}
      >
        <AppShell />
      </motion.div>
    </CinematicStage>
  );
}

/* ------------------------------------------------------------------ *
 * Live-looking Decision Graph application shell.
 * ------------------------------------------------------------------ */

function AppShell() {
  return (
    <div
      className="flex h-full w-full max-w-[1180px] flex-col overflow-hidden rounded-xl"
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 40px 120px rgba(0,0,0,0.7)",
        background: "#0a0a0b",
      }}
    >
      {/* Browser chrome */}
      <div
        className="flex items-center gap-3 px-4 py-2.5"
        style={{ background: "#141416", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: "#ff5f57" }} />
          <span className="h-3 w-3 rounded-full" style={{ background: "#febc2e" }} />
          <span className="h-3 w-3 rounded-full" style={{ background: "#28c840" }} />
        </div>
        <div
          className="ml-2 flex flex-1 items-center gap-2 rounded-md px-3 py-1.5 text-[12px]"
          style={{ background: "#0a0a0b", color: palette.inkDim }}
        >
          <Lock size={11} />
          <span className="font-mono">decisiongraph.app/razorpay/blade</span>
        </div>
      </div>

      {/* App header */}
      <div
        className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold" style={{ color: palette.ink }}>
            Decision Graph
          </span>
          <span className="flex items-center gap-1 text-[12px]" style={{ color: palette.inkFaint }}>
            <GitBranch size={12} /> razorpay/blade
          </span>
        </div>
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]"
          style={{ background: "rgba(255,255,255,0.04)", color: palette.inkDim }}
        >
          <Search size={12} />
          Ask about a decision…
        </div>
      </div>

      {/* Body: graph canvas + side panel */}
      <div className="flex flex-1 min-h-0">
        <div className="relative flex-1" style={{ background: "#08080a" }}>
          <LiveGraph />
        </div>
        <div
          className="w-[300px] shrink-0 p-5"
          style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", background: "#0b0b0d" }}
        >
          <div className="text-[11px] uppercase tracking-wider" style={{ color: palette.inkFaint }}>
            Decision
          </div>
          <div className="mt-1.5 text-[15px] font-semibold" style={{ color: palette.ink }}>
            Native vs custom Dropdown
          </div>
          <div
            className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
            style={{
              background: rgba(palette.emerald, 0.12),
              color: palette.emerald,
              border: `1px solid ${rgba(palette.emerald, 0.3)}`,
            }}
          >
            High confidence
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed" style={{ color: palette.inkDim }}>
            Blade renders a custom listbox rather than a native{" "}
            <span className="font-mono" style={{ color: palette.ink }}>
              &lt;select&gt;
            </span>{" "}
            to control styling, grouped options, and cross-platform a11y.
          </p>
          <div className="mt-4 space-y-2">
            {["PR #1284", "Issue #1092", "RFC-014"].map((e) => (
              <div
                key={e}
                className="rounded-md px-2.5 py-1.5 font-mono text-[11px]"
                style={{ background: "rgba(255,255,255,0.03)", color: palette.inkDim }}
              >
                {e}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveGraph() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="-420 -260 840 520"
      preserveAspectRatio="xMidYMid meet"
    >
      {EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={NODES[a]!.x * 0.62}
          y1={NODES[a]!.y * 0.62}
          x2={NODES[b]!.x * 0.62}
          y2={NODES[b]!.y * 0.62}
          stroke={rgba(palette.amber, 0.3)}
          strokeWidth={1.2}
        />
      ))}
      {NODES.map((n, i) => (
        <g key={i}>
          <motion.circle
            cx={n.x * 0.62}
            cy={n.y * 0.62}
            r={n.target ? 13 : 10}
            fill={rgba(palette.amber, n.target ? 0.2 : 0.12)}
            stroke={rgba(palette.amber, n.target ? 0.9 : 0.6)}
            strokeWidth={1.6}
            style={{ filter: `drop-shadow(0 0 6px ${rgba(palette.amber, 0.4)})` }}
            animate={n.target ? { opacity: [0.75, 1, 0.75] } : {}}
            transition={{ duration: 2.4, repeat: Infinity }}
          />
          <text
            x={n.x * 0.62}
            y={n.y * 0.62 + (n.target ? 30 : 26)}
            textAnchor="middle"
            fontSize={11}
            fill={rgba(palette.ink, 0.6)}
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
