/* ------------------------------------------------------------------ */
/* Graph types — mirrors backend domain/graph.ts                     */
/* ------------------------------------------------------------------ */

export type NodeType =
  | "decision"
  | "component"
  | "actor"
  | "issue"
  | "pull_request"
  | "commit"
  | "document"
  | "experiment"
  | "metric"
  | "question"
  | "feature"
  | "version";

export type EdgeType =
  | "SUPPORTED_BY"
  | "IMPLEMENTS"
  | "SUPERSEDES"
  | "PROPOSED_IN"
  | "DISCUSSED_IN"
  | "REJECTED_ALTERNATIVE"
  | "VALIDATED_BY"
  | "AFFECTS"
  | "OWNED_BY"
  | "REFERENCES"
  | "GENERATED_FROM"
  | "INFORMS";

export type Confidence = "high" | "medium" | "low";

export type Certainty = "unknown" | "possible" | "likely" | "known";

export interface Provenance {
  source: string;
  origin: string;
  url?: string;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: unknown;
  confidence: Confidence | null;
  provenance: Provenance;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  from: string;
  to: string;
  confidence: Confidence | null;
  provenance: Provenance;
  rationale?: string;
  createdAt: string;
}

export interface GraphFile {
  schemaVersion: number;
  repo: string;
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge>;
}

/* ------------------------------------------------------------------ */
/* Decision object — from decision node data                          */
/* ------------------------------------------------------------------ */

export interface DecisionObject {
  id: string;
  title: string;
  scope: { component: string; area?: string };
  status: "adopted" | "superseded" | "revisited";
  hypothesis: string;
  context: string;
  alternatives: Alternative[];
  chosenSolution: string;
  tradeOffs: string[];
  evidence: EvidenceItem[];
  expectedOutcome?: string;
  observedOutcome: string | null;
  confidence: Confidence;
  confidenceRationale: string;
  actors: string[];
  decidedAt?: string;
  extraction: {
    runId: string;
    model: string;
    toolCalls: number;
    ts: string;
  };
}

export interface Alternative {
  option: string;
  reasonRejected: string;
  evidenceIds: string[];
}

export interface EvidenceItem {
  id: string;
  kind: "pr" | "issue" | "discussion" | "commit" | "rfc" | "doc";
  url: string;
  title: string;
  excerpt: string;
  date?: string;
}

/* ------------------------------------------------------------------ */
/* Run events — mirrors backend RunEventSchema                        */
/* ------------------------------------------------------------------ */

export type RunEvent =
  | { t: "run_started"; runId: string; component: string; model: string; ts: string }
  | { t: "phase"; name: string; ts: string }
  | { t: "tool_call"; seq: number; name: string; input: unknown; ts: string }
  | { t: "tool_result"; seq: number; summary: string; bytes: number; isError: boolean; ts: string }
  | { t: "guard_hit"; path: string; ts: string }
  | { t: "decision_emitted"; decisionId: string; title: string; confidence: Confidence; ts: string }
  | { t: "decision_rejected"; errors: string[]; ts: string }
  | { t: "assistant_text"; text: string; ts: string }
  | { t: "run_finished"; status: "completed" | "truncated" | "failed"; stats: Record<string, unknown>; ts: string };

/* ------------------------------------------------------------------ */
/* Answer types — mirrors backend QueryEngine                         */
/* ------------------------------------------------------------------ */

export interface Answer {
  answer: string;
  certainty: Certainty;
  supportingDecisionIds: string[];
  supportingEvidenceUrls: string[];
  missingEvidence: string | null;
  reasoningSummary: string;
}

export interface ReasoningTrace {
  question: string;
  intent: string;
  matchedRule: string;
  seedIds: string[];
  visitedNodeIds: string[];
  contextTokens: number;
  proposedCertainty: Certainty;
  certaintyCeiling: Certainty;
  certaintyDowngraded: boolean;
  rejectedCitations: string[];
}

export interface AnsweredQuestion {
  answer: Answer;
  trace: ReasoningTrace;
  plan: { intent: string; matchedRule: string; emphasis: string };
}

/* ------------------------------------------------------------------ */
/* Repo statistics                                                     */
/* ------------------------------------------------------------------ */

export interface RepoStats {
  repo: string;
  branch: string;
  commitCount: number;
  issueCount: number;
  prCount: number;
  decisionCount: number;
  evidenceCount: number;
  nodeCount: number;
  edgeCount: number;
  extractionConfidence: number;
  evaluationSummary?: {
    precision: number;
    recall: number;
    f1: number;
  };
}

/* ------------------------------------------------------------------ */
/* Counterfactual / Hypothetical types                                 */
/* ------------------------------------------------------------------ */

export interface HypotheticalChange {
  type: "reverted" | "switched" | "modified" | "invalidated";
  nodeId: string;
  label: string;
  description: string;
  alternativeOption?: string;
  evidenceUrls: string[];
}

export interface PredictedConsequence {
  type:
    | "downstream_invalidated"
    | "assumption_invalidated"
    | "evidence_invalidated"
    | "component_affected"
    | "alternative_reconsidered";
  description: string;
  nodeIds: string[];
  confidence: Confidence;
}

export interface CounterfactualSection {
  title: string;
  description: string;
  nodeIds: string[];
}

export interface CounterfactualResult {
  scenario: string;
  questionId: string;
  observedReality: CounterfactualSection & {
    evidenceUrls: string[];
  };
  hypotheticalChanges: CounterfactualSection & {
    changes: HypotheticalChange[];
  };
  predictedConsequences: CounterfactualSection & {
    consequences: PredictedConsequence[];
    affectedComponents: string[];
  };
  confidence: {
    level: Confidence;
    rationale: string;
  };
  reasoningSummary: string;
  hypotheticalNodeIds: string[];
  predictedNodeIds: string[];
}

/* ------------------------------------------------------------------ */
/* Demo example question                                               */
/* ------------------------------------------------------------------ */

export interface DemoExample {
  id: string;
  question: string;
  runFile: string;
  intent: string;
  description: string;
}

/* ------------------------------------------------------------------ */
/* Node helpers                                                        */
/* ------------------------------------------------------------------ */

export function getDecisionData(node: GraphNode): DecisionObject | null {
  if (node.type !== "decision") return null;
  return node.data as DecisionObject;
}

export function isArtifactType(type: NodeType): boolean {
  return ["issue", "pull_request", "commit", "document"].includes(type);
}

export function getNodeTypeColor(type: NodeType): string {
  switch (type) {
    case "decision":
      return "amber";
    case "pull_request":
      return "emerald";
    case "issue":
      return "blue";
    case "commit":
      return "purple";
    case "component":
      return "cyan";
    case "actor":
      return "violet";
    default:
      return "slate";
  }
}

export function getEdgeTypeColor(type: EdgeType): string {
  switch (type) {
    case "SUPERSEDES":
      return "orange";
    case "SUPPORTED_BY":
      return "emerald";
    case "REJECTED_ALTERNATIVE":
      return "red";
    case "IMPLEMENTS":
      return "blue";
    case "INFORMS":
      return "violet";
    case "AFFECTS":
      return "cyan";
    case "PROPOSED_IN":
    case "DISCUSSED_IN":
      return "amber";
    case "VALIDATED_BY":
      return "teal";
    case "OWNED_BY":
      return "pink";
    default:
      return "slate";
  }
}

/* ------------------------------------------------------------------ */
/* Evidence Explorer types                                             */
/* ------------------------------------------------------------------ */

export type EvidenceKind = "pr" | "issue" | "discussion" | "commit" | "rfc" | "doc";

export type RelationType =
  | "SUPPORTED_BY"
  | "IMPLEMENTS"
  | "DISCUSSED_IN"
  | "REJECTED_ALTERNATIVE"
  | "AFFECTS";

export interface EvidenceCardData {
  id: string;
  kind: EvidenceKind;
  title: string;
  excerpt: string;
  url: string;
  date?: string;
  confidence: Confidence;
  confidenceRationale: string;
  sourceDecisionId: string;
  sourceDecisionLabel: string;
  relationType: RelationType;
  associatedNodeIds: string[];
  timelineEventIndex: number | null;
}

export function getEdgeTypeLabel(type: EdgeType): string {
  switch (type) {
    case "SUPERSEDES":
      return "Supersedes";
    case "SUPPORTED_BY":
      return "Supported by";
    case "REJECTED_ALTERNATIVE":
      return "Rejected alternative";
    case "IMPLEMENTS":
      return "Implements";
    case "INFORMS":
      return "Informs";
    case "AFFECTS":
      return "Affects";
    case "PROPOSED_IN":
      return "Proposed in";
    case "DISCUSSED_IN":
      return "Discussed in";
    case "VALIDATED_BY":
      return "Validated by";
    case "OWNED_BY":
      return "Owned by";
    case "REFERENCES":
      return "References";
    case "GENERATED_FROM":
      return "Generated from";
  }
}
