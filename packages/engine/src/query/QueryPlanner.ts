/**
 * query/QueryPlanner.ts — question → intent → traversal strategy.
 *
 * ARCHITECTURAL DECISION: the planner is DETERMINISTIC (ordered keyword
 * rules), not an LLM. Rationale:
 *  - The plan decides what enters context, which decides what the answer CAN
 *    be. Nondeterminism here would make identical questions produce different
 *    answers — unacceptable for an explainable system.
 *  - Misclassification cost is low by design: every strategy still includes
 *    the evidence tier, so a "causal" plan answering an "alternatives"
 *    question degrades gracefully rather than failing.
 *  - Rules are inspectable in the trace ("intent=succession because the
 *    question matched /replaced/"). An LLM's choice would be one more thing
 *    to audit.
 * If planning ever needs semantics beyond keywords, the seam is here — the
 * TraversalPlan contract wouldn't change.
 */

import type { EdgeType } from "@dg/domain/graph.js";

export type QueryIntent =
  | "causal"        // Why was X implemented?
  | "succession"    // What replaced X?
  | "evolution"     // How has X evolved?
  | "attribution"   // Who decided X?
  | "evidence"      // Which evidence supports X?
  | "alternatives"  // Which alternatives were rejected?
  | "comparison"    // What changed between A and B?
  | "impact"        // What decisions affected component X?
  | "general";

export interface TraversalPlan {
  intent: QueryIntent;
  /** Why this intent was chosen — goes into the trace. */
  matchedRule: string;
  /** Expansion tiers for the ContextBuilder, highest priority first. */
  tiers: EdgeType[][];
  nodeBudget: number;
  /** Steers the reasoning prompt ("focus on the temporal chain", ...). */
  emphasis: string;
}

const EVIDENCE_TIER: EdgeType[] = ["SUPPORTED_BY", "REJECTED_ALTERNATIVE", "VALIDATED_BY"];
const TEMPORAL_TIER: EdgeType[] = ["SUPERSEDES", "INFORMS"];
const CONTEXT_TIER: EdgeType[] = ["AFFECTS", "IMPLEMENTS", "DISCUSSED_IN", "PROPOSED_IN", "OWNED_BY"];

const RULES: Array<{ intent: QueryIntent; pattern: RegExp; tiers: EdgeType[][]; budget: number; emphasis: string }> = [
  {
    intent: "comparison",
    pattern: /\b(what changed between|difference between|compare|versus|vs\.?)\b/i,
    tiers: [TEMPORAL_TIER, EVIDENCE_TIER, CONTEXT_TIER],
    budget: 35,
    emphasis: "Contrast the decisions explicitly: what changed, what stayed, and what evidence marks the transition.",
  },
  {
    intent: "succession",
    pattern: /\b(replaced|superseded|instead of now|deprecated in favor|what came after)\b/i,
    tiers: [["SUPERSEDES"], ["INFORMS"], EVIDENCE_TIER],
    budget: 20,
    emphasis: "Walk the SUPERSEDES chain forward from the matched decision; the newest decision is the current answer.",
  },
  {
    intent: "evolution",
    pattern: /\b(evolv\w*|history of|changed over time|over the years|progression)\b/i,
    tiers: [["SUPERSEDES"], ["INFORMS"], EVIDENCE_TIER],
    budget: 30,
    emphasis: "Narrate the full chain oldest → newest, with what prompted each transition.",
  },
  {
    intent: "attribution",
    pattern: /\bwho (decided|made|chose|owns|drove|proposed)\b/i,
    tiers: [["OWNED_BY"], TEMPORAL_TIER, EVIDENCE_TIER],
    budget: 20,
    emphasis: "Name the actors visible in the evidence; do not infer ownership beyond it.",
  },
  {
    intent: "evidence",
    pattern: /\b(which|what) evidence|evidence (for|supports|behind)|how do we know\b/i,
    tiers: [["SUPPORTED_BY", "VALIDATED_BY"], ["REJECTED_ALTERNATIVE"]],
    budget: 20,
    emphasis: "Enumerate the evidence with URLs and what each item establishes.",
  },
  {
    intent: "alternatives",
    pattern: /\b(alternative|rejected|considered|why not|other option|road not taken)\b/i,
    tiers: [["REJECTED_ALTERNATIVE"], EVIDENCE_TIER],
    budget: 20,
    emphasis: "Focus on rejected options and the stated reasons for rejection.",
  },
  {
    intent: "impact",
    pattern: /\b(what|which) decisions (affected|shaped|touch|apply to)|decisions (for|about|on) (the )?component\b/i,
    tiers: [["AFFECTS"], TEMPORAL_TIER, EVIDENCE_TIER],
    budget: 35,
    emphasis: "List every decision affecting the target, newest first, one line of rationale each.",
  },
  {
    intent: "causal",
    pattern: /\b(why|reason|rationale|motivat|what led to|purpose of)\b/i,
    tiers: [TEMPORAL_TIER, EVIDENCE_TIER, CONTEXT_TIER],
    budget: 25,
    emphasis: "Explain the causal story: trigger → hypothesis → choice → trade-offs, citing evidence for each step.",
  },
];

const DEFAULT_PLAN: Omit<TraversalPlan, "matchedRule"> = {
  intent: "general",
  tiers: [TEMPORAL_TIER, EVIDENCE_TIER, CONTEXT_TIER],
  nodeBudget: 25,
  emphasis: "Answer strictly from the decisions and evidence in context.",
};

export function planTraversal(question: string): TraversalPlan {
  for (const rule of RULES) {
    if (rule.pattern.test(question)) {
      return {
        intent: rule.intent,
        matchedRule: rule.pattern.source,
        tiers: rule.tiers,
        nodeBudget: rule.budget,
        emphasis: rule.emphasis,
      };
    }
  }
  return { ...DEFAULT_PLAN, matchedRule: "(default)" };
}
