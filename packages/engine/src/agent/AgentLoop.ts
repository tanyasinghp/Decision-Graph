/**
 * agent/AgentLoop.ts — the generic iterative tool-use loop.
 *
 * ARCHITECTURAL DECISIONS:
 *  - This file knows NOTHING about GitHub, decisions, or Anthropic. It knows:
 *    a model port, a tool runtime, an event sink, and a budget. That's the
 *    entire orchestration surface — "the only orchestration performed by the
 *    runtime is executing requested tools." Traversal strategy lives in the
 *    model + prompts, where it belongs.
 *  - Budget semantics: the tool budget applies to EVIDENCE tools only.
 *    emit_decision (and any tool registered as exempt) never counts —
 *    otherwise a thorough investigation could exhaust its ability to write
 *    down what it found, which is the one failure mode we can't accept.
 *    On budget exhaustion, evidence tools start returning a recoverable
 *    "budget exhausted" error and one synthesis nudge is injected, telling
 *    the model to emit what it has and stop.
 *  - Termination is explicit and exhaustive: model stops calling tools
 *    (completed) | hard turn cap (truncated) | abort signal (cancelled) |
 *    fatal error (failed). No other exit paths exist.
 */

import type { LlmClient, LlmMessage, LlmToolResultBlock } from "../llm/LlmClient.js";
import type { RunEvent } from "@dg/domain/types.js";
import type { ToolRuntime } from "./ToolRuntime.js";
import { now } from "./RunLog.js";

export interface AgentLoopConfig {
  /** Max calls to non-exempt (evidence) tools. */
  toolBudget: number;
  /** Hard cap on model turns — the absolute runaway brake. */
  maxTurns: number;
  maxTokens: number;
  temperature: number;
  /** Tools that never consume budget (emit_decision, create_edge). */
  budgetExemptTools: string[];
}

export interface AgentLoopResult {
  status: "completed" | "truncated" | "cancelled";
  toolCalls: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
}

export class AgentLoop {
  constructor(
    private readonly llm: LlmClient,
    private readonly tools: ToolRuntime,
    private readonly emit: (e: RunEvent) => void
  ) {}

  async run(
    system: string,
    initialUserMessage: string,
    config: AgentLoopConfig,
    signal?: AbortSignal
  ): Promise<AgentLoopResult> {
    const messages: LlmMessage[] = [{ role: "user", content: initialUserMessage }];
    const defs = this.tools.definitions();

    let toolCalls = 0;
    let turns = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let seq = 0;
    let nudged = false;

    this.emit({ t: "phase", name: "planning", ts: now() });

    while (true) {
      if (signal?.aborted) return { status: "cancelled", toolCalls, turns, inputTokens, outputTokens };
      if (turns >= config.maxTurns) return { status: "truncated", toolCalls, turns, inputTokens, outputTokens };

      const resp = await this.llm.complete(
        { system, messages, tools: defs, maxTokens: config.maxTokens, temperature: config.temperature },
        { signal }
      );
      turns++;
      inputTokens += resp.usage.inputTokens;
      outputTokens += resp.usage.outputTokens;
      if (signal?.aborted) return { status: "cancelled", toolCalls, turns, inputTokens, outputTokens };

      // Surface the model's visible reasoning — nothing hidden.
      for (const b of resp.blocks) {
        if (b.type === "text" && b.text.trim()) {
          this.emit({ t: "assistant_text", text: b.text, ts: now() });
        }
      }

      const toolUses = resp.blocks.filter((b) => b.type === "tool_use");
      if (toolUses.length === 0) {
        return { status: "completed", toolCalls, turns, inputTokens, outputTokens };
      }

      // Echo the assistant turn, then answer every tool_use (required pairing).
      messages.push({ role: "assistant", content: resp.blocks });
      const results: LlmToolResultBlock[] = [];

      for (const tu of toolUses) {
        const exempt = config.budgetExemptTools.includes(tu.name);
        const budgetLeft = toolCalls < config.toolBudget;

        seq++;
        this.emit({ t: "tool_call", seq, name: tu.name, input: tu.input, ts: now() });

        let outcome;
        if (!exempt && !budgetLeft) {
          outcome = {
            content:
              "Evidence budget exhausted. Stop investigating. Synthesize your findings now: emit remaining well-evidenced decisions via emit_decision, then finish.",
            isError: true,
          };
        } else {
          if (!exempt) toolCalls++;
          outcome = await this.tools.execute(tu.name, tu.input);
        }

        this.emit({
          t: "tool_result",
          seq,
          summary: outcome.content.slice(0, 300),
          bytes: outcome.content.length,
          isError: outcome.isError,
          ts: now(),
        });
        results.push({ type: "tool_result", toolUseId: tu.id, content: outcome.content, isError: outcome.isError });
      }

      messages.push({ role: "user", content: results });

      // One-time synthesis nudge as budget crosses the line.
      if (!nudged && toolCalls >= config.toolBudget) {
        nudged = true;
        this.emit({ t: "phase", name: "synthesizing", ts: now() });
        messages.push({
          role: "user",
          content:
            "You have used your entire evidence budget. Do not call evidence tools again. Emit any remaining decisions that your collected evidence supports (emit_decision), then conclude.",
        });
      }
    }
  }
}
