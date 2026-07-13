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
  replaying: [52, 28, 20],
  answered: [45, 20, 35],
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
      <div className="border-r border-border min-h-0 overflow-hidden">{left}</div>
      <div className="border-r border-border min-h-0 overflow-hidden">{center}</div>
      <div className="min-h-0 overflow-hidden">{right}</div>
    </div>
  );
}
