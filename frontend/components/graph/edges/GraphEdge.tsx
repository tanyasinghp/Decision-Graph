"use client";

import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "reactflow";
import { getEdgeHexColor, getEdgeDashArray } from "@/lib/graph-utils";
import type { FlowEdgeData } from "@/lib/graph-utils";

function GraphEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<FlowEdgeData>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  if (!data) return <BaseEdge id={id} path={edgePath} />;

  const { edgeType, state } = data;
  const color = getEdgeHexColor(edgeType);
  const dashArray = getEdgeDashArray(edgeType);

  const isDim = state === "dim";
  const isTraversed = state === "traversed" || state === "visible";

  return (
    <>
      {/* Arrow marker — only render for visible/traversed edges */}
      {!isDim && (
        <defs>
          <marker
            id={`arrow-${edgeType}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} opacity={0.8} />
          </marker>
        </defs>
      )}

      {/* Main edge */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: isDim ? "#3f3f46" : color,
          strokeWidth: isDim ? 1 : isTraversed ? 2.5 : 2,
          strokeDasharray: dashArray,
          opacity: isDim ? 0.3 : isTraversed ? 0.9 : 0.5,
          markerEnd: isDim ? undefined : `url(#arrow-${edgeType})`,
          transition: "all 0.5s ease",
        }}
      />

      {/* Glow behind traversed edges */}
      {isTraversed && (
        <BaseEdge
          id={`${id}-glow`}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: 6,
            opacity: 0.15,
            strokeDasharray: dashArray,
            filter: "blur(2px)",
            transition: "opacity 0.5s ease",
            pointerEvents: "none",
          }}
        />
      )}
    </>
  );
}

export const GraphEdge = memo(GraphEdgeInner);
