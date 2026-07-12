"use client";

import { useRef, memo } from "react";
import { DecisionGraph } from "./DecisionGraph";
import { GraphLegend } from "./GraphLegend";

interface GraphCanvasProps {
  isEmpty?: boolean;
}

export const GraphCanvas = memo(function GraphCanvas({
  isEmpty,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (isEmpty) {
    return (
      <div
        ref={containerRef}
        className="relative h-full w-full bg-[#0a0a0b] overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-small text-text-tertiary">
              Graph will appear here
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-[#0a0a0b] overflow-hidden"
    >
      <DecisionGraph />

      {/* Graph toolbar */}
      <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
        <span className="text-caption text-text-tertiary px-2 py-1 rounded bg-[#0a0a0b]/80 backdrop-blur-sm border border-border">
          Decision Graph
        </span>
      </div>

      {/* Legend */}
      <GraphLegend />
    </div>
  );
});
