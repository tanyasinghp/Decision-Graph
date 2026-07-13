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

  // COLOR DIET (plan §15): edges are quiet neutrals at rest and earn color
  // + glow ONLY when traversed by reasoning. Rejected alternatives keep
  // their red dash as standing semantics even at rest.
  const isDim = state === "dim" || state === "faded";
  const isTraversed = state === "traversed";
  const isVisited = state === "visited"; // afterglow: tinted, never glowing
  const isRejected = edgeType === "REJECTED_ALTERNATIVE";
  const restStroke = isRejected ? "#ef444466" : "#3f3f46";

  return (
    <>
      {/* Arrow marker — only for edges that currently carry meaning */}
      {isTraversed && (
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
          stroke: isTraversed ? color : isVisited ? color : restStroke,
          strokeWidth: isTraversed ? 2.5 : isVisited ? 1.5 : isDim ? 1 : 1.5,
          strokeDasharray: dashArray,
          opacity: isTraversed ? 0.9 : isVisited ? 0.4 : isDim ? 0.25 : 0.55,
          markerEnd: isTraversed ? `url(#arrow-${edgeType})` : undefined,
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
