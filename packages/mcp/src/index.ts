/**
 * @dg/mcp — the Decision Graph MCP server, a real MCP presentation layer over
 * DecisionGraphEngine (peer to @dg/cli).
 *
 * Depends only on @dg/core + composition-root wiring (@dg/workspace-local,
 * @dg/connectors) + @modelcontextprotocol/sdk. No engine internals.
 */

export { createServer, main } from "./server.js";
export type { DgMcpServer } from "./server.js";

export {
  buildMcpContext,
  defaultProvider,
  resolveWorkspace,
  MCP_VERSION,
  SERVER_NAME,
  WORKSPACE_DIR,
} from "./context.js";
export type { McpContext, BuildContextOptions } from "./context.js";

export { createProgressSink } from "./progress.js";
export type { ProgressEmitter } from "./progress.js";

export { toToolError, isFailure } from "./errors.js";
export type { ToolError, ResultLike } from "./errors.js";

export { toolHandlers, toolDefinitions } from "./tools.js";
export { resourceHandlers, resourceDefinitions } from "./resources.js";

// Resources (Phase 3.3)
export { resWorkspaceCurrent, URI_WORKSPACE } from "./resources/workspace.js";
export { resSync, URI_SYNC } from "./resources/sync.js";
export { resGraph, URI_GRAPH } from "./resources/graph.js";
export { resDecisions, URI_DECISIONS } from "./resources/decisions.js";
export { resRuns, URI_RUNS } from "./resources/runs.js";
export type { ResourceInvocation, ResourceResult, ResourceHandler, ResourceDefinition } from "./resources/types.js";

// Tools (Phase 3.2)
export { dgDoctor, type DoctorArgs } from "./tools/doctor.js";
export { dgIngest, type IngestArgs } from "./tools/ingest.js";
export { dgExtract, type ExtractArgs } from "./tools/extract.js";
export { dgGraph, type GraphArgs } from "./tools/graph.js";
export { dgLink, type LinkArgs } from "./tools/link.js";
export { dgAnalyze, type AnalyzeArgs } from "./tools/analyze.js";
export { dgEvaluate, type EvaluateArgs } from "./tools/evaluate.js";
export { dgAsk, type AskArgs } from "./tools/ask.js";
export { dgCounterfactual, type CounterfactualArgs } from "./tools/counterfactual.js";
export { dgExport, type ExportArgs } from "./tools/export.js";
export { dgReplay, type ReplayArgs } from "./tools/replay.js";
export type { ToolInvocation, ToolResult, ToolOk, ToolHandler, ToolDefinition } from "./tools/types.js";
export { silentEmitter } from "./progress.js";
