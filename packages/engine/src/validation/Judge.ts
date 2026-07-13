/**
 * validation/Judge.ts — Claude-as-judge over the SAME agent runtime.
 *
 * DECISIONS:
 *  - The judge is one more toolset on ToolRuntime + AgentLoop: the verdict
 *    arrives via a schema-gated tool call (record_verdict), so malformed
 *    verdicts bounce back for self-correction exactly like emit_decision.
 *    No JSON-parsing-from-prose, no regex heroics.
 *  - Judge prompts are UNVERSIONED (prompts/ root): the measuring stick must
 *    not move while extraction prompts (the experimental variable) change.
 *  - The judge sees the extracted decisions' own evidence excerpts, NOT the
 *    evidence cache. It scores the written artifact, mirroring how a human
 *    reviewer would audit a decision doc's citations.
 *  - Heuristic pre-analysis (was evidence available? was it read? was budget
 *    exhausted? were emissions rejected?) is computed MECHANICALLY from the
 *    run log and cache, then handed to the judge as diagnostics. The LLM
 *    only does what the heuristics can't: semantic categorization.
 */

import { ConfigError } from "@dg/domain/errors.js";
import type { DecisionObject, RunEvent } from "@dg/domain/types.js";
import type { EvidenceRepository } from "../evidence/EvidenceRepository.js";
import type { LlmClient } from "../llm/LlmClient.js";
import { AgentLoop } from "../agent/AgentLoop.js";
import { ToolRuntime } from "../agent/ToolRuntime.js";
import { loadPrompt } from "../agent/prompts.js";
import type { GroundTruthUnit } from "./GroundTruth.js";
import {
  MatchVerdictSchema, MissVerdictSchema,
  type MatchVerdict, type MissVerdict,
} from "./verdicts.js";

const GT_BODY_CAP = 2500;
const EXCERPT_CAP = 400;

function compactDecision(d: DecisionObject): unknown {
  return {
    id: d.id, title: d.title, status: d.status, confidence: d.confidence,
    hypothesis: d.hypothesis, context: d.context, chosenSolution: d.chosenSolution,
    alternatives: d.alternatives.map((a) => ({ option: a.option, reasonRejected: a.reasonRejected })),
    tradeOffs: d.tradeOffs,
    evidence: d.evidence.map((e) => ({ id: e.id, kind: e.kind, title: e.title, excerpt: e.excerpt.slice(0, EXCERPT_CAP) })),
  };
}

export interface MissDiagnostics {
  groundTruthRef: string;
  heading: string;
  evidenceExistsInCache: boolean;
  relevantItemsRead: boolean;
  budgetExhausted: boolean;
  hadRejectedEmissions: boolean;
}

export class Judge {
  constructor(private readonly llm: LlmClient) {}

  private async runToVerdict<T>(
    system: string,
    payload: unknown,
    toolName: string,
    schema: { safeParse: (x: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: (string | number)[]; message: string }> } } }
  ): Promise<T> {
    let verdict: T | undefined;
    const runtime = new ToolRuntime();
    runtime.register({
      name: toolName,
      description: `Record your complete verdict. Call exactly once.`,
      inputSchema: schema as never,
      handler: async (input) => {
        verdict = input as T;
        return "verdict recorded";
      },
    });

    const loop = new AgentLoop(this.llm, runtime, (_e: RunEvent) => {});
    await loop.run(system, JSON.stringify(payload, null, 1), {
      toolBudget: 3, maxTurns: 4, maxTokens: 8192, temperature: 0, budgetExemptTools: [],
    });

    if (!verdict) throw new ConfigError(`Judge finished without calling ${toolName}`);
    return verdict;
  }

  async match(component: string, extracted: DecisionObject[], groundTruth: GroundTruthUnit[]): Promise<MatchVerdict> {
    if (extracted.length === 0 && groundTruth.length === 0) {
      return { matches: [], decisionSupport: [], fieldSupport: [] };
    }
    return this.runToVerdict(
      loadPrompt("judge_match", {}),
      {
        component,
        extractedDecisions: extracted.map(compactDecision),
        groundTruthUnits: groundTruth.map((u) => ({ ref: u.ref, heading: u.heading, body: u.body.slice(0, GT_BODY_CAP) })),
      },
      "record_verdict",
      MatchVerdictSchema
    );
  }

  async analyzeMisses(component: string, diagnostics: MissDiagnostics[], groundTruth: GroundTruthUnit[]): Promise<MissVerdict> {
    if (diagnostics.length === 0) return { misses: [] };
    const byRef = new Map(groundTruth.map((u) => [u.ref, u]));
    return this.runToVerdict(
      loadPrompt("judge_miss", {}),
      {
        component,
        misses: diagnostics.map((d) => ({
          ...d,
          body: byRef.get(d.groundTruthRef)?.body.slice(0, GT_BODY_CAP) ?? "",
        })),
      },
      "record_miss_analysis",
      MissVerdictSchema
    );
  }
}

/**
 * Mechanical diagnostics for missed ground-truth units — everything the run
 * log and cache can answer without an LLM.
 */
export async function computeMissDiagnostics(opts: {
  missedUnits: GroundTruthUnit[];
  events: RunEvent[];
  evidence: EvidenceRepository;
  toolBudget: number;
}): Promise<MissDiagnostics[]> {
  const { missedUnits, events, evidence, toolBudget } = opts;

  const readItems = new Set<string>();
  let toolCalls = 0;
  let rejections = 0;
  for (const e of events) {
    if (e.t === "tool_call") {
      toolCalls++;
      const input = e.input as { number?: number };
      if ((e.name === "read_pr" || e.name === "read_issue") && input?.number) {
        readItems.add(`${e.name === "read_pr" ? "pr" : "issue"}-${input.number}`);
      }
    }
    if (e.t === "decision_rejected") rejections++;
  }

  const out: MissDiagnostics[] = [];
  for (const unit of missedUnits) {
    // Keyword probe: does the cache contain anything discussing this unit?
    const query = unit.heading.split(/\s+/).slice(0, 5).join(" ");
    const hits = await evidence.search({ query, type: "any", limit: 5 });
    out.push({
      groundTruthRef: unit.ref,
      heading: unit.heading,
      evidenceExistsInCache: hits.length > 0,
      relevantItemsRead: hits.some((h) => readItems.has(h.id)),
      budgetExhausted: toolCalls >= toolBudget,
      hadRejectedEmissions: rejections > 0,
    });
  }
  return out;
}
