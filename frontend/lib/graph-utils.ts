import dagre from "@dagrejs/dagre";
import type {
  Node,
  Edge,
} from "reactflow";
import type { GraphNode, GraphEdge, NodeType, EdgeType } from "./types";
import type { GraphStore } from "./graph-store";

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

const NODE_WIDTH: Record<string, number> = {
  decision: 220,
  pull_request: 180,
  issue: 180,
  commit: 160,
  component: 140,
  actor: 100,
  document: 160,
  experiment: 160,
  metric: 140,
  feature: 150,
  version: 150,
  question: 160,
};

const NODE_HEIGHT: Record<string, number> = {
  decision: 80,
  pull_request: 60,
  issue: 60,
  commit: 50,
  component: 44,
  actor: 44,
  document: 50,
  experiment: 50,
  metric: 44,
  feature: 50,
  version: 44,
  question: 50,
};

const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 50;

export function getNodeDimensions(type: NodeType): {
  width: number;
  height: number;
} {
  return {
    width: NODE_WIDTH[type] ?? DEFAULT_WIDTH,
    height: NODE_HEIGHT[type] ?? DEFAULT_HEIGHT,
  };
}

export interface FlowNodeData {
  label: string;
  nodeType: NodeType;
  confidence: string | null;
  node: GraphNode;
  state: "dim" | "visible" | "highlighted" | "focused" | "visited" | "hypothetical" | "predicted";
}

export interface FlowEdgeData {
  edgeType: EdgeType;
  edge: GraphEdge;
  state: "dim" | "visible" | "traversed" | "hypothetical";
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<FlowEdgeData>;

export function buildLayout(
  store: GraphStore,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: "LR",
    nodesep: 50,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const allNodes = store.nodes();
  const allEdges = store.edges();

  // Add nodes to dagre
  for (const node of allNodes) {
    const dims = getNodeDimensions(node.type);
    g.setNode(node.id, { width: dims.width, height: dims.height });
  }

  // Add edges to dagre
  for (const edge of allEdges) {
    g.setEdge(edge.from, edge.to);
  }

  // Compute layout
  dagre.layout(g);

  // Convert dagre positions to React Flow nodes
  const flowNodes: FlowNode[] = allNodes.map((node) => {
    const dagreNode = g.node(node.id);
    const dims = getNodeDimensions(node.type);
    return {
      id: node.id,
      type: node.type === "component" ? "component" : "decision",
      position: {
        x: (dagreNode?.x ?? 0) - dims.width / 2,
        y: (dagreNode?.y ?? 0) - dims.height / 2,
      },
      data: {
        label: node.label,
        nodeType: node.type,
        confidence: node.confidence,
        node,
        state: "dim",
      },
    };
  });

  // Convert edges
  const flowEdges: FlowEdge[] = allEdges
    .filter((edge) => store.getNode(edge.from) && store.getNode(edge.to))
    .map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      type: "graphEdge",
      data: {
        edgeType: edge.type,
        edge,
        state: "dim",
      },
      animated: false,
    }));

  return { nodes: flowNodes, edges: flowEdges };
}

/* ------------------------------------------------------------------ */
/* Highlight helpers                                                   */
/* ------------------------------------------------------------------ */

export function applyNodeStates(
  nodes: FlowNode[],
  highlightedIds: string[],
  visitedIds: Set<string>,
  focusedId: string | null,
  hypotheticalIds: string[] = [],
  predictedIds: string[] = [],
): FlowNode[] {
  return nodes.map((node) => {
    let state: FlowNodeData["state"] = "dim";

    if (focusedId === node.id) {
      state = "focused";
    } else if (highlightedIds.includes(node.id)) {
      if (hypotheticalIds.includes(node.id)) {
        state = "hypothetical";
      } else if (predictedIds.includes(node.id)) {
        state = "predicted";
      } else {
        state = "highlighted";
      }
    } else if (visitedIds.has(node.id)) {
      state = "visited";
    } else if (highlightedIds.length > 0 || visitedIds.size > 0) {
      state = "dim";
    } else {
      state = "visible";
    }

    return {
      ...node,
      data: { ...node.data, state },
    };
  });
}

export function applyEdgeStates(
  edges: FlowEdge[],
  highlightedIds: string[],
  traversedIds: Set<string>,
  hypotheticalIds: string[] = [],
): FlowEdge[] {
  return edges.map((edge) => {
    let state: FlowEdgeData["state"] = "dim";
    const edgeType = edge.data?.edgeType ?? "SUPPORTED_BY";

    if (traversedIds.has(edge.id)) {
      state = "traversed";
    } else if (highlightedIds.includes(edge.id)) {
      if (hypotheticalIds.includes(edge.id)) {
        state = "hypothetical";
      } else {
        state = "visible";
      }
    } else if (traversedIds.size > 0 || highlightedIds.length > 0) {
      state = "dim";
    } else {
      state = "visible";
    }

    const isHypothetical = state === "hypothetical";

    return {
      ...edge,
      data: { ...edge.data, state } as FlowEdgeData,
      animated: state === "traversed",
      style:
        state === "traversed"
          ? { stroke: getEdgeHexColor(edgeType), strokeWidth: 2.5 }
          : isHypothetical
            ? {
                stroke: getEdgeHexColor(edgeType),
                strokeWidth: 2,
                opacity: 0.4,
                strokeDasharray: "6 4",
              }
            : state === "visible"
              ? { stroke: getEdgeHexColor(edgeType), strokeWidth: 2 }
              : { stroke: "#27272a", strokeWidth: 1.5, opacity: 0.5 },
    } as FlowEdge;
  });
}

/* ------------------------------------------------------------------ */
/* Color helpers                                                       */
/* ------------------------------------------------------------------ */

export function getNodeHexColor(type: NodeType): string {
  switch (type) {
    case "decision":
      return "#f59e0b";
    case "pull_request":
      return "#10b981";
    case "issue":
      return "#3b82f6";
    case "commit":
      return "#a855f7";
    case "component":
      return "#06b6d4";
    default:
      return "#a1a1aa";
  }
}

export function getEdgeHexColor(type: EdgeType): string {
  switch (type) {
    case "SUPERSEDES":
      return "#f97316";
    case "SUPPORTED_BY":
      return "#10b981";
    case "REJECTED_ALTERNATIVE":
      return "#ef4444";
    case "IMPLEMENTS":
      return "#3b82f6";
    case "INFORMS":
      return "#a855f7";
    case "AFFECTS":
      return "#06b6d4";
    default:
      return "#52525b";
  }
}

export function getEdgeDashArray(type: EdgeType): string {
  switch (type) {
    case "IMPLEMENTS":
      return "5 5";
    case "REJECTED_ALTERNATIVE":
      return "8 4";
    case "INFORMS":
      return "3 3";
    case "AFFECTS":
      return "4 4";
    default:
      return "none";
  }
}
