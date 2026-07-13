/**
 * evaluate workflow — grade extracted decisions against ground truth.
 *
 * Steps wrap existing validation services: `GroundTruth` (load), `Judge.match`
 * (LLM grading), `computeMetrics` (pure). Cross-version report aggregation
 * remains a caller/CLI concern; this workflow produces one component's verdict.
 */

import * as path from "node:path";
import { GroundTruth, type GroundTruthUnit } from "@dg/engine/validation/GroundTruth.js";
import { Judge } from "@dg/engine/validation/Judge.js";
import { computeMetrics, type Metrics } from "@dg/engine/validation/metrics.js";
import type { MatchVerdict } from "@dg/engine/validation/verdicts.js";
import type { DecisionObject } from "@dg/domain/types.js";
import type { Step } from "../Step.js";
import type { Workflow } from "../Workflow.js";

export interface EvaluateInput {
  component: string;
}
export interface EvaluateOutput {
  component: string;
  metrics: Metrics;
  verdict: MatchVerdict;
  groundTruthCount: number;
  extractedCount: number;
}

interface EvalInputs {
  component: string;
  decisions: DecisionObject[];
  groundTruth: GroundTruthUnit[];
}

const loadStep: Step<string, EvalInputs> = {
  id: "eval.load",
  title: "Load decisions + ground truth",
  idempotent: true,
  async run(component, ctx) {
    const ws = ctx.workspace;
    const decisions = ws.stores().decisions().loadComponent(component, ws.config.promptVersion);
    const groundTruth = new GroundTruth(path.join(ws.dataDir(), "ground-truth"), ws.config.repo).forComponent(
      component
    );
    return { component, decisions, groundTruth };
  },
};

const judgeStep: Step<EvalInputs, { inputs: EvalInputs; verdict: MatchVerdict }> = {
  id: "eval.judge",
  title: "Judge matches against ground truth",
  idempotent: false,
  async run(inputs, ctx) {
    const verdict = await new Judge(ctx.workspace.llm()).match(
      inputs.component,
      inputs.decisions,
      inputs.groundTruth
    );
    return { inputs, verdict };
  },
};

const metricsStep: Step<{ inputs: EvalInputs; verdict: MatchVerdict }, EvaluateOutput> = {
  id: "eval.metrics",
  title: "Compute precision / recall / F1",
  idempotent: true,
  async run({ inputs, verdict }) {
    const metrics = computeMetrics(
      inputs.decisions,
      inputs.groundTruth.map((u) => u.ref),
      verdict
    );
    return {
      component: inputs.component,
      metrics,
      verdict,
      groundTruthCount: inputs.groundTruth.length,
      extractedCount: inputs.decisions.length,
    };
  },
};

export const evaluateWorkflow: Workflow<EvaluateInput, EvaluateOutput> = {
  name: "evaluate",
  steps: [loadStep, judgeStep, metricsStep],
  async execute(input, ctx) {
    const inputs = await ctx.runStep(loadStep, input.component);
    const judged = await ctx.runStep(judgeStep, inputs);
    return ctx.runStep(metricsStep, judged);
  },
};
