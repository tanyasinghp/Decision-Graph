/**
 * llm/AnthropicClient.ts — the Anthropic adapter (the only file importing the SDK).
 *
 * DECISIONS:
 *  - Retries/backoff for 429/5xx are delegated to the SDK (maxRetries: 4).
 *    Reimplementing backoff here would be redundant and easier to get wrong.
 *  - Streaming: when onTextDelta is provided we use messages.stream() and
 *    forward text deltas, then return the SAME final-response shape as the
 *    non-streaming path. Callers cannot tell the difference — streaming is a
 *    transport optimization, not a semantic one.
 *  - Model-specific bits live here and ONLY here: block shape mapping,
 *    stop-reason mapping, tool schema field names (input_schema).
 */

import Anthropic from "@anthropic-ai/sdk";
import { LlmError } from "@dg/domain/errors.js";
import type {
  LlmClient,
  LlmCompleteOptions,
  LlmContentBlock,
  LlmMessage,
  LlmRequest,
  LlmResponse,
} from "./LlmClient.js";

function toSdkMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    const blocks: Anthropic.ContentBlockParam[] = m.content.map((b) => {
      if (b.type === "text") return { type: "text", text: b.text };
      if (b.type === "tool_use")
        return { type: "tool_use", id: b.id, name: b.name, input: b.input as Record<string, unknown> };
      return {
        type: "tool_result",
        tool_use_id: b.toolUseId,
        content: b.content,
        is_error: b.isError,
      };
    });
    return { role: m.role, content: blocks };
  });
}

function fromSdkResponse(msg: Anthropic.Message): LlmResponse {
  const blocks: LlmContentBlock[] = [];
  for (const b of msg.content) {
    if (b.type === "text") blocks.push({ type: "text", text: b.text });
    else if (b.type === "tool_use") blocks.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
    // thinking/other block types are ignored by the runtime on purpose
  }
  const stop =
    msg.stop_reason === "tool_use" ? "tool_use"
    : msg.stop_reason === "end_turn" ? "end_turn"
    : msg.stop_reason === "max_tokens" ? "max_tokens"
    : "other";
  return {
    stopReason: stop,
    blocks,
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
  };
}

export class AnthropicClient implements LlmClient {
  private readonly sdk: Anthropic;

  constructor(apiKey: string, readonly model: string) {
    this.sdk = new Anthropic({ apiKey, maxRetries: 4 });
  }

  async complete(req: LlmRequest, opts?: LlmCompleteOptions): Promise<LlmResponse> {
    const params: Anthropic.MessageCreateParams = {
      model: this.model,
      system: req.system,
      messages: toSdkMessages(req.messages),
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputJsonSchema as Anthropic.Tool.InputSchema,
      })),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
    };

    try {
      if (opts?.onTextDelta) {
        const stream = this.sdk.messages.stream(params, { signal: opts.signal });
        stream.on("text", (delta) => opts.onTextDelta?.(delta));
        return fromSdkResponse(await stream.finalMessage());
      }
      const msg = await this.sdk.messages.create(params, { signal: opts?.signal });
      return fromSdkResponse(msg as Anthropic.Message);
    } catch (e) {
      // AbortError propagates as-is so the loop can distinguish cancellation.
      if ((e as Error).name === "AbortError" || opts?.signal?.aborted) throw e;
      throw new LlmError(`Anthropic API failure after retries: ${(e as Error).message}`);
    }
  }
}
