"use client";

/**
 * Scene 8 — "Counterfactual Reasoning"  ·  route: /cinematic/counterfactual
 *
 * A completed Decision Graph sits calm, its reasoning path glowing. Everything
 * freezes; one decision glows purple — "What if this decision never happened?"
 * The node lifts, its outgoing edges dissolve, dashed hypothetical edges grow,
 * and consequences ripple outward, tinting affected nodes purple while the rest
 * stay dim. Resolves on "Counterfactual Reasoning / Predicting downstream
 * architectural impact" and holds.
 *
 * Self-contained & refresh-replayable. ~11s. Ends on a stable frame.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CinematicStage from "@/components/cinematic/CinematicStage";
import KeynoteText from "@/components/cinematic/KeynoteText";
import {
  GraphNode,
  GraphEdge,
  type NodeState,
  type EdgeState,
} from "@/components/cinematic/GraphPrimitives";
import { easeKeynote, palette } from "@/components/cinematic/tokens";

const PHASES = [
  "calm",
  "freeze",
  "select",
  "lift",
  "hypo",
  "ripple1",
  "ripple2",
  "label",
] as const;
type Phase = (typeof PHASES)[number];

const NODES = [
  { id: 0, x: -420, y: -30, label: "RFC-014" },
  { id: 1, x: -250, y: -150, label: "Dropdown API" },
  { id: 2, x: -250, y: 110, label: "Native <select>" },
  { id: 3, x: -20, y: -20, label: "Custom listbox" },
  { id: 4, x: 200, y: -160, label: "Keyboard nav" },
  { id: 5, x: 210, y: -10, label: "a11y layer" },
  { id: 6, x: 205, y: 140, label: "Focus mgmt" },
  { id: 7, x: 410, y: -110, label: "Mobile sheet" },
  { id: 8, x: 420, y: 60, label: "Grouped options" },
  { id: 9, x: 410, y: 200, label: "Theming" },
];

// base edges — `out` = leaves the selected node #3, `active` = glowing at calm
const EDGES = [
  { a: 0, b: 1, active: true },
  { a: 0, b: 2 },
  { a: 1, b: 3, active: true },
  { a: 2, b: 3 },
  { a: 3, b: 4, out: true, active: true },
  { a: 3, b: 5, out: true },
  { a: 3, b: 6, out: true },
  { a: 4, b: 7 },
  { a: 5, b: 8 },
  { a: 6, b: 9 },
];

// hypothetical rewiring once #3 is removed
const HYPO = [
  { a: 1, b: 5 },
  { a: 2, b: 4 },
  { a: 1, b: 6 },
];

const TIMELINE: [Phase, number][] = [
  ["freeze", 2000],
  ["select", 2800],
  ["lift", 3600],
  ["hypo", 4300],
  ["ripple1", 5100],
  ["ripple2", 5900],
  ["label", 6800],
];

const DOWN1 = [4, 5, 6];
const DOWN2 = [7, 8, 9];

export default function CounterfactualScene() {
  const [p, setP] = useState(0); // index into PHASES

  useEffect(() => {
    const timers = TIMELINE.map(([phase, ms]) =>
      setTimeout(() => setP(PHASES.indexOf(phase)), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const at = (phase: Phase) => p >= PHASES.indexOf(phase);
  const frozen = at("freeze");

  const nodeState = (id: number): NodeState => {
    if (id === 3) return at("select") ? "counterfactual" : "active";
    if (DOWN1.includes(id)) {
      if (at("ripple1")) return "affected";
      if (frozen) return "dim";
      return id === 4 ? "active" : "normal";
    }
    if (DOWN2.includes(id)) {
      if (at("ripple2")) return "affected";
      if (frozen) return "dim";
      return "normal";
    }
    // upstream 0,1,2
    if (frozen) return "dim";
    return id <= 1 ? "active" : "normal";
  };

  const edgeState = (e: (typeof EDGES)[number]): EdgeState => {
    if (e.out && at("hypo")) return "dissolving";
    if (frozen) return "dim";
    return e.active ? "active" : "normal";
  };

  const showQuestion = at("select") && !at("label");

  return (
    <CinematicStage glow="rgba(168,85,247,0.05)" letterbox>
      <div className="absolute inset-0 flex items-center justify-center">
        <svg width={1400} height={760} style={{ overflow: "visible" }}>
          <g transform="translate(700,380)">
            {EDGES.map((e, i) => (
              <GraphEdge
                key={`e${i}`}
                x1={NODES[e.a]!.x}
                y1={NODES[e.a]!.y}
                x2={NODES[e.b]!.x}
                y2={NODES[e.b]!.y}
                state={edgeState(e)}
                draw
              />
            ))}

            {at("hypo") &&
              HYPO.map((e, i) => (
                <GraphEdge
                  key={`h${i}`}
                  x1={NODES[e.a]!.x}
                  y1={NODES[e.a]!.y}
                  x2={NODES[e.b]!.x}
                  y2={NODES[e.b]!.y}
                  state="hypothetical"
                  delay={i * 0.15}
                />
              ))}

            {NODES.map((n) => {
              const st = nodeState(n.id);
              return (
                <GraphNode
                  key={n.id}
                  x={n.x}
                  y={n.y}
                  label={n.label}
                  state={st}
                  lift={n.id === 3 && at("lift") ? 16 : 0}
                  pulse={st === "active" && !frozen}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Question */}
      <div className="pointer-events-none absolute left-0 right-0 top-[12%] flex justify-center px-8">
        <AnimatePresence>
          {showQuestion && (
            <motion.div
              initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.8, ease: easeKeynote }}
            >
              <KeynoteText size="md" tone="primary">
                What if this decision{" "}
                <span style={{ color: palette.purple }}>never happened?</span>
              </KeynoteText>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Title */}
      <div className="pointer-events-none absolute bottom-[11%] left-0 right-0 flex flex-col items-center gap-2 px-8">
        {at("label") && (
          <>
            <KeynoteText size="lg" weight={700}>
              Counterfactual Reasoning
            </KeynoteText>
            <KeynoteText size="sm" tone="dim" weight={400} delay={0.4}>
              Predicting downstream architectural impact
            </KeynoteText>
          </>
        )}
      </div>
    </CinematicStage>
  );
}
