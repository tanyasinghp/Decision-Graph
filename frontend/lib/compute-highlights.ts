import type { GraphStore } from "./graph-store";
import type { RunEvent } from "./types";

export interface HighlightResult {
  nodeIds: string[];
  edgeIds: string[];
}

/**
 * Given a RunEvent and the GraphStore, compute which nodes and edges should
 * be highlighted. The event's tool_call input often contains decision IDs
 * and edge types that map directly to graph elements.
 */
export function computeHighlights(
  event: RunEvent,
  graph: GraphStore | null,
): HighlightResult {
  if (!graph) return { nodeIds: [], edgeIds: [] };

  switch (event.t) {
    case "tool_call": {
      const input = event.input as Record<string, unknown>;

      if (event.name === "traverse") {
        return handleTraverse(input, graph);
      }

      if (event.name === "get_evidence") {
        return handleGetEvidence(input, graph);
      }

      if (event.name === "record_answer") {
        return handleRecordAnswer(input, graph);
      }

      if (event.name === "search_decisions") {
        return handleSearchDecisions(input, graph);
      }

      return { nodeIds: [], edgeIds: [] };
    }

    case "decision_emitted": {
      const decisionId = event.decisionId;
      const node = graph.getNode(decisionId);
      if (!node) return { nodeIds: [decisionId], edgeIds: [] };

      const connectedEdges = [
        ...graph.edges({ from: decisionId }),
        ...graph.edges({ to: decisionId }),
      ];

      return {
        nodeIds: [decisionId],
        edgeIds: connectedEdges.map((e) => e.id),
      };
    }

    case "tool_result": {
      if (event.summary) {
        const ids = extractNodeIdsFromSummary(event.summary, graph);
        if (ids.length > 0) {
          return { nodeIds: ids, edgeIds: [] };
        }
      }
      return { nodeIds: [], edgeIds: [] };
    }

    default:
      return { nodeIds: [], edgeIds: [] };
  }
}

/* ------------------------------------------------------------------ */
/* Handler helpers                                                     */
/* ------------------------------------------------------------------ */

function handleTraverse(
  input: Record<string, unknown>,
  graph: GraphStore,
): HighlightResult {
  const decisionId = input.decisionId as string | undefined;
  const edgeTypes = (input.edgeTypes as string[]) ?? [];
  const direction = (input.direction as string) ?? "out";

  if (!decisionId || !graph.getNode(decisionId)) {
    return { nodeIds: [], edgeIds: [] };
  }

  const nodeIds: string[] = [decisionId];
  const edgeIds: string[] = [];

  const candidateEdges =
    direction === "in"
      ? graph.edges({ to: decisionId })
      : graph.edges({ from: decisionId });

  for (const edge of candidateEdges) {
    const edgeTypeMatch =
      edgeTypes.length === 0 || edgeTypes.includes(edge.type);
    if (edgeTypeMatch) {
      edgeIds.push(edge.id);
      const neighborId = edge.from === decisionId ? edge.to : edge.from;
      nodeIds.push(neighborId);
    }
  }

  return { nodeIds, edgeIds };
}

function handleGetEvidence(
  input: Record<string, unknown>,
  graph: GraphStore,
): HighlightResult {
  const decisionId = input.decisionId as string | undefined;
  if (!decisionId || !graph.getNode(decisionId)) {
    return { nodeIds: [], edgeIds: [] };
  }

  const nodeIds: string[] = [decisionId];
  const edgeIds: string[] = [];

  const supportedBy = graph.edges({
    from: decisionId,
    type: "SUPPORTED_BY",
  });

  for (const edge of supportedBy) {
    edgeIds.push(edge.id);
    const evidenceNode = graph.getNode(edge.to);
    if (evidenceNode) nodeIds.push(edge.to);

    // Also include IMPLEMENTS edges going the other direction
    const implementsEdges = graph.edges({ from: edge.to, type: "IMPLEMENTS" });
    for (const ie of implementsEdges) {
      edgeIds.push(ie.id);
    }
  }

  // Also include DISCUSSED_IN edges
  const discussedIn = graph.edges({ from: decisionId, type: "DISCUSSED_IN" });
  for (const edge of discussedIn) {
    edgeIds.push(edge.id);
    const discussionNode = graph.getNode(edge.to);
    if (discussionNode) nodeIds.push(edge.to);
  }

  return { nodeIds, edgeIds };
}

function handleRecordAnswer(
  input: Record<string, unknown>,
  graph: GraphStore,
): HighlightResult {
  const supportingIds = (input.supportingDecisionIds as string[]) ?? [];
  const nodeIds: string[] = [];
  const edgeIds: string[] = [];

  for (const id of supportingIds) {
    if (!graph.getNode(id)) continue;
    nodeIds.push(id);

    const connectedEdges = [
      ...graph.edges({ from: id }),
      ...graph.edges({ to: id }),
    ];

    for (const edge of connectedEdges) {
      edgeIds.push(edge.id);
      const neighborId = edge.from === id ? edge.to : edge.from;
      if (!nodeIds.includes(neighborId)) {
        nodeIds.push(neighborId);
      }
    }
  }

  return { nodeIds, edgeIds };
}

/* ------------------------------------------------------------------ */
/* Search highlight — find nodes matching the query                   */
/* ------------------------------------------------------------------ */

function handleSearchDecisions(
  input: Record<string, unknown>,
  graph: GraphStore,
): HighlightResult {
  const query = (input.query as string) ?? "";
  if (!query) return { nodeIds: [], edgeIds: [] };

  const terms = query.toLowerCase().split(/\s+/);
  const nodeIds: string[] = [];

  for (const node of graph.nodes()) {
    const label = node.label.toLowerCase();
    const id = node.id.toLowerCase();
    const matches = terms.some((t) => label.includes(t) || id.includes(t));
    if (matches) {
      nodeIds.push(node.id);
    }
  }

  return { nodeIds: nodeIds.slice(0, 5), edgeIds: [] };
}

/* ------------------------------------------------------------------ */
/* Simple heuristic: try to pull node IDs from free-text summaries    */
/* ------------------------------------------------------------------ */

function extractNodeIdsFromSummary(
  summary: string,
  graph: GraphStore,
): string[] {
  const ids: string[] = [];
  for (const node of graph.nodes()) {
    if (summary.includes(node.id)) {
      ids.push(node.id);
    }
  }
  return ids;
}
