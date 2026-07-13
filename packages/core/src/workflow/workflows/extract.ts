/**
 * extract workflow — component(s) → decisions.
 *
 * One step per component, each wrapping `ExtractionAgent.run`. The agent's
 * live RunEvents are nested into the workflow stream via `ctx.runEvent`, and
 * cancellation is threaded through the agent's AbortSignal.
 */

import { ExtractionAgent } from "@dg/engine/agent/ExtractionAgent.js";
import type { DecisionObject, RunStats } from "@dg/domain/types.js";
import type { Step } from "../Step.js";
import type { Workflow } from "../Workflow.js";

export interface ExtractInput {
  components: string[];
}
export interface ComponentExtraction {
  component: string;
  decisions: DecisionObject[];
  stats: RunStats;
  status: "completed" | "truncated" | "failed";
}
export interface ExtractOutput {
  components: ComponentExtraction[];
}

function makeExtractStep(component: string): Step<void, ComponentExtraction> {
  return {
    id: `extract:${component.toLowerCase()}`,
    title: `Extract decisions — ${component}`,
    idempotent: true,
    async run(_input, ctx) {
      const ws = ctx.workspace;
      const cfg = ws.config;
      const agent = new ExtractionAgent(ws.llm(cfg.model), ws.stores().evidence(), {
        repo: cfg.repo,
        promptVersion: cfg.promptVersion,
        runsDir: ws.runsDir(),
        toolBudget: cfg.toolBudget,
        maxTurns: 60,
        maxTokens: 8192,
        pricing: { inputPerMTok: 3, outputPerMTok: 15 },
      });
      const result = await agent.run(component, {
        signal: ctx.signal,
        onEvent: (e) => ctx.runEvent(e),
      });
      ws.stores().decisions().save(component, cfg.promptVersion, result.decisions);
      return {
        component,
        decisions: result.decisions,
        stats: result.stats,
        status: result.status,
      };
    },
  };
}

export const extractWorkflow: Workflow<ExtractInput, ExtractOutput> = {
  name: "extract",
  // Representative template step (real steps are created per component at run time).
  steps: [makeExtractStep("<component>")],
  async execute(input, ctx) {
    const components: ComponentExtraction[] = [];
    for (const c of input.components) {
      components.push(await ctx.runStep(makeExtractStep(c), undefined));
    }
    return { components };
  },
};
