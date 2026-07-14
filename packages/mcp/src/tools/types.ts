/**
 * Tool contracts. Every tool is a pure async handler that receives the platform
 * context, the parsed args, a per-request AbortSignal, and a ProgressEmitter —
 * and returns a structured result (or a mapped ToolError). No transport here;
 * the future SDK server supplies signal + emitter, tests supply fakes.
 */

import type { McpContext } from "../context.js";
import type { ProgressEmitter } from "../progress.js";
import type { ToolError } from "../errors.js";

export interface ToolInvocation<Args> {
  ctx: McpContext;
  args: Args;
  signal: AbortSignal;
  emitter: ProgressEmitter;
}

export interface ToolOk {
  isError: false;
  /** The engine's structured result, returned unchanged. */
  structured: unknown;
}

export type ToolResult = ToolOk | ToolError;

export type ToolHandler<Args> = (inv: ToolInvocation<Args>) => Promise<ToolResult>;

export interface ToolDefinition {
  name: string;
  description: string;
}
