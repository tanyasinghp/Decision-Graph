/**
 * Errors — map the engine's structured WorkflowResult status/error onto an
 * MCP tool-error shape. The engine never throws on failure (it resolves as
 * `failed`/`truncated`), so tool handlers translate rather than catch. This
 * mirrors the CLI's status → exit-code mapping, targeting MCP instead.
 *
 * Phase 3.1 keeps this SDK-agnostic; Phase 3.2 wraps `ToolError` into an MCP
 * CallToolResult with `isError: true`.
 */

/** The status shape every engine result exposes. */
export interface ResultLike {
  status: string;
  error?: { message: string };
  runId?: string;
}

export interface ToolError {
  isError: true;
  status: string;
  message: string;
  /** Cancelled runs are checkpointed and can be resumed. */
  resumable: boolean;
  runId?: string;
}

export function isFailure(status: string): boolean {
  return status !== "completed";
}

export function toToolError(tool: string, r: ResultLike): ToolError {
  return {
    isError: true,
    status: r.status,
    message: r.error?.message ?? `${tool}: ${r.status}`,
    resumable: r.status === "truncated",
    ...(r.runId ? { runId: r.runId } : {}),
  };
}
