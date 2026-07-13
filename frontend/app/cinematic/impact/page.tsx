"use client";

/**
 * Scene 9 — "Impact"  ·  route: /cinematic/impact
 *
 * Opens zoomed into three connected architectural decisions. The camera pulls
 * back and hundreds of decision nodes fade into view — clusters and component
 * boundaries resolving out of the dark. Repository stats count up (312 commits,
 * 156 PRs, 89 issues, 47 decisions), then three keynote lines land and the
 * scene fades to black.
 *
 * Field rendered as lightweight SVG dots for a smooth 60fps at ~270 nodes;
 * hero decisions reuse the shared GraphNode primitive.
 * Self-contained, deterministic & refresh-replayable. ~15s.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import CinematicStage from "@/components/cinematic/CinematicStage";
import KeynoteText from "@/components/cinematic/KeynoteText";
import CountUp from "@/components/cinematic/CountUp";
import { GraphNode, GraphEdge } from "@/components/cinematic/GraphPrimitives";
import { easeCamera, easeKeynote, mulberry32, palette, rgba } from "@/components/cinematic/tokens";

const CLUSTER_CENTERS = [
  { x: -620, y: -300, n: 34 },
  { x: 520, y: -320, n: 30 },
  { x: -720, y: 180, n: 28 },
  { x: 680, y: 210, n: 32 },
  { x: -300, y: 360, n: 24 },
  { x: 330, y: 360, n: 26 },
  { x: -380, y: -380, n: 22 },
  { x: 430, y: -70, n: 20 },
  { x: -540, y: -40, n: 22 },
];

const DOT_HUES = [palette.amber, palette.amber, palette.amber, palette.emerald, palette.blue, palette.purple];

const HERO = [
  { x: -75, y: -30, label: "Dropdown" },
  { x: 85, y: -60, label: "Form field" },
  { x: 20, y: 80, label: "Modal focus" },
];
const HERO_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [0, 2],
];

interface Dot {
  x: number;
  y: number;
  r: number;
  op: number;
  delay: number;
  hue: string;
}
interface Cluster {
  dots: Dot[];
  hub: Dot;
  boundary: { x: number; y: number; w: number; h: number; delay: number };
}

function buildField() {
  const rnd = mulberry32(2026);
  const gauss = (s: number) => (rnd() + rnd() - 1) * s;
  const clusters: Cluster[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number; delay: number }[] = [];
  const maxDist = 900;

  for (const c of CLUSTER_CENTERS) {
    const spread = 90 + rnd() * 50;
    const dots: Dot[] = [];
    for (let i = 0; i < c.n; i++) {
      const x = c.x + gauss(spread);
      const y = c.y + gauss(spread * 0.72);
      const dist = Math.hypot(c.x, c.y);
      const delay = 0.5 + (dist / maxDist) * 2.4 + rnd() * 0.5;
      dots.push({
        x,
        y,
        r: 2.4 + rnd() * 3,
        op: 0.45 + rnd() * 0.45,
        delay,
        hue: DOT_HUES[(rnd() * DOT_HUES.length) | 0]!,
      });
    }
    const hub = dots[0]!;
    // edges: ~60% of dots tether to the hub
    for (let i = 1; i < dots.length; i++) {
      if (rnd() < 0.6) {
        const d = dots[i]!;
        edges.push({ x1: hub.x, y1: hub.y, x2: d.x, y2: d.y, delay: d.delay });
      }
    }
    const xs = dots.map((d) => d.x);
    const ys = dots.map((d) => d.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    clusters.push({
      dots,
      hub,
      boundary: {
        x: minX - 26,
        y: minY - 26,
        w: Math.max(...xs) - minX + 52,
        h: Math.max(...ys) - minY + 52,
        delay: Math.min(...dots.map((d) => d.delay)) + 0.8,
      },
    });
  }
  // a few inter-cluster tethers back toward the hero core
  for (const cl of clusters) {
    if (rnd() < 0.7)
      edges.push({ x1: cl.hub.x, y1: cl.hub.y, x2: 0, y2: 0, delay: cl.boundary.delay });
  }
  return { clusters, edges };
}

const STATS = [
  { label: "Commits", to: 312 },
  { label: "Pull Requests", to: 156 },
  { label: "Issues", to: 89 },
  { label: "Architectural Decisions", to: 47 },
];

const LINES = [
  "Every engineering decision leaves evidence.",
  "Decision Graph reconstructs the reasoning.",
  "Organizational memory becomes searchable.",
];

export default function ImpactScene() {
  const { clusters, edges } = useMemo(buildField, []);
  const [statsOn, setStatsOn] = useState(false);
  const [line, setLine] = useState(-1); // which keynote line
  const [dim, setDim] = useState(false);
  const [black, setBlack] = useState(false);

  useEffect(() => {
    const t = [
      setTimeout(() => setStatsOn(true), 1500),
      setTimeout(() => setDim(true), 6000),
      setTimeout(() => setLine(0), 6300),
      setTimeout(() => setLine(1), 8100),
      setTimeout(() => setLine(2), 9900),
      setTimeout(() => setBlack(true), 14000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  return (
    <CinematicStage glow="rgba(245,158,11,0.05)" letterbox>
      {/* Graph field with camera pull-back */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={{ scale: 2.4, opacity: 1 }}
          animate={{ scale: 0.62, opacity: dim ? 0.32 : 1 }}
          transition={{
            scale: { duration: 5.4, ease: easeCamera },
            opacity: { duration: 1.2, ease: "easeInOut" },
          }}
          style={{ transformOrigin: "50% 50%" }}
        >
          <svg width={1920} height={1120} viewBox="-960 -560 1920 1120">
            {/* cluster tether edges */}
            {edges.map((e, i) => (
              <motion.line
                key={`ce${i}`}
                x1={e.x1}
                y1={e.y1}
                x2={e.x2}
                y2={e.y2}
                stroke={rgba(palette.amber, 0.12)}
                strokeWidth={0.8}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: e.delay }}
              />
            ))}

            {/* component boundaries */}
            {clusters.map((c, i) => (
              <motion.rect
                key={`b${i}`}
                x={c.boundary.x}
                y={c.boundary.y}
                width={c.boundary.w}
                height={c.boundary.h}
                rx={20}
                fill="none"
                stroke={rgba(palette.amber, 0.16)}
                strokeWidth={1}
                strokeDasharray="4 6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: c.boundary.delay }}
              />
            ))}

            {/* field dots */}
            {clusters.flatMap((c, ci) =>
              c.dots.map((d, di) => (
                <motion.circle
                  key={`d${ci}-${di}`}
                  cx={d.x}
                  cy={d.y}
                  r={d.r}
                  fill={rgba(d.hue, 0.9)}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: d.op, scale: 1 }}
                  transition={{ duration: 0.7, delay: d.delay }}
                  style={{ filter: `drop-shadow(0 0 4px ${rgba(d.hue, 0.5)})` }}
                />
              ))
            )}

            {/* hero: three connected decisions (front & center) */}
            {HERO_EDGES.map(([a, b], i) => (
              <GraphEdge
                key={`he${i}`}
                x1={HERO[a]!.x}
                y1={HERO[a]!.y}
                x2={HERO[b]!.x}
                y2={HERO[b]!.y}
                state="active"
                draw
                delay={0.2 + i * 0.15}
              />
            ))}
            {HERO.map((h, i) => (
              <GraphNode
                key={`hn${i}`}
                x={h.x}
                y={h.y}
                r={16}
                label={h.label}
                state="active"
                pulse
              />
            ))}
          </svg>
        </motion.div>
      </div>

      {/* Stat strip */}
      <motion.div
        className="pointer-events-none absolute bottom-[12%] left-0 right-0 flex flex-wrap items-start justify-center gap-x-14 gap-y-6 px-8"
        animate={{ opacity: line >= 0 ? 0 : 1 }}
        transition={{ duration: 0.7 }}
      >
        {STATS.map((s, i) => (
          <motion.div
            key={s.label}
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 14 }}
            animate={statsOn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: i * 0.9, ease: easeKeynote }}
          >
            <span
              className="tabular-nums font-semibold"
              style={{
                fontSize: "clamp(2rem,4.5vw,3.4rem)",
                color: palette.ink,
                letterSpacing: "-0.02em",
              }}
            >
              <CountUp to={s.to} start={statsOn} delay={i * 0.9} />
            </span>
            <span
              className="mt-1 text-[12px] uppercase tracking-[0.15em]"
              style={{ color: palette.inkDim }}
            >
              {s.label}
            </span>
          </motion.div>
        ))}
      </motion.div>

      {/* Fade to black — sits below the final line so it rests cleanly on black */}
      <motion.div
        className="pointer-events-none absolute inset-0 bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: black ? 1 : 0 }}
        transition={{ duration: 1.4, ease: "easeInOut" }}
      />

      {/* Keynote lines (render above the black wash) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
        {line === 0 && (
          <KeynoteText size="lg" exitAfter={1.0}>
            Every engineering decision leaves evidence.
          </KeynoteText>
        )}
        {line === 1 && (
          <KeynoteText size="lg" exitAfter={1.0}>
            Decision Graph reconstructs the{" "}
            <span style={{ color: palette.amber }}>reasoning.</span>
          </KeynoteText>
        )}
        {line === 2 && (
          <KeynoteText size="xl" weight={700}>
            Organizational memory becomes searchable.
          </KeynoteText>
        )}
      </div>
    </CinematicStage>
  );
}
