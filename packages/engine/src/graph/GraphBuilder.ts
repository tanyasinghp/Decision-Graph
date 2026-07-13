/**
 * graph/GraphBuilder.ts — Decision Objects → graph nodes + edges.
 *
 * DECISIONS:
 *  - PURE FUNCTION of its inputs: emits sorted NodeInput/EdgeInput lists; the
 *    store applies them. Determinism = sorted output + content-derived ids +
 *    the store's idempotent upsert. Running twice on identical decisions
 *    produces the identical graph (tested).
 *  - Every evidence item yields a uniform SUPPORTED_BY edge (carrying the
 *    excerpt in edge provenance) PLUS a semantic edge by artifact kind:
 *    rfc→PROPOSED_IN, issue→DISCUSSED_IN, pr/commit→IMPLEMENTS. The uniform
 *    edge preserves provenance for audit; the semantic edge is what reasoning
 *    traverses.
 *  - Edge confidence inherits the decision's confidence: the assertion "this
 *    artifact supports this decision" is exactly as trustworthy as the
 *    extraction that made it.
 *  - Cross-decision edges (SUPERSEDES/INFORMS) are NOT built here — they are
 *    the LinkingAgent's job, requiring judgment over the full decision set.
 */

import type { DecisionObject, Evidence } from "@dg/domain/types.js";
import { idFor, slugify, type Provenance } from "@dg/domain/graph.js";
import type { EdgeInput, NodeInput } from "./GraphStore.js";

function artifactNode(repo: string, ev: Evidence, prov: Provenance): NodeInput | undefined {
  const pull = ev.url.match(/\/pull\/(\d+)/);
  if (pull?.[1]) {
    return { id: idFor.pullRequest(repo, Number(pull[1])), type: "pull_request", label: ev.title, data: { url: ev.url, date: ev.date }, metadata: {}, provenance: { ...prov, url: ev.url }, confidence: null };
  }
  const issue = ev.url.match(/\/issues\/(\d+)/);
  if (issue?.[1]) {
    return { id: idFor.issue(repo, Number(issue[1])), type: "issue", label: ev.title, data: { url: ev.url, date: ev.date }, metadata: {}, provenance: { ...prov, url: ev.url }, confidence: null };
  }
  const commit = ev.url.match(/\/commit\/([0-9a-f]{6,40})/);
  if (commit?.[1]) {
    return { id: idFor.commit(repo, commit[1]), type: "commit", label: ev.title, data: { url: ev.url, date: ev.date }, metadata: {}, provenance: { ...prov, url: ev.url }, confidence: null };
  }
  const blob = ev.url.match(/\/blob\/[^/]+\/(.+)$/);
  if (blob?.[1]) {
    return { id: idFor.document(repo, decodeURIComponent(blob[1])), type: "document", label: ev.title, data: { url: ev.url, path: decodeURIComponent(blob[1]), subkind: ev.kind }, metadata: {}, provenance: { ...prov, url: ev.url }, confidence: null };
  }
  return undefined; // unresolvable URL forms don't enter the graph
}

const SEMANTIC_EDGE: Record<Evidence["kind"], "PROPOSED_IN" | "DISCUSSED_IN" | "IMPLEMENTS" | null> = {
  rfc: "PROPOSED_IN",
  issue: "DISCUSSED_IN",
  discussion: "DISCUSSED_IN",
  doc: "DISCUSSED_IN",
  pr: "IMPLEMENTS",
  commit: "IMPLEMENTS",
};

export function buildGraph(repo: string, decisions: DecisionObject[]): { nodes: NodeInput[]; edges: EdgeInput[] } {
  const nodes = new Map<string, NodeInput>();
  const edges: EdgeInput[] = [];

  for (const d of decisions) {
    const prov: Provenance = { source: "github", origin: `extraction:${d.extraction.runId}` };
    const decisionId = idFor.decision(repo, d.scope.component, slugify(d.title));

    nodes.set(decisionId, {
      id: decisionId, type: "decision", label: d.title, data: d,
      metadata: { status: d.status, decidedAt: d.decidedAt ?? null },
      provenance: prov, confidence: d.confidence,
    });

    const componentId = idFor.component(repo, d.scope.component);
    nodes.set(componentId, {
      id: componentId, type: "component", label: d.scope.component, data: { name: d.scope.component },
      metadata: {}, provenance: { source: "github", origin: "extraction" }, confidence: null,
    });
    edges.push({ type: "AFFECTS", from: decisionId, to: componentId, confidence: d.confidence, provenance: prov });

    for (const login of d.actors) {
      const actorId = idFor.actor(login);
      nodes.set(actorId, {
        id: actorId, type: "actor", label: login, data: { login },
        metadata: {}, provenance: { source: "github", origin: "extraction" }, confidence: null,
      });
      edges.push({ type: "OWNED_BY", from: decisionId, to: actorId, confidence: d.confidence, provenance: prov });
    }

    const rejectedEvidenceIds = new Set(d.alternatives.flatMap((a) => a.evidenceIds));
    for (const ev of d.evidence) {
      const artifact = artifactNode(repo, ev, prov);
      if (!artifact) continue;
      if (!nodes.has(artifact.id)) nodes.set(artifact.id, artifact);

      // Uniform provenance edge, excerpt attached where the claim lives.
      edges.push({
        type: rejectedEvidenceIds.has(ev.id) ? "REJECTED_ALTERNATIVE" : "SUPPORTED_BY",
        from: decisionId, to: artifact.id, confidence: d.confidence,
        provenance: { ...prov, url: ev.url }, rationale: ev.excerpt,
      });

      // Semantic edge by artifact kind (skip for rejected-alternative evidence).
      const sem = rejectedEvidenceIds.has(ev.id) ? null : SEMANTIC_EDGE[ev.kind];
      if (sem === "IMPLEMENTS") {
        edges.push({ type: "IMPLEMENTS", from: artifact.id, to: decisionId, confidence: d.confidence, provenance: { ...prov, url: ev.url } });
      } else if (sem) {
        edges.push({ type: sem, from: decisionId, to: artifact.id, confidence: d.confidence, provenance: { ...prov, url: ev.url } });
      }
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => `${a.type}:${a.from}->${a.to}`.localeCompare(`${b.type}:${b.from}->${b.to}`)),
  };
}
