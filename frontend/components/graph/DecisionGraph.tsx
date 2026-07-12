"use client";

import { useMemo, useCallback, useRef, useEffect, memo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { useDemoContext } from "@/lib/demo-context";
import { buildLayout, applyNodeStates, applyEdgeStates } from "@/lib/graph-utils";
import { DecisionNode } from "./nodes/DecisionNode";
import { GraphEdge } from "./edges/GraphEdge";
import { useGraphController } from "@/hooks/useGraphController";

const nodeTypes = {
  decision: DecisionNode,
  component: DecisionNode,
};

const edgeTypes = {
  graphEdge: GraphEdge,
};

const defaultEdgeOptions = {
  type: "graphEdge",
  style: { transition: "all 0.5s ease" },
};

function DecisionGraphInner() {
  const { state, dispatch } = useDemoContext();
  const { graph, highlightedNodeIds, highlightedEdgeIds, hypotheticalNodeIds, predictedNodeIds } = state;
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const visitedNodesRef = useRef<Set<string>>(new Set());
  const visitedEdgesRef = useRef<Set<string>>(new Set());
  const prevHighlightedRef = useRef<string[]>([]);

  // Subscribe to camera choreography
  useGraphController();

  // Build layout once from the graph store
  const layout = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };
    return buildLayout(graph);
  }, [graph]);

  // Track visited nodes/edges — accumulate across highlights
  useEffect(() => {
    const prev = prevHighlightedRef.current;

    // Detect newly highlighted nodes (not in previous set)
    if (highlightedNodeIds.length > 0) {
      for (const id of highlightedNodeIds) {
        visitedNodesRef.current.add(id);
      }
    }
    if (highlightedEdgeIds.length > 0) {
      for (const id of highlightedEdgeIds) {
        visitedEdgesRef.current.add(id);
      }
    }

    prevHighlightedRef.current = highlightedNodeIds;
  }, [highlightedNodeIds, highlightedEdgeIds]);

  // Derive the focused node (last highlighted entry that wasn't already visited)
  const focusedId = useMemo(() => {
    if (highlightedNodeIds.length === 0) return null;
    const last = highlightedNodeIds[highlightedNodeIds.length - 1];
    if (!last) return null;
    return last;
  }, [highlightedNodeIds]);

  // Apply states
  const displayNodes = useMemo(
    () =>
      applyNodeStates(
        layout.nodes,
        highlightedNodeIds,
        visitedNodesRef.current,
        focusedId,
        hypotheticalNodeIds,
        predictedNodeIds,
      ),
    [layout.nodes, highlightedNodeIds, focusedId, hypotheticalNodeIds, predictedNodeIds],
  );

  const displayEdges = useMemo(
    () =>
      applyEdgeStates(
        layout.edges,
        highlightedEdgeIds,
        visitedEdgesRef.current,
        hypotheticalNodeIds,
      ),
    [layout.edges, highlightedEdgeIds, hypotheticalNodeIds],
  );

  // Fit view on initial layout
  useEffect(() => {
    if (layout.nodes.length > 0) {
      requestAnimationFrame(() => {
        fitView({ padding: 0.25, duration: 400 });
      });
    }
  }, [layout.nodes.length, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      dispatch({ type: "SELECT_NODE", id: node.id });
    },
    [dispatch],
  );

  const onPaneClick = useCallback(() => {
    dispatch({ type: "SELECT_NODE", id: null });
  }, [dispatch]);

  if (!graph || layout.nodes.length === 0) return null;

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      zoomOnScroll={false}
      panOnDrag={false}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      proOptions={{ hideAttribution: true }}
      className="bg-[#0a0a0b]"
    >
      <Background color="rgba(255,255,255,0.03)" gap={24} size={1} />
      <Controls
        showInteractive={false}
        className="!bg-surface/80 !backdrop-blur-sm !border !border-border !rounded-lg"
      />
      <MiniMap
        nodeStrokeColor="rgba(255,255,255,0.1)"
        nodeColor="rgba(255,255,255,0.05)"
        nodeBorderRadius={4}
        maskColor="rgba(0,0,0,0.7)"
        style={{
          background: "#0a0a0b",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
        }}
      />

      {/* Label */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <span className="text-caption text-text-tertiary px-2 py-1 rounded bg-[#0a0a0b]/80 backdrop-blur-sm border border-border">
          Decision Graph
        </span>
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10">
        <button
          onClick={() => zoomIn()}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface/80 backdrop-blur-sm border border-border hover:bg-surface-hover transition-colors text-text-secondary hover:text-text-primary"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => zoomOut()}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface/80 backdrop-blur-sm border border-border hover:bg-surface-hover transition-colors text-text-secondary hover:text-text-primary"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => fitView({ padding: 0.25, duration: 300 })}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface/80 backdrop-blur-sm border border-border hover:bg-surface-hover transition-colors text-text-secondary hover:text-text-primary"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </ReactFlow>
  );
}

export const DecisionGraph = memo(function DecisionGraph() {
  const { state } = useDemoContext();

  if (!state.graph) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-small">
        No graph data loaded
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <DecisionGraphInner />
    </ReactFlowProvider>
  );
});
