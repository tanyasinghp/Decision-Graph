/**
 * tests/validation.test.ts — the evaluation machinery, end to end with a
 * scripted judge. Metric definitions are pinned by tests so a future refactor
 * can't silently change what "precision" means the night before the demo.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { segmentMarkdown, GroundTruth } from "@dg/engine/validation/GroundTruth.js";
import { computeMetrics } from "@dg/engine/validation/metrics.js";
import { aggregateMetrics, renderMarkdown, type ComponentEvaluation } from "@dg/engine/validation/report.js";
import { Judge, computeMissDiagnostics } from "@dg/engine/validation/Judge.js";
import type { MatchVerdict } from "@dg/engine/validation/verdicts.js";
import { CacheStore } from "@dg/engine/evidence/CacheStore.js";
import { CachedEvidenceRepository } from "@dg/engine/evidence/EvidenceRepository.js";
import type { DecisionObject, RunEvent } from "@dg/domain/types.js";
import type { LlmClient, LlmRequest, LlmResponse } from "@dg/engine/llm/LlmClient.js";

let tmp: string;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dg-val-")); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const mkDecision = (id: string, confidence: "high" | "medium" | "low"): DecisionObject => ({
  id, title: `Decision ${id} about component API design`, scope: { component: "X" },
  status: "adopted",
  hypothesis: "The chosen approach avoids a known class of bugs entirely.",
  context: "Recurring bug reports pushed the team to reconsider the API.",
  alternatives: [], chosenSolution: "Expose a minimal controlled API surface.",
  tradeOffs: [], evidence: [{
    id: "pr-1", kind: "pr", url: "https://github.com/o/r/pull/1", title: "t",
    excerpt: "this excerpt is long enough to pass the schema gate easily", date: "2023-01-01",
  }],
  observedOutcome: null, confidence, confidenceRationale: "test fixture rationale",
  actors: [], extraction: { runId: "r", model: "m", toolCalls: 1, ts: "2026-01-01" },
});

describe("GroundTruth segmentation", () => {
  it("splits on h2/h3 headings and drops thin sections", () => {
    const md = [
      "Intro line that is definitely substantial enough to be a preamble unit, with enough characters to pass.",
      "## API shape\n" + "x".repeat(100),
      "## Tiny\nshort",
      "### Nested decision\n" + "y".repeat(100),
    ].join("\n");
    const units = segmentMarkdown("f.md", md);
    expect(units.map((u) => u.heading)).toEqual(["(preamble)", "API shape", "Nested decision"]);
    expect(units[1]?.ref).toBe("f.md#api-shape");
  });

  it("discovers components from _decisions paths", () => {
    const root = path.join(tmp, "gt", "o__r");
    const mk = (p: string): void => {
      fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
      fs.writeFileSync(path.join(root, p), "## D\n" + "z".repeat(100), "utf8");
    };
    mk("packages/blade/src/components/Alert/_decisions/decisions.md");
    mk("packages/blade/src/components/Dropdown/_decisions/api.md");
    const gt = new GroundTruth(path.join(tmp, "gt"), "o/r");
    expect(gt.componentsAvailable()).toEqual(["Alert", "Dropdown"]);
    expect(gt.forComponent("alert")).toHaveLength(1);
  });
});

describe("computeMetrics — definitions pinned", () => {
  const extracted = [mkDecision("d1", "high"), mkDecision("d2", "medium"), mkDecision("d3", "low")];
  const gtRefs = ["g1", "g2", "g3", "g4"];
  const verdict: MatchVerdict = {
    matches: [
      { extractedId: "d1", groundTruthRef: "g1", overlap: "full", rationale: "same decision same rationale" },
      { extractedId: "d2", groundTruthRef: "g2", overlap: "partial", rationale: "same choice thin rationale" },
    ],
    decisionSupport: [
      { extractedId: "d1", grade: "supported", fabricatedClaims: [] },
      { extractedId: "d2", grade: "weak", fabricatedClaims: [] },
      { extractedId: "d3", grade: "supported", fabricatedClaims: ["invented a metrics claim"] },
    ],
    fieldSupport: [
      { extractedId: "d1", hypothesis: true, context: true, chosenSolution: true, alternatives: true },
      { extractedId: "d2", hypothesis: true, context: true, chosenSolution: true, alternatives: false },
      { extractedId: "d3", hypothesis: false, context: true, chosenSolution: true, alternatives: false },
    ],
  };
  const m = computeMetrics(extracted, gtRefs, verdict);

  it("precision counts full+partial over extracted (3-decimal rounding)", () => expect(m.precision).toBe(0.667));
  it("recall counts only FULL matches over ground truth", () => expect(m.recall).toBe(0.25));
  it("coverage counts full+partial over ground truth", () => expect(m.decisionCoverage).toBe(0.5));
  it("evidence coverage = supported fields / 4×extracted", () => expect(m.evidenceCoverage).toBe(9 / 12));
  it("hallucination = decisions with fabricated claims", () => expect(m.hallucinationRate).toBe(Math.round((1 / 3) * 1000) / 1000));
  it("unsupported rate is distinct from hallucination", () => expect(m.unsupportedRate).toBe(0));
  it("novel = unmatched but supported", () => expect(m.novelSupported).toBe(1)); // d3
  it("calibration buckets by grade", () => {
    expect(m.confidenceCalibration.high).toEqual({ total: 1, matched: 1 });
    expect(m.confidenceCalibration.low).toEqual({ total: 1, matched: 0 });
  });
  it("average confidence maps high/medium/low to 1/0.5/0", () => expect(m.averageConfidence).toBe(0.5));
});

describe("Judge via scripted model", () => {
  class ScriptedJudge implements LlmClient {
    readonly model = "fake-judge";
    constructor(private toolName: string, private verdict: unknown) {}
    async complete(req: LlmRequest): Promise<LlmResponse> {
      // First call: return the verdict tool call. Second: stop.
      const alreadyCalled = req.messages.some(
        (msg) => Array.isArray(msg.content) && msg.content.some((b) => "type" in b && b.type === "tool_result")
      );
      if (alreadyCalled) return { stopReason: "end_turn", blocks: [], usage: { inputTokens: 1, outputTokens: 1 } };
      return {
        stopReason: "tool_use",
        blocks: [{ type: "tool_use", id: "t1", name: this.toolName, input: this.verdict }],
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    }
  }

  it("accepts a schema-valid verdict", async () => {
    const judge = new Judge(new ScriptedJudge("record_verdict", {
      matches: [], decisionSupport: [], fieldSupport: [],
    }));
    const v = await judge.match("X", [mkDecision("d1", "high")], [{ ref: "g1", file: "f", heading: "h", body: "b".repeat(100) }]);
    expect(v.matches).toEqual([]);
  });

  it("throws if the judge never records a verdict", async () => {
    class SilentJudge implements LlmClient {
      readonly model = "silent";
      async complete(): Promise<LlmResponse> {
        return { stopReason: "end_turn", blocks: [{ type: "text", text: "looks fine" }], usage: { inputTokens: 1, outputTokens: 1 } };
      }
    }
    const judge = new Judge(new SilentJudge());
    await expect(
      judge.match("X", [mkDecision("d1", "high")], [{ ref: "g1", file: "f", heading: "h", body: "b".repeat(100) }])
    ).rejects.toThrow(/without calling/);
  });
});

describe("Miss diagnostics (mechanical)", () => {
  it("detects evidence availability and whether relevant items were read", async () => {
    const cache = new CacheStore(tmp, "o/r");
    cache.mergeIssues([{
      number: 5, title: "Dropdown keyboard navigation behavior", state: "closed", author: "a",
      body: "long discussion about arrow key behavior in dropdown menus", url: "https://github.com/o/r/issues/5",
      createdAt: "2023-01-01", closedAt: null, labels: [], comments: [],
    }]);
    const evidence = new CachedEvidenceRepository(cache, "o/r");
    const events: RunEvent[] = [
      { t: "tool_call", seq: 1, name: "read_issue", input: { number: 5 }, ts: "t" },
    ];
    const diags = await computeMissDiagnostics({
      missedUnits: [
        { ref: "g1", file: "f", heading: "Dropdown keyboard navigation", body: "..." },
        { ref: "g2", file: "f", heading: "Zebra striping palette tokens", body: "..." },
      ],
      events, evidence, toolBudget: 25,
    });
    expect(diags[0]).toMatchObject({ evidenceExistsInCache: true, relevantItemsRead: true, budgetExhausted: false });
    expect(diags[1]).toMatchObject({ evidenceExistsInCache: false, relevantItemsRead: false });
  });
});

describe("Report rendering", () => {
  it("renders aggregate, calibration, misses and comparison without crashing", () => {
    const extracted = [mkDecision("d1", "high")];
    const comp: ComponentEvaluation = {
      component: "X", promptVersion: "v2", model: "m", runId: "r1",
      metrics: computeMetrics(extracted, ["g1"], {
        matches: [{ extractedId: "d1", groundTruthRef: "g1", overlap: "full", rationale: "matches the documented API decision" }],
        decisionSupport: [{ extractedId: "d1", grade: "supported", fabricatedClaims: [] }],
        fieldSupport: [{ extractedId: "d1", hypothesis: true, context: true, chosenSolution: true, alternatives: false }],
      }),
      verdict: {
        matches: [{ extractedId: "d1", groundTruthRef: "g1", overlap: "full", rationale: "matches the documented API decision" }],
        decisionSupport: [{ extractedId: "d1", grade: "supported", fabricatedClaims: [] }],
        fieldSupport: [{ extractedId: "d1", hypothesis: true, context: true, chosenSolution: true, alternatives: false }],
      },
      missAnalysis: { misses: [{ groundTruthRef: "g2", category: "missing_evidence", note: "no cached artifacts discuss this" }] },
      extracted, groundTruth: [], stats: { toolCalls: 10, costUsd: 0.12, durationMs: 60000 },
    };
    const md = renderMarkdown(
      { repo: "o/r", promptVersion: "v2", generatedAt: "now", components: [comp], aggregate: aggregateMetrics([comp]) },
      [{ version: "v1", aggregate: aggregateMetrics([comp]) }]
    );
    expect(md).toContain("## Headline metrics");
    expect(md).toContain("Prompt version comparison");
    expect(md).toContain("missing_evidence");
    expect(md).toContain("100.0%"); // precision
  });
});
