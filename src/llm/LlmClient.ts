/**
 * llm/LlmClient.ts — the model port.
 *
 * ARCHITECTURAL DECISION: the agent runtime speaks THESE types, never SDK
 * types. Everything model-specific (Anthropic block shapes, retry semantics,
 * streaming protocol) is confined to adapter implementations. Consequences:
 *  - The loop, tool runtime, prompts and events are model-agnostic
 *    infrastructure; pointing the system at GPT/Gemini means writing one new
 *    ~100-line adapter, nothing else.
 *  - Tests drive the real loop with a scripted FakeLlmClient — the agent's
 *    control flow is testable without network or API keys.
 *
 * The interface is deliberately minimal (one method). Provider-side retries
 * and backoff are an adapter concern; the runtime treats a rejected promise
 * as a run-fatal LlmError.
 */

export type LlmContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

export type LlmToolResultBlock = {
  type: "tool_result";
  toolUseId: string;
  content: string;
  isError: boolean;
};

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | Array<LlmContentBlock | LlmToolResultBlock>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema derived from the tool's Zod schema — the single source of truth. */
  inputJsonSchema: Record<string, unknown>;
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
  /** 0 for extraction — determinism beats creativity here. */
  temperature: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResponse {
  stopReason: "tool_use" | "end_turn" | "max_tokens" | "other";
  blocks: LlmContentBlock[];
  usage: LlmUsage;
}

export interface LlmCompleteOptions {
  signal?: AbortSignal;
  /** Streaming hook: adapters that support it invoke this per text delta. */
  onTextDelta?: (text: string) => void;
}

export interface LlmClient {
  complete(req: LlmRequest, opts?: LlmCompleteOptions): Promise<LlmResponse>;
  readonly model: string;
}
