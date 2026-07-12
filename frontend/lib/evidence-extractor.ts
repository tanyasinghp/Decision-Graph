import type { GraphStore } from "./graph-store";
import type { RunEvent, EvidenceCardData, EvidenceItem } from "./types";

/**
 * Extracts EvidenceCardData from a run event by looking up the decision's
 * evidence in the graph store. Deduplicates by URL.
 */
export function extractEvidenceFromEvent(
  event: RunEvent,
  graph: GraphStore | null,
  knownUrls: Set<string>,
  timelineIndex: number,
): EvidenceCardData[] {
  if (!graph) return [];

  const cards: EvidenceCardData[] = [];

  // Extract decisionId from tool_call or decision_emitted events
  let decisionIds: string[] = [];

  if (event.t === "tool_call" && event.name === "get_evidence") {
    const input = (event.input ?? {}) as Record<string, unknown>;
    const id = input.decisionId as string | undefined;
    if (id) decisionIds = [id];
  }

  if (event.t === "tool_call" && event.name === "traverse") {
    const input = (event.input ?? {}) as Record<string, unknown>;
    const id = input.decisionId as string | undefined;
    if (id) decisionIds = [id];
  }

  if (event.t === "decision_emitted") {
    decisionIds = [event.decisionId];
  }

  if (event.t === "tool_result") {
    // Try to find a decision mentioned in the summary
    const decisionNodes = graph.decisionNodes();
    for (const node of decisionNodes) {
      if (event.summary.includes(node.id)) {
        decisionIds.push(node.id);
      }
    }
  }

  for (const decisionId of decisionIds) {
    const decision = graph.getDecision(decisionId);
    if (!decision) continue;

    // Determine relation type from edge
    const edges = graph.edges({ from: decisionId, type: "SUPPORTED_BY" });
    const incomingEdges = graph.edges({ to: decisionId });

    // Create cards from decision evidence items
    if (!decision.evidence) continue;
    for (const ev of decision.evidence) {
      if (knownUrls.has(ev.url)) continue;
      knownUrls.add(ev.url);

      const relationType = getRelationType(ev.id, edges, incomingEdges, graph);
      const associatedNodeIds = findAssociatedNodes(ev, graph);

      cards.push({
        id: ev.id,
        kind: ev.kind,
        title: ev.title,
        excerpt: ev.excerpt,
        url: ev.url,
        date: ev.date,
        confidence: decision.confidence,
        confidenceRationale: decision.confidenceRationale,
        sourceDecisionId: decisionId,
        sourceDecisionLabel: decision.title,
        relationType,
        associatedNodeIds: [decisionId, ...associatedNodeIds],
        timelineEventIndex: timelineIndex,
      });
    }

    // Also create cards from alternative evidence references
    if (!decision.alternatives) continue;
    for (const alt of decision.alternatives) {
      if (!alt.evidenceIds) continue;
      for (const evidenceId of alt.evidenceIds) {
        // Find the artifact node for this evidence ID
        const artifactNode = graph
          .nodes()
          .find(
            (n) =>
              n.id === evidenceId || n.label.includes(evidenceId),
          );
        if (!artifactNode) continue;

        const url = (artifactNode.data as Record<string, unknown>)
          ?.url as string | undefined;
        if (!url || knownUrls.has(url)) continue;
        knownUrls.add(url);

        cards.push({
          id: evidenceId,
          kind: artifactNode.type as EvidenceCardData["kind"],
          title: artifactNode.label,
          excerpt: alt.reasonRejected,
          url,
          confidence: "medium",
          confidenceRationale:
            "Referenced as rejected alternative in decision context.",
          sourceDecisionId: decisionId,
          sourceDecisionLabel: decision.title,
          relationType: "REJECTED_ALTERNATIVE",
          associatedNodeIds: [decisionId, artifactNode.id],
          timelineEventIndex: timelineIndex,
        });
      }
    }
  }

  return cards;
}

function getRelationType(
  evidenceId: string,
  outgoingEdges: ReturnType<GraphStore["edges"]>,
  incomingEdges: ReturnType<GraphStore["edges"]>,
  graph: GraphStore,
): EvidenceCardData["relationType"] {
  // Check if there's an edge from the decision to this evidence
  for (const edge of outgoingEdges) {
    if (edge.to === evidenceId) return "SUPPORTED_BY";
  }

  // Check IMPLEMENTS edges from the evidence to the decision
  for (const edge of incomingEdges) {
    if (edge.from === evidenceId && edge.type === "IMPLEMENTS")
      return "IMPLEMENTS";
  }

  // Check DISCUSSED_IN edges
  for (const edge of outgoingEdges) {
    if (edge.to === evidenceId && edge.type === "DISCUSSED_IN")
      return "DISCUSSED_IN";
  }

  // Check AFFECTS edges
  for (const edge of outgoingEdges) {
    if (edge.to === evidenceId && edge.type === "AFFECTS") return "AFFECTS";
  }

  return "SUPPORTED_BY";
}

function findAssociatedNodes(
  ev: EvidenceItem,
  graph: GraphStore,
): string[] {
  const ids: string[] = [];

  // Find artifact node matching this evidence ID or URL
  for (const node of graph.nodes()) {
    if (node.id === ev.id) {
      ids.push(node.id);
      continue;
    }

    const data = node.data as Record<string, unknown> | undefined;
    if (data?.url === ev.url) {
      ids.push(node.id);
    }
  }

  return ids;
}
