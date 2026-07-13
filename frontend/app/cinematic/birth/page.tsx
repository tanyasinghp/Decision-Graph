"use client";

/**
 * Scene 3 — "Birth of Decision Graph"  ·  route: /cinematic/birth
 *
 * Scattered artifacts drift toward invisible centers. Similar ones merge,
 * related ones cluster, decision nodes emerge, and edges animate into
 * existence — a living knowledge graph slowly forms with elegant spring
 * motion while the camera zooms gently outward. The finished graph glows and
 * the title resolves: "Decision Graph" / "Reconstructing Engineering Reasoning".
 *
 * Self-contained & refresh-replayable. ~10s.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import CinematicStage from "@/components/cinematic/CinematicStage";
import KeynoteText from "@/components/cinematic/KeynoteText";
import {
  mulberry32,
  palette,
  rgba,
  springSnappy,
} from "@/components/cinematic/tokens";

const DECISIONS = [
  { x: -360, y: -150, label: "Dropdown a11y" },
  { x: 320, y: -170, label: "Form primitives" },
  { x: 430, y: 90, label: "Native vs custom" },
  { x: -320, y: 150, label: "Keyboard nav" },
  { x: 40, y: 30, label: "Design system" },
];

const D_EDGES: [number, number][] = [
  [0, 4],
  [1, 4],
  [2, 4],
  [3, 4],
  [1, 2],
  [0, 3],
];

const ART_COLORS = [
  palette.emerald,
  palette.blue,
  palette.purple,
  palette.amber,
  palette.slate,
];

interface Artifact {
  id: number;
  cluster: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  color: string;
  r: number;
  merge: boolean;
  delay: number;
}

function buildArtifacts(): Artifact[] {
  const rnd = mulberry32(99);
  const out: Artifact[] = [];
  const perCluster = 6;
  for (let c = 0; c < DECISIONS.length; c++) {
    const dec = DECISIONS[c]!;
    for (let k = 0; k < perCluster; k++) {
      const merge = k === 0; // one per cluster "merges" into the decision
      const ang = (k / perCluster) * Math.PI * 2 + rnd();
      const orbit = 66 + rnd() * 46;
      out.push({
        id: c * perCluster + k,
        cluster: c,
        sx: (rnd() - 0.5) * 1300,
        sy: (rnd() - 0.5) * 760,
        tx: dec.x + (merge ? 0 : Math.cos(ang) * orbit),
        ty: dec.y + (merge ? 0 : Math.sin(ang) * orbit),
        color: ART_COLORS[(rnd() * ART_COLORS.length) | 0]!,
        r: 3 + rnd() * 2.5,
        merge,
        delay: 0.3 + rnd() * 1.4,
      });
    }
  }
  return out;
}

export default function BirthScene() {
  const artifacts = useMemo(buildArtifacts, []);
  const [showNodes, setShowNodes] = useState(false);
  const [showEdges, setShowEdges] = useState(false);
  const [showTitle, setShowTitle] = useState(false);

  useEffect(() => {
    const t = [
      setTimeout(() => setShowNodes(true), 2000),
      setTimeout(() => setShowEdges(true), 3000),
      setTimeout(() => setShowTitle(true), 6600),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <CinematicStage glow="rgba(245,158,11,0.05)" letterbox>
      <div className="absolute inset-0 flex items-center justify-center">
        {/* Camera: gentle zoom outward */}
        <motion.div
          className="relative"
          initial={{ scale: 1.18 }}
          animate={{ scale: 0.82 }}
          transition={{ duration: 8.5, ease: [0.4, 0, 0.2, 1] }}
        >
          <svg width={1440} height={820} style={{ overflow: "visible" }}>
            <g transform="translate(720,410)">
              {/* edges between decision nodes */}
              {showEdges &&
                D_EDGES.map(([a, b], i) => (
                  <motion.line
                    key={`e${i}`}
                    x1={DECISIONS[a]!.x}
                    y1={DECISIONS[a]!.y}
                    x2={DECISIONS[b]!.x}
                    y2={DECISIONS[b]!.y}
                    stroke={rgba(palette.amber, 0.45)}
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.1, delay: i * 0.18 }}
                  />
                ))}

              {/* short edges: decision -> its orbiting artifacts */}
              {showEdges &&
                artifacts
                  .filter((a) => !a.merge)
                  .map((a) => (
                    <motion.line
                      key={`le${a.id}`}
                      x1={DECISIONS[a.cluster]!.x}
                      y1={DECISIONS[a.cluster]!.y}
                      x2={a.tx}
                      y2={a.ty}
                      stroke={rgba(a.color, 0.28)}
                      strokeWidth={1}
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.9, delay: 0.4 + a.delay * 0.3 }}
                    />
                  ))}

              {/* artifacts drifting toward centers */}
              {artifacts.map((a) => (
                <motion.circle
                  key={a.id}
                  r={a.r}
                  fill={a.color}
                  initial={{ cx: a.sx, cy: a.sy, opacity: 0 }}
                  animate={{
                    cx: a.tx,
                    cy: a.ty,
                    opacity: a.merge ? [0, 1, 1, 0] : 1,
                  }}
                  transition={{
                    cx: { ...springSnappy, delay: a.delay },
                    cy: { ...springSnappy, delay: a.delay },
                    opacity: a.merge
                      ? { duration: 2.2, delay: a.delay, times: [0, 0.2, 0.7, 1] }
                      : { duration: 0.5, delay: a.delay },
                  }}
                  style={{
                    filter: `drop-shadow(0 0 4px ${rgba(a.color, 0.7)})`,
                  }}
                />
              ))}

              {/* decision nodes emerge */}
              {DECISIONS.map((d, i) => (
                <motion.g
                  key={`d${i}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={
                    showNodes ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }
                  }
                  transition={{ ...springSnappy, delay: i * 0.14 }}
                  style={{ transformOrigin: `${d.x}px ${d.y}px` } as never}
                >
                  <circle
                    cx={d.x}
                    cy={d.y}
                    r={16}
                    fill={rgba(palette.amber, 0.14)}
                    stroke={rgba(palette.amber, 0.85)}
                    strokeWidth={1.8}
                    style={{
                      filter: `drop-shadow(0 0 10px ${rgba(palette.amber, 0.55)})`,
                    }}
                  />
                  <circle cx={d.x} cy={d.y} r={4} fill={palette.amber} />
                  <text
                    x={d.x}
                    y={d.y + 34}
                    textAnchor="middle"
                    fontSize={12}
                    fill={rgba(palette.ink, 0.75)}
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {d.label}
                  </text>
                </motion.g>
              ))}
            </g>
          </svg>
        </motion.div>

        {/* Title */}
        <div className="pointer-events-none absolute bottom-[12%] left-0 right-0 flex flex-col items-center gap-3 px-8">
          {showTitle && (
            <>
              <KeynoteText size="xl" weight={700}>
                Decision Graph
              </KeynoteText>
              <KeynoteText size="sm" tone="dim" weight={400} delay={0.5}>
                Reconstructing Engineering Reasoning
              </KeynoteText>
            </>
          )}
        </div>
      </div>
    </CinematicStage>
  );
}
