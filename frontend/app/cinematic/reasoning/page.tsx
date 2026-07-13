"use client";

/**
 * Scene 7 — "Reasoning"  ·  route: /cinematic/reasoning
 *
 * The bridge between the hero question and the live demo. A camera glides down
 * a reasoning pipeline — Planner → Evidence Search → Decision Graph → Reasoning
 * → Answer — as information visibly flows between stages: glowing paths draw in,
 * particles travel the edges, artifacts collapse into a forming graph, a
 * confidence ring grows, and the answer resolves. Finally the camera pulls back
 * to reveal the whole pipeline beneath one line:
 * "Understanding software through decisions, not documents."
 *
 * Pure SVG + Framer Motion (no canvas). Deterministic & refresh-replayable.
 * ~15s including the closing hold; ends on a stable frame.
 */

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  CircleDot,
  GitPullRequest,
  GitCommit,
  MessageSquare,
  FileText,
  type LucideIcon,
} from "lucide-react";
import CinematicStage from "@/components/cinematic/CinematicStage";
import KeynoteText from "@/components/cinematic/KeynoteText";
import {
  PipelineNode,
  AnimatedConnection,
  ParticleFlow,
  ConfidenceRing,
} from "@/components/cinematic/PipelinePrimitives";
import { GraphNode, GraphEdge } from "@/components/cinematic/GraphPrimitives";
import { easeCamera, easeKeynote, palette, rgba } from "@/components/cinematic/tokens";

/* ----------------------------- world layout ----------------------------- */

const W = 900;
const H = 1450;
const CX = 450;
const CY = 725;

const Y = {
  question: 175,
  planner: 365,
  evidence: 585,
  graph: 835,
  reasoning: 1075,
  answer: 1255,
};

// camera keyframes: { focus node Y, scale }
const CAM: Record<number, { ny: number; s: number }> = {
  1: { ny: Y.question, s: 1.25 },
  2: { ny: Y.planner, s: 1.2 },
  3: { ny: Y.evidence, s: 1.12 },
  4: { ny: Y.graph, s: 1.06 },
  5: { ny: Y.reasoning, s: 1.12 },
  6: { ny: Y.answer, s: 1.12 },
  7: { ny: CY - 10, s: 0.5 },
};

const TIMELINE: [number, number][] = [
  [2, 1900],
  [3, 3600],
  [4, 5600],
  [5, 7900],
  [6, 9900],
  [7, 11900],
];

// Evidence artifacts (fan out around the Evidence node, then collapse into graph)
const ARTIFACTS: { icon: LucideIcon; label: string; dx: number; dy: number; hue: string }[] = [
  { icon: CircleDot, label: "Issue", dx: -205, dy: -46, hue: palette.emerald },
  { icon: GitPullRequest, label: "PR", dx: 205, dy: -46, hue: palette.emerald },
  { icon: GitCommit, label: "Commit", dx: -220, dy: 58, hue: palette.purple },
  { icon: MessageSquare, label: "Discussion", dx: 220, dy: 58, hue: palette.amber },
  { icon: FileText, label: "Design Doc", dx: 150, dy: 150, hue: palette.slate },
];

// Mini decision graph (forms where the artifacts collapse)
const G = [
  { x: -90, y: -62 },
  { x: 92, y: -55 },
  { x: -112, y: 40 },
  { x: 104, y: 46 },
  { x: 0, y: -98 },
  { x: 0, y: 92 },
];
const G_EDGES: [number, number][] = [
  [4, 0],
  [4, 1],
  [0, 2],
  [1, 3],
  [2, 5],
  [3, 5],
  [0, 1],
];
// primary illuminated reasoning path, and the extra supporting paths
const PATH_PRIMARY = new Set(["4-0", "0-2", "2-5"]);
const PATH_SUPPORT = new Set(["4-1", "1-3", "3-5"]);
const PATH_NODES_PRIMARY = new Set([4, 0, 2, 5]);
const PATH_NODES_SUPPORT = new Set([1, 3]);

// converging particle sources around the Reasoning node
const CONVERGE = [
  { dx: -150, dy: -92 },
  { dx: 150, dy: -92 },
  { dx: -172, dy: 44 },
  { dx: 172, dy: 44 },
  { dx: 0, dy: -168 },
  { dx: 0, dy: 150 },
];

export default function ReasoningScene() {
  const [p, setP] = useState(1);

  useEffect(() => {
    const timers = TIMELINE.map(([phase, ms]) => setTimeout(() => setP(phase), ms));
    return () => timers.forEach(clearTimeout);
  }, []);

  const at = (phase: number) => p >= phase;
  const cam = CAM[p]!;
  const camY = -(cam.ny - CY) * cam.s;

  const nodeState = (phase: number) =>
    p > phase ? "done" : p === phase ? "active" : "hidden";

  return (
    <CinematicStage glow="rgba(245,158,11,0.05)" letterbox>
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          style={{ width: W, height: H, position: "relative", transformOrigin: "50% 50%" }}
          initial={false}
          animate={{ x: 0, y: camY, scale: cam.s }}
          transition={{ duration: 1.4, ease: easeCamera }}
        >
          {/* ---- vector layer ---- */}
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0"
            style={{ overflow: "visible" }}
          >
            {/* connections */}
            <AnimatedConnection x1={CX} y1={Y.question + 58} x2={CX} y2={Y.planner - 40} active={at(2)} />
            <AnimatedConnection x1={CX} y1={Y.planner + 40} x2={CX} y2={Y.evidence - 40} active={at(3)} />
            <AnimatedConnection x1={CX} y1={Y.evidence + 40} x2={CX} y2={Y.graph - 108} active={at(4)} />
            <AnimatedConnection x1={CX} y1={Y.graph + 108} x2={CX} y2={Y.reasoning - 40} active={at(5)} />
            <AnimatedConnection x1={CX} y1={Y.reasoning + 40} x2={CX} y2={Y.answer - 48} active={at(6)} />

            {/* particle flows along active connections */}
            <ParticleFlow x1={CX} y1={Y.planner + 40} x2={CX} y2={Y.evidence - 40} active={at(3)} />
            <ParticleFlow x1={CX} y1={Y.evidence + 40} x2={CX} y2={Y.graph - 108} active={at(4)} />
            <ParticleFlow x1={CX} y1={Y.graph + 108} x2={CX} y2={Y.reasoning - 40} active={at(5)} />
            <ParticleFlow x1={CX} y1={Y.reasoning + 40} x2={CX} y2={Y.answer - 48} active={at(6)} hue={palette.emerald} />

            {/* Planner */}
            <PipelineNode x={CX} y={Y.planner} state={nodeState(2)} pulse={p === 2} />

            {/* Evidence Search */}
            <PipelineNode x={CX} y={Y.evidence} state={p >= 3 ? (p > 3 ? "done" : "active") : "hidden"} pulse={p === 3} />

            {/* Decision Graph (forming mini-graph) */}
            {at(4) &&
              G_EDGES.map(([a, b], i) => {
                const key = `${a}-${b}`;
                const primary = PATH_PRIMARY.has(key);
                const support = PATH_SUPPORT.has(key);
                const state = primary
                  ? "active"
                  : support && at(5)
                    ? "active"
                    : "normal";
                return (
                  <GraphEdge
                    key={`ge${i}`}
                    x1={CX + G[a]!.x}
                    y1={Y.graph + G[a]!.y}
                    x2={CX + G[b]!.x}
                    y2={Y.graph + G[b]!.y}
                    state={state}
                    draw
                    delay={0.2 + i * 0.08}
                  />
                );
              })}
            {at(4) &&
              G.map((g, i) => {
                const primary = PATH_NODES_PRIMARY.has(i);
                const support = PATH_NODES_SUPPORT.has(i);
                const state = primary ? "active" : support && at(5) ? "active" : "normal";
                return (
                  <GraphNode
                    key={`gn${i}`}
                    x={CX + g.x}
                    y={Y.graph + g.y}
                    r={11}
                    state={state}
                    showLabel={false}
                  />
                );
              })}

            {/* Reasoning */}
            <PipelineNode x={CX} y={Y.reasoning} state={p >= 5 ? (p > 5 ? "done" : "active") : "hidden"} pulse={p === 5} />
            <ConfidenceRing cx={CX} cy={Y.reasoning} r={72} percent={0.95} active={at(5)} />
            {CONVERGE.map((c, i) => (
              <ParticleFlow
                key={`cv${i}`}
                x1={CX + c.dx}
                y1={Y.reasoning + c.dy}
                x2={CX}
                y2={Y.reasoning}
                active={p === 5}
                count={1}
                duration={1.4}
                hue={palette.emerald}
              />
            ))}

            {/* Answer (expands in) */}
            <PipelineNode x={CX} y={Y.answer} r={48} state={at(6) ? "active" : "hidden"} pulse={p === 6} />
          </svg>

          {/* ---- typography / chips overlay (same world coords) ---- */}
          <WorldLabel x={CX} y={Y.question} center show size={40} weight={600}>
            Why doesn&apos;t Dropdown use a native{" "}
            <span style={{ color: palette.amber }}>select</span> element?
          </WorldLabel>

          <StageLabel x={CX + 66} y={Y.planner} show={at(2)}>
            Planner
          </StageLabel>
          <StageLabel x={CX + 66} y={Y.evidence} show={at(3)}>
            Evidence Search
          </StageLabel>
          <StageLabel x={CX + 150} y={Y.graph} show={at(4)}>
            Decision Graph
          </StageLabel>
          <StageLabel x={CX + 104} y={Y.reasoning} show={at(5)}>
            Reasoning
          </StageLabel>
          <StageLabel x={CX + 84} y={Y.answer} show={at(6)}>
            Answer
          </StageLabel>

          {/* Evidence artifacts */}
          {ARTIFACTS.map((a, i) => {
            const baseX = CX + a.dx;
            const baseY = Y.evidence + a.dy;
            const collapse = at(4);
            return (
              <motion.div
                key={a.label}
                className="absolute"
                style={{ left: baseX, top: baseY }}
                initial={{ opacity: 0, scale: 0.6, x: 0, y: 0 }}
                animate={
                  at(3)
                    ? collapse
                      ? { opacity: 0, scale: 0.3, x: CX - baseX, y: Y.graph - baseY }
                      : { opacity: 1, scale: 1, x: 0, y: 0 }
                    : { opacity: 0, scale: 0.6 }
                }
                transition={{
                  duration: collapse ? 0.9 : 0.6,
                  delay: collapse ? i * 0.05 : 0.15 + i * 0.14,
                  ease: easeKeynote,
                }}
              >
                <ArtifactChip icon={a.icon} label={a.label} hue={a.hue} />
              </motion.div>
            );
          })}

          {/* Answer detail */}
          <motion.div
            className="absolute"
            style={{ left: CX, top: Y.answer + 92, width: 520, transform: "translateX(-50%)" }}
            initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
            animate={
              at(7)
                ? { opacity: 0, filter: "blur(6px)" }
                : at(6)
                  ? { opacity: 1, y: 0, filter: "blur(0px)" }
                  : { opacity: 0 }
            }
            transition={{ duration: 0.8, ease: easeKeynote }}
          >
            <div
              className="text-center"
              style={{ fontSize: 24, fontWeight: 600, color: palette.ink, letterSpacing: "-0.01em", lineHeight: 1.3 }}
            >
              Native <span className="font-mono">&lt;select&gt;</span> can&apos;t be themed or
              grouped consistently across platforms.
            </div>
            <div className="mt-4 flex items-center justify-center gap-5">
              <span style={{ fontSize: 14, color: palette.inkDim }}>
                Supported by 5 independent evidence sources
              </span>
              <span
                className="rounded-full px-3 py-1"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: palette.emerald,
                  background: rgba(palette.emerald, 0.12),
                  border: `1px solid ${rgba(palette.emerald, 0.35)}`,
                }}
              >
                Confidence 95%
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>

      {/* Closing tagline (fixed, appears on zoom-out) */}
      <div className="pointer-events-none absolute bottom-[9%] left-0 right-0 flex justify-center px-8">
        {at(7) && (
          <KeynoteText size="md" tone="dim" weight={400} delay={0.6}>
            Understanding software through decisions, not documents.
          </KeynoteText>
        )}
      </div>
    </CinematicStage>
  );
}

/* ------------------------------ overlays ------------------------------ */

function WorldLabel({
  x,
  y,
  show,
  children,
  size = 22,
  weight = 500,
  center = false,
}: {
  x: number;
  y: number;
  show: boolean;
  children: ReactNode;
  size?: number;
  weight?: number;
  center?: boolean;
}) {
  return (
    <motion.div
      className="absolute"
      style={{ left: x, top: y, width: center ? 720 : undefined }}
      initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
      animate={show ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0 }}
      transition={{ duration: 0.9, ease: easeKeynote }}
    >
      <div
        style={{
          transform: center ? "translate(-50%,-50%)" : "translateY(-50%)",
          fontSize: size,
          fontWeight: weight,
          letterSpacing: "-0.02em",
          color: palette.ink,
          textAlign: center ? "center" : "left",
          whiteSpace: center ? "normal" : "nowrap",
          lineHeight: 1.2,
        }}
      >
        {children}
      </div>
    </motion.div>
  );
}

function StageLabel({ x, y, show, children }: { x: number; y: number; show: boolean; children: ReactNode }) {
  return (
    <WorldLabel x={x} y={y} show={show} size={24} weight={600}>
      {children}
    </WorldLabel>
  );
}

function ArtifactChip({ icon: Icon, label, hue }: { icon: LucideIcon; label: string; hue: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2"
      style={{
        transform: "translate(-50%,-50%)",
        background: "linear-gradient(180deg, rgba(24,24,27,0.92), rgba(16,16,18,0.92))",
        border: `1px solid ${rgba(hue, 0.4)}`,
        boxShadow: `0 6px 20px rgba(0,0,0,0.5), 0 0 14px ${rgba(hue, 0.15)}`,
        whiteSpace: "nowrap",
      }}
    >
      <Icon size={14} color={hue} strokeWidth={2.2} />
      <span style={{ fontSize: 13, color: "#e7e7ea", fontWeight: 500 }}>{label}</span>
    </div>
  );
}
