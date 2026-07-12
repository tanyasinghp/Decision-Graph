/**
 * agent/ExtractionAgent.ts — composes the generic runtime into the
 * decision-extraction use case. This class is small BECAUSE the architecture
 * is right: loop, tools, prompts, verification and logging are all reusable
 * parts; this file only wires them for one purpose.
 */

import type { DecisionObject, ExtractionResult, RunEvent } from "../domain/types.js";
import type { EvidenceRepository } from "../evidence/EvidenceRepository.js";
import type { LlmClient } from "../llm/LlmClient.js";
import { AgentLoop } from "./AgentLoop.js";
import { EvidenceVerifier } from "./EvidenceVerifier.js";
import { registerExtractionTools } from "./extractionTools.js";
import { loadPrompt } from "./prompts.js";
import { RunLog, now } from "./RunLog.js";
import { ToolRuntime } from "./ToolRuntime.js";

export interface ExtractionAgentConfig {
  repo: string;
  runsDir: string;
  /** Extraction prompt version (prompts/versions/<v>/) — the experimental variable. */
  promptVersion: string;
  toolBudget: number;   // evidence tools only; emit_decision is exempt
  maxTurns: number;     // hard runaway brake
  maxTokens: number;
  /** Sonnet-class pricing per MTok for cost reporting; adjust per model. */
  pricing: { inputPerMTok: number; outputPerMTok: number };
}

export class ExtractionAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly evidence: EvidenceRepository,
    private readonly config: ExtractionAgentConfig
  ) {}

  async run(component: string, opts?: { signal?: AbortSignal; onEvent?: (e: RunEvent) => void }): Promise<ExtractionResult> {
    // Run ids are timestamped for uniqueness but human-sortable for debugging.
    const runId = `${component.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const log = new RunLog(this.config.runsDir, runId);
    if (opts?.onEvent) log.pipe(opts.onEvent);

    const decisions: DecisionObject[] = [];
    let guardHits = 0;
    log.pipe((e) => {
      if (e.t === "guard_hit") guardHits++;
      if (e.t === "tool_result" && e.isError && e.summary.startsWith("FORBIDDEN_PATH")) guardHits++;
    });

    const runtime = new ToolRuntime();
    let toolCallCount = 0;
    registerExtractionTools({
      runtime,
      evidence: this.evidence,
      verifier: new EvidenceVerifier(this.evidence),
      emitCtx: {
        runId,
        model: this.llm.model,
        component,
        getToolCallCount: () => toolCallCount,
      },
      onDecision: (d) => decisions.push(d),
      emitEvent: (e) => log.emit(e),
    });

    log.emit({ t: "run_started", runId, component, model: this.llm.model, ts: now() });
    log.pipe((e) => {
      if (e.t === "tool_call") toolCallCount++;
    });

    const started = Date.now();
    const loop = new AgentLoop(this.llm, runtime, (e) => log.emit(e));

    let status: ExtractionResult["status"] = "failed";
    let loopStats = { toolCalls: 0, turns: 0, inputTokens: 0, outputTokens: 0 };
    try {
      const res = await loop.run(
        loadPrompt("system", { repo: this.config.repo }, { version: this.config.promptVersion }),
        loadPrompt("decision_extraction", { repo: this.config.repo, component }, { version: this.config.promptVersion }),
        {
          toolBudget: this.config.toolBudget,
          maxTurns: this.config.maxTurns,
          maxTokens: this.config.maxTokens,
          temperature: 0, // determinism > creativity for archaeology
          budgetExemptTools: ["emit_decision"],
        },
        opts?.signal
      );
      status = res.status === "cancelled" ? "failed" : res.status;
      loopStats = res;
    } finally {
      const costUsd =
        (loopStats.inputTokens / 1e6) * this.config.pricing.inputPerMTok +
        (loopStats.outputTokens / 1e6) * this.config.pricing.outputPerMTok;
      log.emit({
        t: "run_finished",
        status,
        stats: { ...loopStats, decisions: decisions.length, guardHits, costUsd, durationMs: Date.now() - started },
        ts: now(),
      });
    }

    return {
      runId,
      component,
      decisions,
      status,
      stats: {
        toolCalls: loopStats.toolCalls,
        guardHits,
        inputTokens: loopStats.inputTokens,
        outputTokens: loopStats.outputTokens,
        costUsd:
          (loopStats.inputTokens / 1e6) * this.config.pricing.inputPerMTok +
          (loopStats.outputTokens / 1e6) * this.config.pricing.outputPerMTok,
        durationMs: Date.now() - started,
      },
    };
  }
}
