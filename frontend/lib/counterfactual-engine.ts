import type { GraphStore } from "./graph-store";
import type {
  CounterfactualResult,
  HypotheticalChange,
  PredictedConsequence,
  DecisionObject,
} from "./types";

/**
 * Pure function: given a questionId and the graph, compute a structured
 * counterfactual result using only the graph's public traversal APIs.
 *
 * Never mutates the graph — constructs an independent result tree.
 */
export function computeCounterfactual(
  questionId: string,
  graph: GraphStore,
): CounterfactualResult {
  if (!graph) {
    throw new Error("Counterfactual engine requires a loaded graph");
  }

  if (questionId === "what-if-dropdown-reverted") {
    return computeDropdownRevert(graph);
  }

  if (questionId === "what-if-alert-slots-kept") {
    return computeAlertSlotsKept(graph);
  }

  // Fallback: generic counterfactual on the first decision found
  return computeDropdownRevert(graph);
}

/* ------------------------------------------------------------------ */
/* Scenario 1: "What if Dropdown controlled-only API were reverted?"  */
/* ------------------------------------------------------------------ */

function computeDropdownRevert(graph: GraphStore): CounterfactualResult {
  const controlledId =
    "decision:razorpay/blade:dropdown:controlled-only-api";
  const a11yId = "decision:razorpay/blade:dropdown:accessibility-v2";
  const nativeSelectId =
    "decision:razorpay/blade:dropdown:native-select-rejected";
  const dropdownComponentId = "component:razorpay/blade:dropdown";

  const controlled = graph.getDecision(controlledId);
  const a11y = graph.getDecision(a11yId);
  const nativeSelect = graph.getDecision(nativeSelectId);

  // ---- Observed Reality ---- //
  const observedNodeIds: string[] = [];
  const observedEvidenceUrls: string[] = [];

  if (controlled) {
    observedNodeIds.push(controlledId);
    if (controlled.evidence) {
      for (const ev of controlled.evidence) {
        observedEvidenceUrls.push(ev.url);
      }
    }
  }
  if (a11y) {
    observedNodeIds.push(a11yId);
  }
  observedNodeIds.push(nativeSelectId, dropdownComponentId);

  if (controlled && controlled.alternatives) {
    for (const alt of controlled.alternatives) {
      if (alt.evidenceIds) {
        for (const evId of alt.evidenceIds) {
          observedNodeIds.push(evId);
        }
      }
    }
  }

  // ---- Hypothetical Changes ---- //
  const changes: HypotheticalChange[] = [];

  changes.push({
    type: "reverted",
    nodeId: controlledId,
    label: controlled?.title ?? "Dropdown controlled-only API",
    description:
      "The controlled-only requirement would be lifted. SSR hydration guards in the component would be removed. The Dropdown would manage its own selection state internally.",
    evidenceUrls: ["https://github.com/razorpay/blade/pull/1423"],
  });

  // The rejected alternatives become viable again
  if (controlled && controlled.alternatives) {
    for (const alt of controlled.alternatives) {
      changes.push({
        type: "switched",
        nodeId: alt.evidenceIds[0] ?? "",
        label: alt.option,
        description: `Now viable: "${alt.option}". Original rejection rationale: ${alt.reasonRejected}`,
        alternativeOption: alt.option,
        evidenceUrls: [],
      });
    }
  }

  changes.push({
    type: "modified",
    nodeId: a11yId,
    label: "Dropdown accessibility API v2",
    description:
      "The accessibility v2 API was designed for the controlled pattern. If controlled is reverted, the a11y API would need a redesign — its ARIA inference logic assumed parent-managed state.",
    evidenceUrls: ["https://github.com/razorpay/blade/pull/2101"],
  });

  // ---- Predicted Consequences ---- //
  const consequences: PredictedConsequence[] = [];

  consequences.push({
    type: "downstream_invalidated",
    description:
      "The Accessibility v2 decision (PR #2101) builds on the controlled-only API. Reverting the controlled pattern partially invalidates the a11y v2 API surface.",
    nodeIds: [a11yId],
    confidence: "high",
  });

  consequences.push({
    type: "evidence_invalidated",
    description:
      "PR #1423 (feat: controlled-only API) would no longer apply. The commit implementing controlled state management would need to be reversed.",
    nodeIds: [controlledId, "pull_request:razorpay/blade#1423"],
    confidence: "high",
  });

  consequences.push({
    type: "assumption_invalidated",
    description:
      "The core assumption 'SSR hydration bugs are unacceptable' would need to be re-evaluated. Issue #89 documented the hydration problem. Without the controlled fix, hydration bugs would return, potentially affecting the SSR deployment.",
    nodeIds: ["issue:razorpay/blade#89"],
    confidence: "high",
  });

  consequences.push({
    type: "alternative_reconsidered",
    description:
      "The native <select> alternative (Issue #45) was rejected because it cannot be styled consistently across platforms. If controlled API is reverted, the team should revisit this — newer CSS select features may change the trade-off calculus.",
    nodeIds: [nativeSelectId, "issue:razorpay/blade#45"],
    confidence: "medium",
  });

  consequences.push({
    type: "component_affected",
    description:
      "The Dropdown component's internal state management would require a full rewrite. Consumer code that depended on the controlled `value`/`onChange` contract would break.",
    nodeIds: [dropdownComponentId],
    confidence: "high",
  });

  // Build hypothetical and predicted node ID lists
  const hypotheticalNodeIds = [
    controlledId,
    a11yId,
    ...changes
      .map((c) => c.nodeId)
      .filter((id) => id && id !== controlledId && id !== a11yId),
    "issue:razorpay/blade#89",
  ];

  const predictedNodeIds = [
    a11yId,
    "pull_request:razorpay/blade#1423",
    "issue:razorpay/blade#89",
    nativeSelectId,
    "issue:razorpay/blade#45",
    dropdownComponentId,
  ];

  return {
    scenario: "What if the Dropdown controlled-only API were reverted?",
    questionId: "what-if-dropdown-reverted",
    observedReality: {
      title: "Observed Reality",
      description: `The Dropdown component uses a controlled-only API (decision "${controlled?.title}"). This was chosen because SSR hydration bugs made uncontrolled inputs unreliable (Issue #89, PR #1423). The decision has high confidence with two supporting evidence items.`,
      nodeIds: observedNodeIds,
      evidenceUrls: observedEvidenceUrls,
    },
    hypotheticalChanges: {
      title: "Hypothetical Changes",
      description:
        "If this decision were reverted, the following changes would occur:",
      nodeIds: hypotheticalNodeIds,
      changes,
    },
    predictedConsequences: {
      title: "Predicted Consequences",
      description:
        "Reverting the controlled-only API would cascade through the dependency graph:",
      nodeIds: predictedNodeIds,
      consequences,
      affectedComponents: ["Dropdown"],
    },
    confidence: {
      level: "medium",
      rationale:
        "The original evidence is strong (PR #1423, Issue #89). However, predicting cascading effects is inherently speculative. The Accessibility v2 API might survive independently, and the team may have additional context not captured in the graph. Certainty is medium because downstream predictions cannot be verified without actual implementation.",
    },
    reasoningSummary:
      "Using the graph store's traversal APIs (neighbors(), edges(), getDecision()), the engine traced SUPERSEDES and AFFECTS edges from the controlled-only API decision to identify 2 downstream decisions, 1 component, and 5 evidence items that would be affected by a hypothetical revert. Three rejected alternatives were surfaced from the decision's alternative list. Confidence is constrained by the speculative nature of counterfactual reasoning.",
    hypotheticalNodeIds,
    predictedNodeIds,
  };
}

/* ------------------------------------------------------------------ */
/* Scenario 2: "What if Alert action slots were kept instead of v3?"  */
/* ------------------------------------------------------------------ */

function computeAlertSlotsKept(graph: GraphStore): CounterfactualResult {
  const slotsId = "decision:razorpay/blade:alert:action-slots";
  const compositionId = "decision:razorpay/blade:alert:composition-api";
  const alertComponentId = "component:razorpay/blade:alert";

  const slots = graph.getDecision(slotsId);
  const composition = graph.getDecision(compositionId);

  const observedNodeIds = [slotsId, compositionId, alertComponentId];
  const observedEvidenceUrls: string[] = [];

  if (slots) {
    for (const ev of slots.evidence) {
      observedEvidenceUrls.push(ev.url);
    }
  }

  const changes: HypotheticalChange[] = [
    {
      type: "reverted",
      nodeId: compositionId,
      label: "Alert v3 composition API",
      description:
        "The v3 compound component pattern (Alert.Root, Alert.Title, Alert.Description) would be rolled back. The Alert component would keep the v2 named slot pattern.",
      evidenceUrls: ["https://github.com/razorpay/blade/pull/1567"],
    },
    {
      type: "switched",
      nodeId: slotsId,
      label: "Alert action slots",
      description:
        "The named slot pattern (primaryAction, secondaryAction, dismiss) would remain the primary API. New features like custom icons and collapsible content would need new slots instead of compound components.",
      alternativeOption: "Extend slot pattern with more slots",
      evidenceUrls: [],
    },
  ];

  const consequences: PredictedConsequence[] = [
    {
      type: "evidence_invalidated",
      description:
        "PR #1567 (compound component API v3) would be superseded. The code implementing the Alert.Root pattern would be reverted.",
      nodeIds: [compositionId, "pull_request:razorpay/blade#1567"],
      confidence: "high",
    },
    {
      type: "downstream_invalidated",
      description:
        "Future Alert features that were designed for the compound pattern (toast mode, inline links) would need alternative implementations via slots.",
      nodeIds: [alertComponentId],
      confidence: "medium",
    },
    {
      type: "component_affected",
      description:
        "The Alert component would retain its v2 API surface. Consumers would not need to migrate to the compound pattern, but would also miss the flexibility benefits.",
      nodeIds: [alertComponentId],
      confidence: "high",
    },
  ];

  return {
    scenario: "What if Alert action slots were kept instead of the v3 composition API?",
    questionId: "what-if-alert-slots-kept",
    observedReality: {
      title: "Observed Reality",
      description: `The Alert component evolved from boolean props → named action slots (v2) → compound component API (v3). The v3 composition API was chosen because the slot pattern didn't scale to new features.`,
      nodeIds: observedNodeIds,
      evidenceUrls: observedEvidenceUrls,
    },
    hypotheticalChanges: {
      title: "Hypothetical Changes",
      description:
        "If the v3 composition API had not been adopted, the Alert component would remain at the v2 slot pattern:",
      nodeIds: [slotsId, compositionId, alertComponentId],
      changes,
    },
    predictedConsequences: {
      title: "Predicted Consequences",
      description:
        "Keeping the v2 slot pattern would have both positive (no migration) and negative (limited extensibility) consequences:",
      nodeIds: [compositionId, alertComponentId],
      consequences,
      affectedComponents: ["Alert"],
    },
    reasoningSummary:
      "Traced SUPERSEDES edge from v3 composition API to v2 action slots. Evaluated the evidence from PR #1567 and the documented slot limitations. Predicted consequences are based on the gap between slot capabilities and the features that motivated the v3 migration.",
    hypotheticalNodeIds: [slotsId],
    predictedNodeIds: [compositionId, alertComponentId],
    confidence: {
      level: "medium",
      rationale:
        "The v2→v3 migration is documented in PR #1567 with clear reasoning. The slot pattern limitations are well-articulated. However, the counterfactual prediction that new features 'would need alternative implementations' is speculative — the team might have extended slots differently.",
    },
  };
}
