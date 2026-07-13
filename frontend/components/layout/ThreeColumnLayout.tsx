"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Phase-driven layout (UX_REDESIGN_PLAN §8): the proportions ARE the
 * attention director. The graph is always the largest pane; the answer
 * earns width only once it exists; the trace shrinks to history after.
 *
 *   replaying        52 / 28 / 20   (watch it think)
 *   answered         45 / 20 / 35   (read the payoff; graph keeps the path lit)
 *   counterfactual   46 / 30 / 24   (scenario center, impact summary right)
 *
 * grid-template-columns transitions natively in modern Chromium — one CSS
 * property, no Framer dependency, no layout thrash.
 */
export type LayoutPhase = "replaying" | "answered" | "counterfactual";

const PROPORTIONS: Record<LayoutPhase, [number, number, number]> = {
  replaying: [50, 25, 25],
  answered: [42, 23, 35],
  counterfactual: [46, 30, 24],
};

interface ThreeColumnLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  phase?: LayoutPhase;
  className?: string;
  visible: boolean;
}

export function ThreeColumnLayout({
  left,
  center,
  right,
  phase = "replaying",
  className,
  visible,
}: ThreeColumnLayoutProps) {
  if (!visible) return null;

  const [a, b, c] = PROPORTIONS[phase];

  return (
    <div
      className={cn("flex-1 grid gap-0 overflow-hidden h-full", className)}
      style={{
        gridTemplateColumns: `${a}fr ${b}fr ${c}fr`,
        transition: "grid-template-columns 600ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Panel contrast (refinement §8): three near-black strata — the eye
          reads separate rooms without any bright chrome. Graph darkest
          (stage), timeline slightly lifted, answer lifted again. */}
      <div className="border-r border-border min-h-0 overflow-hidden bg-[#0a0a0a]">{left}</div>
      <div className="border-r border-border min-h-0 overflow-hidden bg-[#0d0d10]">{center}</div>
      <div className="min-h-0 overflow-hidden bg-[#0f0f13]">{right}</div>
    </div>
  );
}
