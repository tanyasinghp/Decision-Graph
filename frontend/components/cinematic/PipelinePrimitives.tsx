"use client";

/**
 * Reusable motion primitives for the reasoning-pipeline scene.
 *
 *   PipelineNode       — a glowing stage node with an optional idle pulse
 *   AnimatedConnection — a glowing SVG path that draws itself in
 *   ParticleFlow       — particles travelling along a segment (information flow)
 *   ConfidenceRing     — a circular arc that grows to a target percentage
 *
 * All pure SVG + Framer Motion (no canvas), sharing the cinematic tokens so they
 * match the rest of the film. Deterministic; safe to leave looping on the final
 * frame. Used by /cinematic/reasoning.
 */

import { motion } from "framer-motion";
import { palette, rgba, springSoft } from "./tokens";

/* --------------------------- PipelineNode --------------------------- */

export type PipelineNodeState = "hidden" | "idle" | "active" | "done";

export interface PipelineNodeProps {
  x: number;
  y: number;
  r?: number;
  state: PipelineNodeState;
  hue?: string;
  pulse?: boolean;
}

export function PipelineNode({
  x,
  y,
  r = 34,
  state,
  hue = palette.amber,
  pulse = false,
}: PipelineNodeProps) {
  const visible = state !== "hidden";
  const strong = state === "active";
  const fill = strong ? 0.22 : state === "done" ? 0.14 : 0.1;
  const stroke = strong ? 0.95 : state === "done" ? 0.6 : 0.4;
  const glow = strong ? 26 : state === "done" ? 12 : 6;

  return (
    <motion.g
      initial={false}
      animate={{ scale: visible ? 1 : 0, opacity: visible ? 1 : 0 }}
      transition={springSoft}
      style={{ transformOrigin: `${x}px ${y}px` } as never}
    >
      {pulse && visible && (
        <motion.circle
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={rgba(hue, 0.5)}
          strokeWidth={1.2}
          animate={{ r: [r, r + 18, r], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <motion.circle
        cx={x}
        cy={y}
        r={r}
        animate={{ fill: rgba(hue, fill), stroke: rgba(hue, stroke) }}
        transition={{ duration: 0.6 }}
        strokeWidth={2}
        style={{ filter: `drop-shadow(0 0 ${glow}px ${rgba(hue, 0.5)})` }}
      />
      <motion.circle
        cx={x}
        cy={y}
        r={5}
        animate={{ fill: rgba(hue, Math.min(1, stroke + 0.05)), opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      />
    </motion.g>
  );
}

/* ------------------------ AnimatedConnection ------------------------ */

export interface AnimatedConnectionProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
  hue?: string;
  delay?: number;
  width?: number;
}

export function AnimatedConnection({
  x1,
  y1,
  x2,
  y2,
  active,
  hue = palette.amber,
  delay = 0,
  width = 2.4,
}: AnimatedConnectionProps) {
  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={rgba(hue, 0.5)}
      strokeWidth={width}
      strokeLinecap="round"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={active ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
      transition={{
        pathLength: { duration: 1, delay, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.5, delay },
      }}
      style={{ filter: `drop-shadow(0 0 8px ${rgba(hue, 0.4)})` }}
    />
  );
}

/* --------------------------- ParticleFlow --------------------------- */

export interface ParticleFlowProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  active: boolean;
  count?: number;
  hue?: string;
  duration?: number;
  size?: number;
}

export function ParticleFlow({
  x1,
  y1,
  x2,
  y2,
  active,
  count = 4,
  hue = palette.amber,
  duration = 1.6,
  size = 3,
}: ParticleFlowProps) {
  if (!active) return null;
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <motion.circle
          key={i}
          r={size}
          fill={hue}
          initial={{ cx: x1, cy: y1, opacity: 0 }}
          animate={{
            cx: [x1, x2],
            cy: [y1, y2],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration,
            times: [0, 0.15, 0.85, 1],
            repeat: Infinity,
            delay: (i * duration) / count,
            ease: "easeInOut",
          }}
          style={{ filter: `drop-shadow(0 0 6px ${rgba(hue, 0.9)})` }}
        />
      ))}
    </>
  );
}

/* -------------------------- ConfidenceRing -------------------------- */

export interface ConfidenceRingProps {
  cx: number;
  cy: number;
  r: number;
  /** 0..1 */
  percent: number;
  active: boolean;
  hue?: string;
  delay?: number;
}

export function ConfidenceRing({
  cx,
  cy,
  r,
  percent,
  active,
  hue = palette.emerald,
  delay = 0,
}: ConfidenceRingProps) {
  const circ = 2 * Math.PI * r;
  return (
    <motion.g
      initial={{ opacity: 0, scale: 0.7 }}
      animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
      transition={{ ...springSoft, delay }}
      style={{ transformOrigin: `${cx}px ${cy}px` } as never}
    >
      {/* track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={rgba(hue, 0.15)} strokeWidth={3} />
      {/* progress arc (starts at 12 o'clock) */}
      <motion.circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={rgba(hue, 0.95)}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={circ}
        transform={`rotate(-90 ${cx} ${cy})`}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: active ? circ * (1 - percent) : circ }}
        transition={{ duration: 1.3, delay: delay + 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ filter: `drop-shadow(0 0 8px ${rgba(hue, 0.5)})` }}
      />
    </motion.g>
  );
}
