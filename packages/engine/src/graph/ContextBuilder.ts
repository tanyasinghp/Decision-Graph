/**
 * graph/ContextBuilder.ts — question → minimal reasoning context.
 *
 * THE design problem: Claude must answer "why" questions from the graph, not
 * the repository. Dumping the whole graph into context defeats the purpose;
 * retrieval-by-similarity (RAG) loses the structure that makes multi-hop
 * answers possible. The Context Builder is the third way:
 *
 *   1. SEED — lexical match of the question against decision/component/
 *      artifact labels and decision text (deterministic keyword scoring; no
 *      embeddings; same rationale as EvidenceIndex).
 *   2. EXPAND — structural closure over the seeds along PRIORITIZED edges:
 *      temporal chains first (SUPERSEDES/INFORMS both directions — a "why" is
 *      usually answered by history), then evidence (SUPPORTED_BY,
 *      REJECTED_ALTERNATIVE), then context (AFFECTS, IMPLEMENTS, DISCUSSED_IN,
 *      PROPOSED_IN, OWNED_BY). Expansion is budgeted (default 25 nodes) —
 *      priority order decides what survives the cut, so the budget cuts
 *      garnish, never the spine.
 *   3. RENDER — deterministic markdown: decisions grouped by component,
 *      SUPERSEDES chains shown oldest→newest with dates, every claim carrying
 *      its evidence URLs + excerpts, confidence + provenance visible. The
 *      model receives structure it can cite, not soup.
 *
 * The result: the Query Agent's first tool call can be "build_context" and
 * most questions are answerable in one hop, with graph traversal tools held
 * in reserve for follow-ups.
 */

import { decisionData, type GraphNode } from "@dg/domain/graph.js";
import type { GraphStore } from "./GraphStore.js";
import { GraphTraversal } from "./traverse.js";

export interface BuiltContext {
  text: string;
  seedIds: string[];
  includedNodeIds: string[];
  approxTokens: number;
}

/** Expansion strategy — supplied by the QueryPlanner; defaults cover ad-hoc use. */
export interface ExpansionPlan {
  tiers: ReadonlyArray<ReadonlyArray<string>>;
  nodeBudget: number;
}

const DEFAULT_PLAN: ExpansionPlan = {
  tiers: [
    ["SUPERSEDES", "INFORMS"],
    ["SUPPORTED_BY", "REJECTED_ALTERNATIVE", "VALIDATED_BY"],
    ["AFFECTS", "IMPLEMENTS", "DISCUSSED_IN", "PROPOSED_IN", "OWNED_BY"],
  ],
  nodeBudget: 25,
};

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

export class ContextBuilder {
  private readonly traversal: GraphTraversal;

  constructor(private readonly store: GraphStore, private readonly defaultBudget = 25) {
    this.traversal = new GraphTraversal(store);
  }

  build(question: string, plan?: Partial<ExpansionPlan>): BuiltContext {
    const tiers = plan?.tiers ?? DEFAULT_PLAN.tiers;
    const nodeBudget = plan?.nodeBudget ?? this.defaultBudget;
    const terms = new Set(tokenize(question));

    // 1. SEED — score every node lexically; decisions get their text searched.
    const scored = this.store.nodes()
      .map((n) => {
        let hay = n.label.toLowerCase();
        if (n.type === "decision") {
          const d = decisionData(n);
          hay += ` ${d.title} ${d.context} ${d.hypothesis} ${d.chosenSolution} ${d.scope.component}`.toLowerCase();
        }
        const hayTokens = new Set(tokenize(hay));
        let score = 0;
        for (const t of terms) if (hayTokens.has(t)) score += n.type === "decision" ? 3 : 2;
        return { n, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.n.id.localeCompare(b.n.id));

    const seeds = scored.slice(0, 3).map((x) => x.n);
    const included = new Map<string, GraphNode>(seeds.map((n) => [n.id, n]));

    // 2. EXPAND — planner-supplied priority tiers, budgeted.
    for (const tier of tiers) {
      for (const seedLike of [...included.values()]) {
        if (included.size >= nodeBudget) break;
        for (const edge of [...this.store.edges({ from: seedLike.id }), ...this.store.edges({ to: seedLike.id })]) {
          if (!(tier as readonly string[]).includes(edge.type)) continue;
          if (included.size >= nodeBudget) break;
          const otherId = edge.from === seedLike.id ? edge.to : edge.from;
          const other = this.store.getNode(otherId);
          if (other && !included.has(otherId)) included.set(otherId, other);
        }
      }
    }

    // 3. RENDER
    const decisions = [...included.values()].filter((n) => n.type === "decision");
    const byComponent = new Map<string, GraphNode[]>();
    for (const n of decisions) {
      const comp = decisionData(n).scope.component;
      (byComponent.get(comp) ?? byComponent.set(comp, []).get(comp)!).push(n);
    }

    const L: string[] = [`# Decision context for: "${question}"`, ""];
    for (const [comp, ns] of [...byComponent.entries()].sort()) {
      L.push(`## Component: ${comp}`);
      for (const n of ns.sort((a, b) => a.id.localeCompare(b.id))) {
        const d = decisionData(n);
        L.push(``, `### [${n.id}] ${d.title}`);
        L.push(`status=${d.status} confidence=${d.confidence} decided≈${d.decidedAt ?? "unknown"} (extracted by ${n.provenance.origin}, node v${n.version})`);
        L.push(`- Context: ${d.context}`);
        L.push(`- Hypothesis: ${d.hypothesis}`);
        L.push(`- Chosen: ${d.chosenSolution}`);
        if (d.tradeOffs.length > 0) L.push(`- Trade-offs: ${d.tradeOffs.join("; ")}`);
        for (const alt of d.alternatives) L.push(`- Rejected: ${alt.option} — ${alt.reasonRejected}`);
        if (d.observedOutcome !== null) L.push(`- Observed outcome: ${d.observedOutcome}`);
        else L.push(`- Observed outcome: (no follow-up evidence found)`);
        L.push(`- Evidence:`);
        for (const ev of d.evidence) L.push(`  - ${ev.url} — "${ev.excerpt.slice(0, 220)}"`);

        const history = this.traversal.findDecisionHistory(n.id);
        if (history.length > 1) {
          L.push(`- Evolution (oldest → newest): ${history.map((h) => `${h.id}${h.id === n.id ? " ←this" : ""}`).join(" ⇒ ")}`);
        }
      }
      L.push("");
    }

    const artifacts = [...included.values()].filter((n) => ["issue", "pull_request", "commit", "document"].includes(n.type));
    if (artifacts.length > 0) {
      L.push(`## Related artifacts`);
      for (const a of artifacts.sort((x, y) => x.id.localeCompare(y.id))) {
        const url = (a.data as { url?: string }).url ?? "";
        L.push(`- [${a.type}] ${a.label} ${url}`);
      }
    }
    if (decisions.length === 0) {
      L.push(`No decisions in the graph match this question. Say so rather than speculating.`);
    }

    const text = L.join("\n");
    return {
      text,
      seedIds: seeds.map((n) => n.id),
      includedNodeIds: [...included.keys()].sort(),
      approxTokens: Math.ceil(text.length / 4),
    };
  }
}
