import type { Node, Edge } from "reactflow";
import type { GraphNode, GraphEdge, NodeType, EdgeType } from "./types";
import type { GraphStore } from "./graph-store";

/* ------------------------------------------------------------------ */
/* Strata layout (UX_REDESIGN_PLAN §2)                                 */
/*                                                                     */
/* The graph is laid out as software evolution, not as a network:      */
/*   band 0  components   — what the thinking shaped                   */
/*   band 1  decisions    — THE SPINE, x-ordered by decidedAt          */
/*   band 2+ evidence     — stacked beneath the decision it supports   */
/* Time flows left → right. SUPERSEDES edges therefore read as         */
/* horizontal arrows along the time axis — evolution is visible        */
/* geometry, not a legend entry.                                       */
/* ------------------------------------------------------------------ */

const SPINE_GAP_X = 340;        // min horizontal gap between decisions (§14)
const BAND_COMPONENTS_Y = 0;
const BAND_DECISIONS_Y = 220;
const BAND_EVIDENCE_Y = 460;
const EVIDENCE_STACK_GAP = 96;  // vertical gap within an evidence stack
const COMPONENT_MIN_GAP = 220;

const NODE_WIDTH: Record<string, number> = {
  decision: 260,
  pull_request: 190,
  issue: 190,
  commit: 170,
  component: 150,
  actor: 100,
  document: 190,
  experiment: 170,
  metric: 150,
  feature: 160,
  version: 150,
  question: 170,
};

const NODE_HEIGHT: Record<string, number> = {
  decision: 96,
  pull_request: 56,
  issue: 56,
  commit: 48,
  component: 44,
  actor: 40,
  document: 56,
  experiment: 48,
  metric: 44,
  feature: 48,
  version: 44,
  question: 48,
};

const DEFAULT_WIDTH = 170;
const DEFAULT_HEIGHT = 50;

export function getNodeDimensions(type: NodeType): { width: number; height: number } {
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
  state:
    | "dim"          // unrelated — very dim but PRESENT (never removed)
    | "faded"        // frontier — adjacent to visited/active, reachable next
    | "visible"      // rest state before any reasoning
    | "highlighted"  // on the active path
    | "focused"      // THE current node (only glow on screen)
    | "visited"      // already consulted
    | "hypothetical"
    | "predicted";
  /** Year chip for decision nodes — makes the time axis legible per-node. */
  year?: string;
}

export interface FlowEdgeData {
  edgeType: EdgeType;
  edge: GraphEdge;
  state: "dim" | "faded" | "visible" | "traversed" | "hypothetical";
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge<FlowEdgeData>;

/** decidedAt lives on the DecisionObject payload carried in node.data. */
function decisionDate(node: GraphNode): string {
  const data = node.data as Record<string, unknown> | undefined;
  return String(data?.decidedAt ?? node.createdAt ?? "9999");
}

export function buildLayout(store: GraphStore): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const allNodes = store.nodes();
  const allEdges = store.edges();
  const pos = new Map<string, { x: number; y: number }>();

  /* Band 1 — decision spine, time-ordered. */
  const decisions = allNodes
    .filter((n) => n.type === "decision")
    .sort((a, b) => decisionDate(a).localeCompare(decisionDate(b)) || a.id.localeCompare(b.id));
  decisions.forEach((d, i) => pos.set(d.id, { x: i * SPINE_GAP_X, y: BAND_DECISIONS_Y }));

  const anchorX = (connectedDecisionIds: string[]): number | undefined => {
    const xs = connectedDecisionIds
      .map((id) => pos.get(id)?.x)
      .filter((x): x is number => x !== undefined);
    if (xs.length === 0) return undefined;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };

  /* Band 0 — components, positioned above the decisions that affect them. */
  const components = allNodes.filter((n) => n.type === "component");
  const compWithX = components.map((c) => {
    const affecting = allEdges.filter((e) => e.to === c.id && e.type === "AFFECTS").map((e) => e.from);
    return { node: c, x: anchorX(affecting) ?? 0 };
  }).sort((a, b) => a.x - b.x || a.node.id.localeCompare(b.node.id));
  let lastCompX = -Infinity;
  for (const c of compWithX) {
    const x = Math.max(c.x, lastCompX + COMPONENT_MIN_GAP);
    pos.set(c.node.id, { x, y: BAND_COMPONENTS_Y });
    lastCompX = x;
  }

  /* Band 2+ — evidence artifacts, stacked beneath their anchor decision. */
  const artifactTypes: NodeType[] = ["issue", "pull_request", "commit", "document", "experiment", "metric"];
  const stacks = new Map<string, GraphNode[]>(); // anchor decision id → artifacts
  const orphans: GraphNode[] = [];

  for (const n of allNodes.filter((a) => artifactTypes.includes(a.type))) {
    const connected = allEdges
      .filter((e) => e.from === n.id || e.to === n.id)
      .map((e) => (e.from === n.id ? e.to : e.from))
      .filter((id) => pos.has(id) && decisions.some((d) => d.id === id));
    const anchor = connected[0];
    if (anchor) {
      const stack = stacks.get(anchor) ?? [];
      stack.push(n);
      stacks.set(anchor, stack);
    } else {
      orphans.push(n);
    }
  }
  for (const [anchor, stack] of stacks) {
    const ax = pos.get(anchor)!.x;
    stack
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach((n, i) => pos.set(n.id, { x: ax, y: BAND_EVIDENCE_Y + i * EVIDENCE_STACK_GAP }));
  }

  /* Everything else (actors, orphans) — quiet right-hand margin. */
  const rightEdge = (decisions.length || 1) * SPINE_GAP_X + 120;
  const rest = allNodes.filter((n) => !pos.has(n.id));
  [...orphans, ...rest.filter((n) => !orphans.includes(n))]
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((n, i) => pos.set(n.id, { x: rightEdge, y: i * 80 }));

  /* Flow nodes */
  const flowNodes: FlowNode[] = allNodes.map((node) => {
    const p = pos.get(node.id) ?? { x: 0, y: 0 };
    const dims = getNodeDimensions(node.type);
    const year = node.type === "decision" ? decisionDate(node).slice(0, 4) : undefined;
    return {
      id: node.id,
      type: node.type === "component" ? "component" : "decision",
      position: { x: p.x - dims.width / 2, y: p.y - dims.height / 2 },
      data: {
        label: node.label,
        nodeType: node.type,
        confidence: node.confidence,
        node,
        state: "visible",
        year: year && year !== "9999" ? year : undefined,
      },
    };
  });

  /* Flow edges — leave from the correct face of each node so inter-band
     relations read vertically and spine relations read horizontally. */
  const flowEdges: FlowEdge[] = allEdges
    .filter((edge) => store.getNode(edge.from) && store.getNode(edge.to))
    .map((edge) => {
      const from = pos.get(edge.from)!;
      const to = pos.get(edge.to)!;
      const vertical = Math.abs(to.y - from.y) > Math.abs(to.x - from.x);
      const sourceHandle = vertical ? (to.y > from.y ? "s-b" : "s-t") : to.x > from.x ? "s-r" : "s-l";
      const targetHandle = vertical ? (to.y > from.y ? "t-t" : "t-b") : to.x > from.x ? "t-l" : "t-r";
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        sourceHandle,
        targetHandle,
        type: "graphEdge",
        data: { edgeType: edge.type, edge, state: "visible" as const },
        animated: false,
      };
    });

  return { nodes: flowNodes, edges: flowEdges };
}

/* ------------------------------------------------------------------ */
/* State helpers — the 4-tier visibility rule (§6):                    */
/* active > visited > frontier(faded) > unrelated(dim). Nothing is     */
/* ever removed; the dim mass is what makes the lit path read as a     */
/* path through knowledge.                                             */
/* ------------------------------------------------------------------ */

export function applyNodeStates(
  nodes: FlowNode[],
  edges: FlowEdge[],
  highlightedIds: string[],
  visitedIds: Set<string>,
  focusedId: string | null,
  hypotheticalIds: string[] = [],
  predictedIds: string[] = [],
): FlowNode[] {
  const reasoningActive = highlightedIds.length > 0 || visitedIds.size > 0;

  // Frontier = neighbors of anything visited or highlighted.
  const hot = new Set([...highlightedIds, ...visitedIds]);
  const frontier = new Set<string>();
  if (reasoningActive) {
    for (const e of edges) {
      if (hot.has(e.source) && !hot.has(e.target)) frontier.add(e.target);
      if (hot.has(e.target) && !hot.has(e.source)) frontier.add(e.source);
    }
  }

  return nodes.map((node) => {
    let state: FlowNodeData["state"];
    if (hypotheticalIds.includes(node.id)) state = "hypothetical";
    else if (predictedIds.includes(node.id)) state = "predicted";
    else if (focusedId === node.id) state = "focused";
    else if (highlightedIds.includes(node.id)) state = "highlighted";
    else if (visitedIds.has(node.id)) state = "visited";
    else if (frontier.has(node.id)) state = "faded";
    else if (reasoningActive) state = "dim";
    else state = "visible";

    return { ...node, data: { ...node.data, state } };
  });
}

export function applyEdgeStates(
  edges: FlowEdge[],
  highlightedIds: string[],
  traversedIds: Set<string>,
  hypotheticalIds: string[] = [],
): FlowEdge[] {
  const reasoningActive = highlightedIds.length > 0 || traversedIds.size > 0;

  return edges.map((edge) => {
    let state: FlowEdgeData["state"];
    if (hypotheticalIds.includes(edge.id)) state = "hypothetical";
    else if (traversedIds.has(edge.id)) state = "traversed";
    else if (highlightedIds.includes(edge.id)) state = "traversed";
    else if (reasoningActive) state = "dim";
    else state = "visible";

    const edgeType = edge.data?.edgeType ?? "SUPPORTED_BY";

    // COLOR DIET (§15): edges are neutral at rest and earn color only when
    // traversed. Rejected alternatives keep red as standing semantics.
    const style =
      state === "traversed"
        ? { stroke: getEdgeHexColor(edgeType), strokeWidth: 2.5 }
        : state === "hypothetical"
          ? { stroke: "#a855f7", strokeWidth: 2, opacity: 0.5, strokeDasharray: "6 4" }
          : state === "visible"
            ? edgeType === "REJECTED_ALTERNATIVE"
              ? { stroke: "#ef444455", strokeWidth: 1.5, strokeDasharray: "8 4" }
              : { stroke: "#3f3f46", strokeWidth: 1.5 }
            : { stroke: "#27272a", strokeWidth: 1, opacity: 0.6 };

    return {
      ...edge,
      data: { ...edge.data, state } as FlowEdgeData,
      animated: state === "traversed",
      style,
    } as FlowEdge;
  });
}

/* ------------------------------------------------------------------ */
/* Color helpers — ONE accent for decisions/active path; evidence is   */
/* neutral with tinted type badges; purple/amber for counterfactuals.  */
/* ------------------------------------------------------------------ */

export function getNodeHexColor(type: NodeType): string {
  switch (type) {
    case "decision":
      return "#f59e0b"; // THE accent
    case "component":
      return "#22d3ee";
    case "pull_request":
    case "issue":
    case "commit":
    case "document":
      return "#a1a1aa"; // evidence is neutral; the badge carries the type
    default:
      return "#a1a1aa";
  }
}

/** Badge tint only — small areas may keep type color for recognition. */
export function getBadgeHexColor(type: NodeType): string {
  switch (type) {
    case "pull_request":
      return "#10b981";
    case "issue":
      return "#3b82f6";
    case "commit":
      return "#a855f7";
    case "document":
      return "#eab308";
    default:
      return "#a1a1aa";
  }
}

export function getEdgeHexColor(type: EdgeType): string {
  switch (type) {
    case "SUPERSEDES":
      return "#f59e0b"; // evolution shares the decision accent
    case "REJECTED_ALTERNATIVE":
      return "#ef4444";
    case "SUPPORTED_BY":
    case "IMPLEMENTS":
    case "DISCUSSED_IN":
    case "PROPOSED_IN":
      return "#71717a"; // evidence relations stay quiet even when lit…
    case "INFORMS":
      return "#a855f7";
    case "AFFECTS":
      return "#22d3ee";
    default:
      return "#71717a";
  }
}

export function getEdgeDashArray(type: EdgeType): string {
  switch (type) {
    case "REJECTED_ALTERNATIVE":
      return "8 4";
    case "INFORMS":
      return "3 3";
    default:
      return "none";
  }
}
