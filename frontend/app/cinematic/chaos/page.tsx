"use client";

/**
 * Scene 2 — "Chaos"  ·  route: /cinematic/chaos
 *
 * Thousands of glowing commit dots stream across a dark field. Larger labeled
 * artifacts — PRs branching, issues, RFCs, Slack messages, docs — drift and
 * slowly wire themselves into a tangled dependency web while the camera pans.
 * Resolves on: "Engineering history isn't missing." → "Its reasoning is."
 *
 * Rendered on <canvas> for a smooth 60fps with thousands of particles.
 * Self-contained & refresh-replayable. ~8s.
 */

import { useEffect, useRef, useState } from "react";
import CinematicStage from "@/components/cinematic/CinematicStage";
import KeynoteText from "@/components/cinematic/KeynoteText";
import { mulberry32, palette } from "@/components/cinematic/tokens";

const DOT_COLORS = ["#a855f7", "#3b82f6", "#10b981", "#f59e0b", "#e2e8f0"];
const NODE_KINDS = [
  { label: "PR", color: "#10b981" },
  { label: "Issue", color: "#3b82f6" },
  { label: "RFC", color: "#3b82f6" },
  { label: "Slack", color: "#f59e0b" },
  { label: "Doc", color: "#94a3b8" },
  { label: "Commit", color: "#a855f7" },
];

export default function ChaosScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 4700),
      setTimeout(() => setPhase(2), 6400),
    ];
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0;
    let H = 0;
    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const rnd = mulberry32(42);

    // Streaming commit dots (thousands).
    const N = 1500;
    const dots = Array.from({ length: N }, () => ({
      x: rnd() * W * 1.6 - W * 0.3,
      y: rnd() * H * 1.4 - H * 0.2,
      vx: 14 + rnd() * 34,
      vy: (rnd() - 0.5) * 10,
      r: 0.6 + rnd() * 1.8,
      c: DOT_COLORS[(rnd() * DOT_COLORS.length) | 0]!,
      tw: rnd() * Math.PI * 2,
      tws: 1.5 + rnd() * 2.5,
    }));

    // Larger labeled artifact nodes that drift and tangle into a web.
    const M = 26;
    const nodes = Array.from({ length: M }, (_, i) => {
      const k = NODE_KINDS[i % NODE_KINDS.length]!;
      return {
        x: rnd() * W,
        y: rnd() * H,
        vx: (rnd() - 0.5) * 9,
        vy: (rnd() - 0.5) * 9,
        r: 2.4 + rnd() * 2.2,
        ...k,
      };
    });

    let raf = 0;
    const start = performance.now();
    let last = start;

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = (now - start) / 1000;
      const camX = elapsed * 12; // slow pan
      const webAlpha = Math.min(elapsed / 5, 1) * 0.55;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#050506";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      // commit dots
      for (const d of dots) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.x - camX > W + 40) {
          d.x = camX - 40;
          d.y = rnd() * H;
        }
        d.tw += d.tws * dt;
        const tw = 0.55 + 0.45 * Math.sin(d.tw);
        const sx = d.x - camX;
        ctx.beginPath();
        ctx.fillStyle = d.c;
        ctx.globalAlpha = 0.9 * tw;
        ctx.arc(sx, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        // cheap glow halo
        ctx.globalAlpha = 0.12 * tw;
        ctx.beginPath();
        ctx.arc(sx, d.y, d.r * 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // update nodes
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 40 || n.x > W - 40) n.vx *= -1;
        if (n.y < 40 || n.y > H - 40) n.vy *= -1;
      }

      // tangled web edges (nearby nodes)
      ctx.lineWidth = 1;
      for (let i = 0; i < M; i++) {
        for (let j = i + 1; j < M; j++) {
          const a = nodes[i]!;
          const b = nodes[j]!;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 260) {
            const aStrength = (1 - dist / 260) * webAlpha;
            ctx.strokeStyle = `rgba(148,163,184,${aStrength})`;
            ctx.beginPath();
            ctx.moveTo(a.x - camX, a.y);
            ctx.lineTo(b.x - camX, b.y);
            ctx.stroke();
          }
        }
      }

      // node glows
      for (const n of nodes) {
        const sx = n.x - camX;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = n.color;
        ctx.beginPath();
        ctx.arc(sx, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(sx, n.y, n.r * 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <CinematicStage glow="rgba(59,130,246,0.05)" letterbox>
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* darkening scrim behind text for legibility */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: phase > 0 ? 1 : 0,
          background:
            "radial-gradient(60% 50% at 50% 50%, rgba(0,0,0,0.72) 0%, transparent 75%)",
        }}
      />

      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
        {phase === 1 && (
          <KeynoteText size="lg" exitAfter={1.0}>
            Engineering history isn&apos;t missing.
          </KeynoteText>
        )}
        {phase === 2 && (
          <KeynoteText size="xl">
            Its <span style={{ color: palette.amber }}>reasoning</span> is.
          </KeynoteText>
        )}
      </div>
    </CinematicStage>
  );
}
