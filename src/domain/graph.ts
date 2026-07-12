/**
 * domain/graph.ts — the Decision Graph data model. THE contract everything
 * downstream (UI, MCP tools, browser extension, enterprise integrations)
 * consumes.
 *
 * ARCHITECTURAL DECISIONS:
 *
 * 1. ARTIFACTS ARE NODES; "EVIDENCE" IS A ROLE. The old schema had an
 *    "evidence" node kind — wrong abstraction. A PR is not intrinsically
 *    evidence; it's a pull request that HAPPENS to support some decision and
 *    might implement another. Node identity = what the thing IS
 *    (issue/pull_request/commit/document); evidentiary role = typed edges
 *    (SUPPORTED_BY, IMPLEMENTS, ...). Consequence: a future Slack message or
 *    Figma frame is just another artifact node type with the same edge
 *    vocabulary — integrations add node types, never restructure.
 *
 * 2. SOURCE-AGNOSTIC CORE + PROVENANCE. Every node/edge carries provenance
 *    {source, origin, url}. GitHub is one source enum value among
 *    slack|linear|jira|notion|browser|figma|analytics. Nothing else in the
 *    graph layer knows where data came from.
 *
 * 3. ALL 13 NODE TYPES ARE REPRESENTABLE; ONLY PRODUCED TYPES ARE BUILT.
 *    experiment/metric/question/feature/version have schema + endpoint rules
 *    today and zero fabricated instances — a type with no real producer is
 *    documentation, not code. When analytics ingestion lands, its nodes
 *    already have a home.
 *
 * 4. CONFIDENCE AND PROVENANCE LIVE ON EDGES TOO. "Decision D is supported
 *    by PR#42" is itself a claim with a confidence and an origin. Reasoning
 *    over the graph needs to know how much to trust each hop, not just each
 *    node.
 */

import { z } from "zod";
import { ConfidenceSchema, DecisionObjectSchema } from "./schemas.js";

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

export const SourceSystemSchema = z.enum([
  "github", "slack", "linear", "jira", "notion", "browser", "figma", "analytics", "internal",
]);

export const ProvenanceSchema = z.object({
  source: SourceSystemSchema,
  /** Who/what asserted this: "extraction:<runId>", "linking:<runId>", "prefetch", "human". */
  origin: z.string().min(1),
  url: z.string().url().optional(),
});

/* ------------------------------------------------------------------ */
/* Nodes                                                               */
/* ------------------------------------------------------------------ */

export const NodeTypeSchema = z.enum([
  "decision", "component", "actor",
  "issue", "pull_request", "commit", "document",
  "experiment", "metric", "question", "feature", "version",
]);

export const GraphNodeSchema = z.object({
  /** Stable, deterministic, content-derived — see idFor* helpers. */
  id: z.string().min(1),
  type: NodeTypeSchema,
  /** Human-readable display name; never used as a key. */
  label: z.string().min(1),
  /** Type-specific payload. For decisions: the full DecisionObject. */
  data: z.unknown(),
  metadata: z.record(z.unknown()).default({}),
  provenance: ProvenanceSchema,
  /** null = not a graded assertion (components, actors). */
  confidence: ConfidenceSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Bumped when content changes on upsert; prior snapshots go to history. */
  version: z.number().int().positive(),
});

/** Deterministic node ids: same entity → same id, across runs and sources. */
export const idFor = {
  decision: (repo: string, component: string, titleSlug: string): string =>
    `decision:${repo}:${component.toLowerCase()}:${titleSlug}`,
  component: (repo: string, name: string): string => `component:${repo}:${name.toLowerCase()}`,
  actor: (login: string): string => `actor:${login.toLowerCase()}`,
  issue: (repo: string, n: number): string => `issue:${repo}#${n}`,
  pullRequest: (repo: string, n: number): string => `pull_request:${repo}#${n}`,
  commit: (repo: string, sha: string): string => `commit:${repo}@${sha.slice(0, 12)}`,
  document: (repo: string, path: string): string => `document:${repo}:${path}`,
};

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/* ------------------------------------------------------------------ */
/* Edges                                                               */
/* ------------------------------------------------------------------ */

export const EdgeTypeSchema = z.enum([
  "SUPPORTED_BY",          // decision → artifact: this artifact evidences the decision
  "IMPLEMENTS",            // pull_request|commit → decision: code that realized it
  "SUPERSEDES",            // decision → decision (acyclic): replaced its target
  "PROPOSED_IN",           // decision → document|issue: where it was first put forward
  "DISCUSSED_IN",          // decision → issue|pull_request|document: where debated
  "REJECTED_ALTERNATIVE",  // decision → artifact: evidence for a road not taken
  "VALIDATED_BY",          // decision → experiment|metric|artifact: outcome evidence
  "AFFECTS",               // decision → component|feature: what it shapes
  "OWNED_BY",              // decision|component|feature → actor
  "REFERENCES",            // artifact → artifact: cross-reference
  "GENERATED_FROM",        // any → any: derivation lineage (summaries, imports)
  "INFORMS",               // decision → decision (acyclic): learning that shaped a later call
]);

export const GraphEdgeSchema = z.object({
  /** Deterministic: `${type}:${from}->${to}` — duplicate assertions merge. */
  id: z.string().min(1),
  type: EdgeTypeSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  confidence: ConfidenceSchema.nullable(),
  provenance: ProvenanceSchema,
  rationale: z.string().optional(),
  createdAt: z.string(),
});

export type NodeType = z.infer<typeof NodeTypeSchema>;
export type EdgeType = z.infer<typeof EdgeTypeSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

const ARTIFACTS: NodeType[] = ["issue", "pull_request", "commit", "document"];
const OUTCOME_SOURCES: NodeType[] = ["experiment", "metric", ...ARTIFACTS];
const ANY: NodeType[] = NodeTypeSchema.options;

/**
 * Endpoint-kind rules per edge type — enforced by GraphStore.addEdge.
 * DECISION: rules are data, not code, so the contract is auditable in one
 * screen and MCP tools can introspect it.
 */
export const EDGE_RULES: Record<EdgeType, { from: NodeType[]; to: NodeType[]; acyclic: boolean }> = {
  SUPPORTED_BY:         { from: ["decision"], to: OUTCOME_SOURCES, acyclic: false },
  IMPLEMENTS:           { from: ["pull_request", "commit"], to: ["decision"], acyclic: false },
  SUPERSEDES:           { from: ["decision"], to: ["decision"], acyclic: true },
  PROPOSED_IN:          { from: ["decision"], to: ["document", "issue"], acyclic: false },
  DISCUSSED_IN:         { from: ["decision"], to: ["issue", "pull_request", "document"], acyclic: false },
  REJECTED_ALTERNATIVE: { from: ["decision"], to: [...ARTIFACTS], acyclic: false },
  VALIDATED_BY:         { from: ["decision"], to: OUTCOME_SOURCES, acyclic: false },
  AFFECTS:              { from: ["decision"], to: ["component", "feature"], acyclic: false },
  OWNED_BY:             { from: ["decision", "component", "feature"], to: ["actor"], acyclic: false },
  REFERENCES:           { from: ANY, to: ANY, acyclic: false },
  GENERATED_FROM:       { from: ANY, to: ANY, acyclic: true },
  INFORMS:              { from: ["decision"], to: ["decision"], acyclic: true },
};

export const edgeId = (type: EdgeType, from: string, to: string): string => `${type}:${from}->${to}`;

/* ------------------------------------------------------------------ */
/* Graph file                                                          */
/* ------------------------------------------------------------------ */

export const GraphFileSchema = z.object({
  schemaVersion: z.literal(2),
  repo: z.string(),
  nodes: z.record(GraphNodeSchema),
  edges: z.record(GraphEdgeSchema),
});
export type GraphFile = z.infer<typeof GraphFileSchema>;

/** Convenience: the DecisionObject payload of a decision node, typed. */
export function decisionData(node: GraphNode): z.infer<typeof DecisionObjectSchema> {
  return DecisionObjectSchema.parse(node.data);
}
