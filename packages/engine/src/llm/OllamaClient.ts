import { LlmError } from "@dg/domain/errors.js";
import type {
  LlmClient,
  LlmCompleteOptions,
  LlmContentBlock,
  LlmMessage,
  LlmRequest,
  LlmResponse,
  LlmUsage,
} from "./LlmClient.js";

/* --------------------------- OpenAI-compatible types --------------------------- */

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

/* --------------------------- message conversion --------------------------- */

function toOpenAI(messages: LlmMessage[], system: string): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  if (system) out.push({ role: "system", content: system });

  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }

    const toolResults: Array<{ id: string; content: string; isError: boolean }> = [];
    const toolUses: OpenAIToolCall[] = [];
    const textParts: string[] = [];

    for (const block of m.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      } else if (block.type === "tool_use") {
        toolUses.push({
          id: block.id,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        });
      } else if (block.type === "tool_result") {
        toolResults.push({ id: block.toolUseId, content: block.content, isError: block.isError });
      }
    }

    // Tool results become individual role: "tool" messages (OpenAI requirement).
    for (const tr of toolResults) {
      out.push({ role: "tool", tool_call_id: tr.id, content: tr.content });
    }

    // Assistant messages carry tool_calls alongside text.
    if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: textParts.length > 0 ? textParts.join("\n") : null,
        ...(toolUses.length > 0 ? { tool_calls: toolUses } : {}),
      });
    } else if (m.role === "user" && textParts.length > 0) {
      out.push({ role: "user", content: textParts.join("\n") });
    }
  }
  return out;
}

function fromOAIResponse(data: OpenAIChatResponse): LlmResponse {
  const choice = data.choices[0];
  if (!choice) throw new LlmError("Ollama returned empty choices");

  const blocks: LlmContentBlock[] = [];
  if (choice.message.content) blocks.push({ type: "text", text: choice.message.content });
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: unknown;
      try { input = JSON.parse(tc.function.arguments); } catch { input = tc.function.arguments; }
      blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
    }
  }

  const stopReason =
    choice.finish_reason === "tool_calls" ? "tool_use"
    : choice.finish_reason === "stop" ? "end_turn"
    : choice.finish_reason === "length" ? "max_tokens"
    : "other";

  const usage: LlmUsage = {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };

  return { stopReason, blocks, usage };
}

/* -------------------------------- client -------------------------------- */

export class OllamaClient implements LlmClient {
  readonly model: string;
  private readonly baseUrl: string;

  constructor(baseUrl: string, readonly configuredModel: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = configuredModel;
  }

  async complete(req: LlmRequest, opts?: LlmCompleteOptions): Promise<LlmResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const hasTools = req.tools.length > 0;
    const body: Record<string, unknown> = {
      model: this.model,
      messages: toOpenAI(req.messages, req.system),
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: false,
    };
    if (hasTools) {
      body.tools = req.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputJsonSchema },
      }));
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: opts?.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "unknown error");
        throw new LlmError(`Ollama API error (${response.status}): ${text}`);
      }

      const data = (await response.json()) as OpenAIChatResponse;
      return fromOAIResponse(data);
    } catch (e) {
      if ((e as Error).name === "AbortError" || opts?.signal?.aborted) throw e;
      throw new LlmError(`Ollama request failed: ${(e as Error).message}`);
    }
  }
}
