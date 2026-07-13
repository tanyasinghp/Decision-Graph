/**
 * agent/LinkingAgent.ts — the second pass: cross-decision edges.
 *
 * Runs AFTER extraction because SUPERSEDES/INFORMS require visibility over
 * the FULL decision set (architecture decision C3). Claude sees compact
 * decision summaries and proposes edges via create_edge; the store's endpoint
 * rules + cycle detection are the gate — a proposed cycle comes back as a
 * recoverable tool error, and Claude reconsiders.
 */

import { CreateEdgeInputSchema } from "@dg/domain/schemas.js";
import { decisionData, type GraphNode } from "@dg/domain/graph.js";
import type { GraphStore } from "../graph/GraphStore.js";
import type { LlmClient } from "../llm/LlmClient.js";
import { AgentLoop } from "./AgentLoop.js";
import { ToolRuntime } from "./ToolRuntime.js";
import { loadPrompt } from "./prompts.js";

export interface LinkingResult {
  proposed: number;
  accepted: number;
  rejected: string[];
}

export class LinkingAgent {
  constructor(private readonly llm: LlmClient, private readonly store: GraphStore) {}

  async run(): Promise<LinkingResult> {
    const decisions = this.store.nodes({ type: "decision" });
    if (decisions.length < 2) return { proposed: 0, accepted: 0, rejected: [] };

    const result: LinkingResult = { proposed: 0, accepted: 0, rejected: [] };
    const runtime = new ToolRuntime();
    runtime.register({
      name: "create_edge",
      description: "Assert one SUPERSEDES or INFORMS relationship between two decision ids.",
      inputSchema: CreateEdgeInputSchema,
      handler: async (input) => {
        result.proposed++;
        // Store gate: endpoint rules + acyclicity throw GraphIntegrityError.
        // That error is NOT recoverable per domain, but for linking we want
        // Claude to self-correct — so translate to a tool-level message.
        try {
          this.store.addEdge({
            type: input.type,
            from: input.fromDecisionId,
            to: input.toDecisionId,
            confidence: "medium", // linking is inference over summaries, never "high"
            provenance: { source: "internal", origin: "linking" },
            rationale: input.rationale,
          });
        } catch (e) {
          result.rejected.push(`${input.type} ${input.fromDecisionId}->${input.toDecisionId}: ${(e as Error).message}`);
          return `REJECTED: ${(e as Error).message}. Reconsider or skip this edge.`;
        }
        result.accepted++;
        return "edge accepted";
      },
    });

    const compact = decisions.map((n: GraphNode) => {
      const d = decisionData(n);
      return {
        id: n.id, component: d.scope.component, title: d.title, status: d.status,
        decidedAt: d.decidedAt ?? null, context: d.context.slice(0, 300),
      };
    });

    const loop = new AgentLoop(this.llm, runtime, () => {});
    await loop.run(loadPrompt("linking", {}), JSON.stringify(compact, null, 1), {
      toolBudget: 0, maxTurns: 8, maxTokens: 4096, temperature: 0,
      budgetExemptTools: ["create_edge"], // linking has no evidence budget; edges are the output
    });
    return result;
  }
}
