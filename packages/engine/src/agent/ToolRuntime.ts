/**
 * agent/ToolRuntime.ts — dynamic tool registry + validated execution layer.
 *
 * ARCHITECTURAL DECISIONS:
 *  - Tools are registered at composition time, not hardcoded in the loop.
 *    The loop doesn't know what tools exist; extraction, linking and future
 *    query agents assemble different toolsets over the SAME runtime. This is
 *    also the MCP integration seam: an MCP client can be wrapped into
 *    ToolSpecs and registered here with zero runtime changes.
 *  - EVERY tool input is Zod-parsed before the handler runs, and validation
 *    failure is returned to the model as a recoverable tool error — the model
 *    self-corrects instead of the run crashing. Same for handler errors that
 *    carry recoverable=true (guard hits, cache misses, evidence-gate
 *    rejections). Non-recoverable errors propagate and kill the run: they
 *    indicate bugs, not model mistakes.
 *  - Zod schemas double as the wire contract: definitions() derives JSON
 *    Schema via zod-to-json-schema, so the contract Claude sees and the gate
 *    we enforce are the same object (see domain/schemas.ts rationale).
 */

import type { ZodType } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { DecisionGraphError } from "@dg/domain/errors.js";
import type { ToolDefinition } from "../llm/LlmClient.js";

export interface ToolOutcome {
  /** Serialized result (or error explanation) returned to the model. */
  content: string;
  isError: boolean;
}

export interface ToolSpec<I = unknown> {
  name: string;
  description: string;
  inputSchema: ZodType<I>;
  handler: (input: I) => Promise<string>;
}

export class ToolRuntime {
  private readonly tools = new Map<string, ToolSpec<never>>();

  register<I>(spec: ToolSpec<I>): void {
    if (this.tools.has(spec.name)) {
      throw new Error(`Tool already registered: ${spec.name}`);
    }
    this.tools.set(spec.name, spec as unknown as ToolSpec<never>);
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputJsonSchema: zodToJsonSchema(t.inputSchema, { $refStrategy: "none" }) as Record<string, unknown>,
    }));
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, rawInput: unknown): Promise<ToolOutcome> {
    const spec = this.tools.get(name);
    if (!spec) {
      // Model invented a tool — recoverable; tell it what actually exists.
      return {
        content: `Unknown tool "${name}". Available tools: ${[...this.tools.keys()].join(", ")}`,
        isError: true,
      };
    }

    const parsed = spec.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
      return {
        content: `Invalid input for ${name}:\n- ${issues.join("\n- ")}\nFix the parameters and retry.`,
        isError: true,
      };
    }

    try {
      return { content: await spec.handler(parsed.data as never), isError: false };
    } catch (e) {
      if (e instanceof DecisionGraphError && e.recoverable) {
        return { content: `${e.code}: ${e.message}`, isError: true };
      }
      throw e; // fatal — bug or infrastructure failure; the loop aborts the run
    }
  }
}
