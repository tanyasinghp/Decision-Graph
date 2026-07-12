/**
 * graph/traverse.ts — the traversal engine. Read-only, deterministic
 * (sorted store accessors underneath), and the foundation of the Query Agent:
 * each of these functions maps 1:1 onto a future query-agent tool / MCP tool.
 */

import type { EdgeType, GraphEdge, GraphNode } from "../domain/graph.js";
import { decisionData } from "../domain/graph.js";
import type { GraphStore } from "./GraphStore.js";

export interface RelatedHit { node: GraphNode; via: GraphEdge; depth: number }

export class GraphTraversal {
  constructor(private readonly store: GraphStore) {}

  /** Lexical decision lookup by title/hypothesis/context/solution. */
  findDecision(query: string): GraphNode[] {
    const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
    if (terms.length === 0) return [];
    return this.store
      .nodes({ type: "decision" })
      .map((n) => {
        const d = decisionData(n);
        const hay = `${d.title} ${d.hypothesis} ${d.context} ${d.chosenSolution} ${d.scope.component}`.toLowerCase();
        const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
        return { n, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.n.id.localeCompare(b.n.id))
      .map((x) => x.n);
  }

  /** Artifacts evidencing a decision (SUPPORTED_BY + REJECTED_ALTERNATIVE + VALIDATED_BY). */
  findEvidence(decisionId: string): RelatedHit[] {
    const types: EdgeType[] = ["SUPPORTED_BY", "REJECTED_ALTERNATIVE", "VALIDATED_BY"];
    return types.flatMap((type) =>
      this.store.edges({ type, from: decisionId }).flatMap((via) => {
        const node = this.store.getNode(via.to);
        return node ? [{ node, via, depth: 1 }] : [];
      })
    );
  }

  findSupportingArtifacts(decisionId: string): RelatedHit[] {
    return this.findEvidence(decisionId).filter((h) => h.via.type === "SUPPORTED_BY");
  }

  /** Evidence for the roads not taken. */
  findAlternatives(decisionId: string): RelatedHit[] {
    return this.findEvidence(decisionId).filter((h) => h.via.type === "REJECTED_ALTERNATIVE");
  }

  /** Decisions this one superseded/was informed by, transitively (its past). */
  findAncestors(decisionId: string, types: EdgeType[] = ["SUPERSEDES", "INFORMS"]): RelatedHit[] {
    return this.walk(decisionId, types, "out");
  }

  /** Decisions that superseded / were informed by this one (its future). */
  findDescendants(decisionId: string, types: EdgeType[] = ["SUPERSEDES", "INFORMS"]): RelatedHit[] {
    return this.walk(decisionId, types, "in");
  }

  /**
   * Full temporal chain for a decision: oldest → newest along SUPERSEDES.
   * "How did our thinking evolve" is a single call.
   */
  findDecisionHistory(decisionId: string): GraphNode[] {
    const back = this.walk(decisionId, ["SUPERSEDES"], "out").map((h) => h.node);
    const fwd = this.walk(decisionId, ["SUPERSEDES"], "in").map((h) => h.node);
    const self = this.store.getNode(decisionId);
    return [...back.reverse(), ...(self ? [self] : []), ...fwd];
  }

  /** Everything within `depth` hops, any edge type, deduped, nearest-first. */
  findRelated(nodeId: string, depth = 2): RelatedHit[] {
    const hits = new Map<string, RelatedHit>();
    let frontier = [nodeId];
    for (let d = 1; d <= depth; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const via of [...this.store.edges({ from: id }), ...this.store.edges({ to: id })]) {
          const otherId = via.from === id ? via.to : via.from;
          if (otherId === nodeId || hits.has(otherId)) continue;
          const node = this.store.getNode(otherId);
          if (!node) continue;
          hits.set(otherId, { node, via, depth: d });
          next.push(otherId);
        }
      }
      frontier = next;
    }
    return [...hits.values()].sort((a, b) => a.depth - b.depth || a.node.id.localeCompare(b.node.id));
  }

  /**
   * Shortest undirected path between two nodes — "how are these two things
   * connected, reasoning-wise". Returns interleaved [node, edge, node, ...].
   */
  shortestReasoningPath(fromId: string, toId: string): Array<GraphNode | GraphEdge> | undefined {
    if (fromId === toId) {
      const n = this.store.getNode(fromId);
      return n ? [n] : undefined;
    }
    const prev = new Map<string, { via: GraphEdge; from: string }>();
    const queue = [fromId];
    const seen = new Set([fromId]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const via of [...this.store.edges({ from: cur }), ...this.store.edges({ to: cur })]) {
        const next = via.from === cur ? via.to : via.from;
        if (seen.has(next)) continue;
        seen.add(next);
        prev.set(next, { via, from: cur });
        if (next === toId) {
          const path: Array<GraphNode | GraphEdge> = [this.store.getNode(toId)!];
          let at = toId;
          while (at !== fromId) {
            const p = prev.get(at)!;
            path.unshift(p.via);
            path.unshift(this.store.getNode(p.from)!);
            at = p.from;
          }
          return path;
        }
        queue.push(next);
      }
    }
    return undefined;
  }

  private walk(startId: string, types: EdgeType[], direction: "out" | "in"): RelatedHit[] {
    const hits: RelatedHit[] = [];
    const seen = new Set([startId]);
    let frontier = [startId];
    let depth = 0;
    while (frontier.length > 0) {
      depth++;
      const next: string[] = [];
      for (const id of frontier) {
        for (const type of types) {
          const edges = direction === "out" ? this.store.edges({ type, from: id }) : this.store.edges({ type, to: id });
          for (const via of edges) {
            const otherId = direction === "out" ? via.to : via.from;
            if (seen.has(otherId)) continue;
            seen.add(otherId);
            const node = this.store.getNode(otherId);
            if (!node) continue;
            hits.push({ node, via, depth });
            next.push(otherId);
          }
        }
      }
      frontier = next;
    }
    return hits;
  }
}
