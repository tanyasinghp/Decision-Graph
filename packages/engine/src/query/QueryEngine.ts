/**
 * query/QueryEngine.ts — the interactive reasoning engine.
 *
 * Flow (every stage explicit, every stage in the trace):
 *   question → planTraversal (deterministic) → buildReasoningContext
 *   (deterministic) → ONE reasoning call (Claude, answer via schema-gated
 *   tool) → mechanical certainty cap → trace.
 *
 * ARCHITECTURAL DECISIONS:
 *  - The QueryAgent has NO evidence tools. Its entire world is the context
 *    string. "Never searches GitHub at query time" isn't a promise — there
 *    is no code path. Everything before the reasoning call is deterministic;
 *    the LLM is confined to the one step that needs language.
 *  - CITATION GATE: record_answer rejects any supportingDecisionId not in
 *    the supplied context (recoverable → the model corrects itself). An
 *    answer literally cannot cite what it wasn't shown.
 *  - CERTAINTY CAP: see certainty.ts — proposed certainty is floored by the
 *    weakest cited decision's extraction confidence; downgrades recorded.
 *  - Model-independent: takes LlmClient; the whole engine runs under the
 *    scripted FakeLlmClient in tests.
 */

import { z } from "zod";
import { ConfigError } from "@dg/domain/errors.js";
import { decisionData } from "@dg/domain/graph.js";
import type { Confidence } from "@dg/domain/types.js";
import type { GraphStore } from "../graph/GraphStore.js";
import { ContextBuilder, type BuiltContext } from "../graph/ContextBuilder.js";
import type { LlmClient } from "../llm/LlmClient.js";
import { AgentLoop } from "../agent/AgentLoop.js";
import { ToolRuntime } from "../agent/ToolRuntime.js";
import { loadPrompt } from "../agent/prompts.js";
import { planTraversal, type TraversalPlan } from "./QueryPlanner.js";
import { CertaintySchema, capCertainty, type Certainty } from "./certainty.js";

export const AnswerSchema = z
  .object({
    answer: z.string().min(20),
    certainty: CertaintySchema,
    supportingDecisionIds: z.array(z.string()),
    supportingEvidenceUrls: z.array(z.string().url()),
    /** Required when certainty is "unknown": what evidence would be needed. */
    missingEvidence: z.string().nullable(),
    reasoningSummary: z.string().min(20),
  })
  .refine((a) => a.certainty !== "unknown" || (a.missingEvidence?.length ?? 0) > 0, {
    message: "certainty 'unknown' requires missingEvidence to state what is missing",
  });
export type Answer = z.infer<typeof AnswerSchema>;

export interface ReasoningTrace {
  question: string;
  intent: TraversalPlan["intent"];
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
  context: BuiltContext;
  plan: TraversalPlan;
}

export class QueryEngine {
  private readonly contextBuilder: ContextBuilder;

  constructor(
    private readonly llm: LlmClient,
    private readonly store: GraphStore,
    private readonly repo: string
  ) {
    this.contextBuilder = new ContextBuilder(store);
  }

  planTraversal(question: string): TraversalPlan {
    return planTraversal(question);
  }

  buildReasoningContext(question: string, plan?: TraversalPlan): BuiltContext {
    const p = plan ?? this.planTraversal(question);
    return this.contextBuilder.build(question, { tiers: p.tiers, nodeBudget: p.nodeBudget });
  }

  async answerQuestion(question: string): Promise<AnsweredQuestion> {
    const plan = this.planTraversal(question);
    const context = this.buildReasoningContext(question, plan);
    const inContext = new Set(context.includedNodeIds);
    const rejectedCitations: string[] = [];

    let recorded: Answer | undefined;
    let proposed: Certainty = "unknown";

    const runtime = new ToolRuntime();
    runtime.register({
      name: "record_answer",
      description: "Record your complete, cited answer. Call exactly once.",
      inputSchema: AnswerSchema,
      handler: async (a) => {
        // CITATION GATE: only decisions that were actually in context.
        const bad = a.supportingDecisionIds.filter((id) => !inContext.has(id));
        if (bad.length > 0) {
          rejectedCitations.push(...bad);
          return `REJECTED: these decision ids are not in the provided context: ${bad.join(", ")}. Cite only decisions shown to you (their ids appear as [id] in the headings).`;
        }
        proposed = a.certainty;
        // CERTAINTY CAP: floor of cited decisions' extraction confidence.
        const confidences: Confidence[] = a.supportingDecisionIds
          .map((id) => this.store.getNode(id))
          .filter((n) => n?.type === "decision")
          .map((n) => decisionData(n!).confidence);
        const cap = capCertainty(a.certainty, confidences);
        recorded = { ...a, certainty: cap.final };
        return cap.downgraded
          ? `recorded (note: certainty lowered ${a.certainty}→${cap.final}: the weakest cited decision is ${cap.ceiling}-ceiling)`
          : "recorded";
      },
    });

    const system = loadPrompt("query", {
      repo: this.repo,
      intent: plan.intent,
      emphasis: plan.emphasis,
      context: context.text,
    });

    const loop = new AgentLoop(this.llm, runtime, () => {});
    await loop.run(system, question, {
      toolBudget: 0,                       // there are no evidence tools to budget
      maxTurns: 4,                         // answer + at most a few corrections
      maxTokens: 4096,
      temperature: 0,
      budgetExemptTools: ["record_answer"],
    });

    if (!recorded) throw new ConfigError("Query agent finished without recording an answer");

    const confidences: Confidence[] = recorded.supportingDecisionIds
      .map((id) => this.store.getNode(id))
      .filter((n) => n?.type === "decision")
      .map((n) => decisionData(n!).confidence);

    return {
      answer: recorded,
      plan,
      context,
      trace: {
        question,
        intent: plan.intent,
        matchedRule: plan.matchedRule,
        seedIds: context.seedIds,
        visitedNodeIds: context.includedNodeIds,
        contextTokens: context.approxTokens,
        proposedCertainty: proposed,
        certaintyCeiling: capCertainty(proposed, confidences).ceiling,
        certaintyDowngraded: recorded.certainty !== proposed,
        rejectedCitations,
      },
    };
  }

  /** Render the inspectable reasoning chain (the future UI's trace panel). */
  traceReasoning(result: AnsweredQuestion): string {
    const t = result.trace;
    const a = result.answer;
    return [
      `Question: ${t.question}`,
      `↓ intent: ${t.intent} (rule: ${t.matchedRule})`,
      `↓ traversal: seeds [${t.seedIds.join(", ")}] → ${t.visitedNodeIds.length} nodes (${t.contextTokens} tokens of context)`,
      `↓ visited: ${t.visitedNodeIds.join(", ")}`,
      `↓ supporting decisions: ${a.supportingDecisionIds.join(", ") || "(none)"}`,
      `↓ supporting evidence: ${a.supportingEvidenceUrls.join(" ") || "(none)"}`,
      `↓ reasoning: ${a.reasoningSummary}`,
      `↓ certainty: ${a.certainty}` +
        (t.certaintyDowngraded ? ` (model proposed ${t.proposedCertainty}; capped at ceiling ${t.certaintyCeiling})` : ""),
      ...(t.rejectedCitations.length > 0 ? [`↓ rejected citations: ${t.rejectedCitations.join(", ")}`] : []),
      ...(a.missingEvidence ? [`↓ missing evidence: ${a.missingEvidence}`] : []),
      `Answer: ${a.answer}`,
    ].join("\n");
  }
}
