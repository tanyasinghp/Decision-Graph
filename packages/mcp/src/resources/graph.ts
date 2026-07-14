/**
 * decisiongraph://graph — node/edge counts + statistics (metadata only; the
 * full graph is NOT serialized). Read-only, via Workspace → stores() → graph().
 */

import { currentWorkspace, type ResourceHandler } from "./types.js";

export const URI_GRAPH = "decisiongraph://graph";

export const resGraph: ResourceHandler = async (inv) => {
  const ws = await currentWorkspace(inv);
  if (!ws) {
    return { uri: URI_GRAPH, contents: { nodeCount: 0, edgeCount: 0, nodesByType: {}, edgesByType: {} } };
  }
  const g = ws.stores().graph();
  const nodes = g.nodes();
  const edges = g.edges();

  const nodesByType: Record<string, number> = {};
  for (const n of nodes) nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;
  const edgesByType: Record<string, number> = {};
  for (const e of edges) edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;

  return {
    uri: URI_GRAPH,
    contents: { nodeCount: nodes.length, edgeCount: edges.length, nodesByType, edgesByType },
  };
};
