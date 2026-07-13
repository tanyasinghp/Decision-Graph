"use client";

/**
 * Shared cinematic graph primitives.
 *
 * GraphNode + GraphEdge render a single Decision Graph node / edge in one of a
 * handful of cinematic states (calm, active reasoning path, dimmed, purple
 * counterfactual, rippled "affected"). Scenes drive the `state` prop over time;
 * the components own the look so no scene re-implements graph styling.
 *
 * Used by /cinematic/counterfactual, /cinematic/impact and /cinematic/end.
 */

import { motion } from "framer-motion";
import { palette, rgba, springSoft } from "./tokens";

/* ----------------------------- Nodes ----------------------------- */

export type NodeState =
  | "hidden"
  | "dim"
  | "normal"
  | "active"
  | "counterfactual"
  | "affected";

interface NodeStyle {
  hue: string;
  stroke: number;
  fill: number;
  glow: number;
  opacity: number;
}

const NODE_STYLES: Record<NodeState, NodeStyle> = {
  hidden: { hue: palette.amber, stroke: 0, fill: 0, glow: 0, opacity: 0 },
  dim: { hue: palette.amber, stroke: 0.22, fill: 0.05, glow: 0, opacity: 0.4 },
  normal: { hue: palette.amber, stroke: 0.6, fill: 0.12, glow: 6, opacity: 1 },
  active: { hue: palette.amber, stroke: 0.95, fill: 0.2, glow: 16, opacity: 1 },
  counterfactual: { hue: palette.purple, stroke: 0.95, fill: 0.22, glow: 22, opacity: 1 },
  affected: { hue: palette.purple, stroke: 0.7, fill: 0.16, glow: 12, opacity: 1 },
};

export interface GraphNodeProps {
  x: number;
  y: number;
  r?: number;
  label?: string;
  state: NodeState;
  /** upward lift in px (used for the counterfactual "lifted" node) */
  lift?: number;
  /** gentle idle pulse (for hero / active nodes) */
  pulse?: boolean;
  showLabel?: boolean;
  labelBelow?: number;
}

export function GraphNode({
  x,
  y,
  r = 15,
  label,
  state,
  lift = 0,
  pulse = false,
  showLabel = true,
  labelBelow = 30,
}: GraphNodeProps) {
  const s = NODE_STYLES[state];
  return (
    <motion.g
      initial={false}
      animate={{ y: -lift, opacity: s.opacity }}
      transition={springSoft}
    >
      {pulse && state !== "hidden" && state !== "dim" && (
        <motion.circle
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={rgba(s.hue, 0.5)}
          strokeWidth={1}
          animate={{ r: [r, r + 12, r], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <motion.circle
        cx={x}
        cy={y}
        animate={{ r, fill: rgba(s.hue, s.fill), stroke: rgba(s.hue, s.stroke) }}
        transition={{ duration: 0.6 }}
        strokeWidth={1.8}
        style={{
          filter: s.glow
            ? `drop-shadow(0 0 ${s.glow}px ${rgba(s.hue, 0.55)})`
            : "none",
        }}
      />
      <motion.circle
        cx={x}
        cy={y}
        r={3.5}
        animate={{ fill: rgba(s.hue, Math.min(1, s.stroke + 0.05)) }}
        transition={{ duration: 0.6 }}
      />
      {label && showLabel && (
        <text
          x={x}
          y={y + labelBelow}
          textAnchor="middle"
          fontSize={12}
          fill={rgba(palette.ink, state === "dim" || state === "hidden" ? 0.3 : 0.72)}
          style={{ letterSpacing: "-0.01em" }}
        >
          {label}
        </text>
      )}
    </motion.g>
  );
}

/* ----------------------------- Edges ----------------------------- */

export type EdgeState =
  | "hidden"
  | "dim"
  | "normal"
  | "active"
  | "hypothetical"
  | "dissolving";

export interface GraphEdgeProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  state: EdgeState;
  /** animate the stroke drawing in on mount */
  draw?: boolean;
  delay?: number;
}

export function GraphEdge({
  x1,
  y1,
  x2,
  y2,
  state,
  draw = false,
  delay = 0,
}: GraphEdgeProps) {
  if (state === "hidden") return null;

  if (state === "hypothetical") {
    return (
      <motion.line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={rgba(palette.purple, 0.85)}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeDasharray="6 6"
        initial={{ opacity: 0, pathLength: 0 }}
        animate={{ opacity: 1, pathLength: 1, strokeDashoffset: [0, -24] }}
        transition={{
          opacity: { duration: 0.5, delay },
          pathLength: { duration: 0.8, delay },
          strokeDashoffset: { duration: 1, repeat: Infinity, ease: "linear" },
        }}
        style={{ filter: `drop-shadow(0 0 6px ${rgba(palette.purple, 0.5)})` }}
      />
    );
  }

  const alpha =
    state === "active" ? 0.6 : state === "normal" ? 0.35 : 0.15;

  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={rgba(palette.amber, alpha)}
      strokeWidth={state === "active" ? 1.8 : 1.3}
      strokeLinecap="round"
      initial={draw ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
      animate={{
        pathLength: 1,
        opacity: state === "dissolving" ? 0 : 1,
      }}
      transition={{
        pathLength: { duration: 0.9, delay },
        opacity: { duration: state === "dissolving" ? 0.7 : 0.5, delay },
      }}
      style={{
        filter:
          state === "active"
            ? `drop-shadow(0 0 6px ${rgba(palette.amber, 0.4)})`
            : "none",
      }}
    />
  );
}
