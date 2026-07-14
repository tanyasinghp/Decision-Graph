/**
 * tests/query.test.ts — the query engine under a scripted model:
 * planner classification, plan-driven context, citation gate, certainty
 * propagation, insufficient/conflicting evidence, superseded chains, trace.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planTraversal } from "@dg/engine/query/QueryPlanner.js";
import { capCertainty, certaintyCeiling } from "@dg/engine/query/certainty.js";
import { QueryEngine, type Answer } from "@dg/engine/query/QueryEngine.js";
import { JsonGraphStore } from "@dg/engine/graph/GraphStore.js";
import { buildGraph } from "@dg/engine/graph/GraphBuilder.js";
import type { DecisionObject } from "@dg/domain/types.js";
import type { LlmClient, LlmRequest, LlmResponse } from "@dg/engine/llm/LlmClient.js";

const REPO = "o/r";
let tmp: string;
let tick = 0;
const clock = (): string => `2026-01-01T00:00:${String(tick++ % 60).padStart(2, "0")}Z`;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-query-")); tick = 0; });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

function mkDecision(over: Partial<DecisionObject>): DecisionObject {
  return {
    id: "d", title: "t".repeat(10), scope: { component: "Dropdown" }, status: "adopted",
    hypothesis: "Controlled-only state avoids SSR hydration mismatches entirely.",
    context: "Recurring hydration bugs with uncontrolled state broke checkout.",
    alternatives: [], chosenSolution: "Require value/onChange; drop internal state.",
    tradeOffs: [], evidence: [{
      id: "pr-42", kind: "pr", url: "https://github.com/o/r/pull/42",
      title: "controlled API", excerpt: "SSR hydration mismatches kept breaking checkout flows", date: "2023-04-01",
    }],
    observedOutcome: null, confidence: "high", confidenceRationale: "explicit PR discussion",
    actors: ["alice"], decidedAt: "2023-04-01",
    extraction: { runId: "run-1", model: "m", toolCalls: 5, ts: "2026-01-01" },
    ...over,
  };
}

function storeWith(decisions: DecisionObject[]): JsonGraphStore {
  const store = new JsonGraphStore(tmp, REPO, clock);
  const { nodes, edges } = buildGraph(REPO, decisions);
  for (const n of nodes) store.upsertNode(n);
  for (const e of edges) store.addEdge(e);
  return store;
}

/** Scripted model: emits given record_answer inputs in order, then stops. */
class ScriptedAnswerer implements LlmClient {
  readonly model = "fake-query";
  readonly requests: LlmRequest[] = [];
  private i = 0;
  constructor(private answers: Array<Partial<Answer>>) {}
  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(req);
    const next = this.answers[this.i];
    if (!next) return { stopReason: "end_turn", blocks: [], usage: { inputTokens: 1, outputTokens: 1 } };
    this.i++;
    const full: Answer = {
      answer: "Because uncontrolled state caused SSR hydration bugs, the API is controlled-only.",
      certainty: "known",
      supportingDecisionIds: [],
      supportingEvidenceUrls: ["https://github.com/o/r/pull/42"],
      missingEvidence: null,
      reasoningSummary: "Single decision directly answers the question with cited PR evidence.",
      ...next,
    } as Answer;
    return {
      stopReason: "tool_use",
      blocks: [{ type: "tool_use", id: `t${this.i}`, name: "record_answer", input: full }],
      usage: { inputTokens: 10, outputTokens: 10 },
    };
  }
}

describe("QueryPlanner (deterministic classification)", () => {
  const cases: Array<[string, string]> = [
    ["Why was Retry Payment introduced?", "causal"],
    ["What replaced the native select approach?", "succession"],
    ["How has Dropdown evolved over time?", "evolution"],
    ["Who decided the controlled-only API?", "attribution"],
    ["Which evidence supports the controlled API decision?", "evidence"],
    ["Which alternatives were rejected for Dropdown?", "alternatives"],
    ["What changed between the v1 and v2 API?", "comparison"],
    ["What decisions affected component Dropdown?", "impact"],
    ["Tell me about Dropdown", "general"],
  ];
  for (const [q, intent] of cases) {
    it(`"${q}" → ${intent}`, () => expect(planTraversal(q).intent).toBe(intent));
  }

  it("plans carry tiers, budget, and the matched rule for the trace", () => {
    const plan = planTraversal("Why was X built?");
    expect(plan.tiers.length).toBeGreaterThan(0);
    expect(plan.nodeBudget).toBeGreaterThan(0);
    expect(plan.matchedRule).not.toBe("(default)");
  });
});

describe("Certainty propagation (mechanical)", () => {
  it("ceiling: none→unknown, low→possible, medium→likely, all-high→known", () => {
    expect(certaintyCeiling([])).toBe("unknown");
    expect(certaintyCeiling(["high", "low"])).toBe("possible");
    expect(certaintyCeiling(["high", "medium"])).toBe("likely");
    expect(certaintyCeiling(["high", "high"])).toBe("known");
  });
  it("cap = min(proposed, ceiling); downgrades flagged", () => {
    expect(capCertainty("known", ["medium"])).toEqual({ final: "likely", ceiling: "likely", downgraded: true });
    expect(capCertainty("possible", ["high"])).toEqual({ final: "possible", ceiling: "known", downgraded: false });
  });
});

describe("QueryEngine end-to-end (scripted model)", () => {
  it("causal question: answers with citations; trace is complete", async () => {
    const store = storeWith([mkDecision({ title: "Dropdown exposes a controlled-only selection API" })]);
    const decisionId = store.nodes({ type: "decision" })[0]!.id;
    const engine = new QueryEngine(new ScriptedAnswerer([{ supportingDecisionIds: [decisionId] }]), store, REPO);

    const res = await engine.answerQuestion("Why is Dropdown selection controlled only?");
    expect(res.answer.certainty).toBe("known"); // high-confidence decision → no cap
    expect(res.trace.intent).toBe("causal");
    expect(res.trace.visitedNodeIds).toContain(decisionId);
    expect(res.trace.certaintyDowngraded).toBe(false);
    const trace = engine.traceReasoning(res);
    for (const part of ["Question:", "intent: causal", "supporting decisions:", "certainty: known", "Answer:"]) {
      expect(trace).toContain(part);
    }
  });

  it("citation gate: rejects ids outside context, model corrects, rejection traced", async () => {
    const store = storeWith([mkDecision({ title: "Dropdown exposes a controlled-only selection API" })]);
    const decisionId = store.nodes({ type: "decision" })[0]!.id;
    const engine = new QueryEngine(
      new ScriptedAnswerer([
        { supportingDecisionIds: ["decision:o/r:dropdown:invented-decision"] }, // hallucinated citation
        { supportingDecisionIds: [decisionId] },                                 // corrected
      ]),
      store, REPO
    );
    const res = await engine.answerQuestion("Why is Dropdown controlled only?");
    expect(res.answer.supportingDecisionIds).toEqual([decisionId]);
    expect(res.trace.rejectedCitations).toContain("decision:o/r:dropdown:invented-decision");
  });

  it("confidence propagation: 'known' over a low-confidence decision is capped to 'possible'", async () => {
    const store = storeWith([mkDecision({ title: "Dropdown uses portal rendering for overlays", confidence: "low" })]);
    const decisionId = store.nodes({ type: "decision" })[0]!.id;
    const engine = new QueryEngine(
      new ScriptedAnswerer([{ certainty: "known", supportingDecisionIds: [decisionId] }]),
      store, REPO
    );
    const res = await engine.answerQuestion("Why does Dropdown use portal rendering?");
    expect(res.answer.certainty).toBe("possible");
    expect(res.trace.proposedCertainty).toBe("known");
    expect(res.trace.certaintyDowngraded).toBe(true);
  });

  it("insufficient evidence: unknown without missingEvidence is schema-rejected; with it, accepted", async () => {
    const store = storeWith([mkDecision({ title: "Dropdown exposes a controlled-only selection API" })]);
    const engine = new QueryEngine(
      new ScriptedAnswerer([
        { certainty: "unknown", missingEvidence: null, supportingDecisionIds: [] },                      // invalid
        { certainty: "unknown", missingEvidence: "No decisions about pricing exist in the graph.", supportingDecisionIds: [], answer: "The graph does not record anything about pricing pages, so this cannot be answered." }, // valid
      ]),
      store, REPO
    );
    const res = await engine.answerQuestion("Why is the pricing page yellow?");
    expect(res.answer.certainty).toBe("unknown");
    expect(res.answer.missingEvidence).toContain("pricing");
  });

  it("temporal/superseded: context contains the full chain marked oldest → newest", async () => {
    const d1 = mkDecision({ title: "Dropdown uses native select element", status: "superseded", decidedAt: "2021-01-01" });
    const d2 = mkDecision({ title: "Dropdown uses custom listbox widget", status: "adopted", decidedAt: "2023-01-01" });
    const store = storeWith([d1, d2]);
    const byTitle = (frag: string): string => store.nodes({ type: "decision" }).find((n) => n.label.includes(frag))!.id;
    store.addEdge({
      type: "SUPERSEDES", from: byTitle("custom listbox"), to: byTitle("native select"),
      confidence: "medium", provenance: { source: "internal", origin: "linking" },
    });

    const engine = new QueryEngine(new ScriptedAnswerer([{ supportingDecisionIds: [byTitle("custom listbox")] }]), store, REPO);
    const res = await engine.answerQuestion("How has the Dropdown select element evolved?");
    expect(res.trace.intent).toBe("evolution");
    expect(res.context.text).toContain("Evolution (oldest → newest)");
    expect(res.context.text).toContain("status=superseded");
    // The reasoning prompt (system) instructs: newest decision is current.
    
  });

  it("comparison question gets the comparison plan and larger budget", () => {
    const plan = planTraversal("What changed between the native select and the listbox versions?");
    expect(plan.intent).toBe("comparison");
    expect(plan.nodeBudget).toBeGreaterThanOrEqual(35);
  });

  it("conflicting evidence: certainty over mixed-confidence decisions is capped at the weakest", async () => {
    // Two adopted decisions with contradictory solutions and NO supersedes ordering.
    const d1 = mkDecision({ title: "Dropdown closes on outside click by default", confidence: "high" });
    const d2 = mkDecision({ title: "Dropdown stays open on outside click for multiselect", confidence: "low" });
    const store = storeWith([d1, d2]);
    const ids = store.nodes({ type: "decision" }).map((n) => n.id);
    const engine = new QueryEngine(
      new ScriptedAnswerer([{
        certainty: "likely",
        supportingDecisionIds: ids,
        answer: "The decisions conflict: closing on outside click is default, but multiselect keeps it open; no supersedes ordering exists.",
        reasoningSummary: "Two unordered decisions conflict; surfaced both rather than picking silently.",
      }]),
      store, REPO
    );
    const res = await engine.answerQuestion("Why does Dropdown close on outside click?");
    expect(res.answer.certainty).toBe("possible"); // capped by the low-confidence member
    expect(res.answer.answer).toContain("conflict");
  });

  it("the reasoning call carries the graph context, not raw artifacts", async () => {
    const store = storeWith([mkDecision({ title: "Dropdown exposes a controlled-only selection API" })]);
    const decisionId = store.nodes({ type: "decision" })[0]!.id;
    const llm = new ScriptedAnswerer([{ supportingDecisionIds: [decisionId] }]);
    const engine = new QueryEngine(llm, store, REPO);
    await engine.answerQuestion("Why is Dropdown controlled only?");
    const system = llm.requests[0]!.system;
    expect(system).toContain("Decision Graph context");
    expect(system).toContain(decisionId);
    expect(llm.requests[0]!.tools.map((t) => t.name)).toEqual(["record_answer"]); // no evidence tools exist
  });
});
